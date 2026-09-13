import { GROOM } from '@/constants'
import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { Vector3Data } from '@/editor/main/Project'
import { SplineVertexTransformEntry, SplineVertexTransformSnapshot } from '@/editor/groom/main/commands/GroomCommands'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import {
	getSplineBodyVertices,
	getSplineVertexDirections,
	getSplineVertexScales,
	updateSplineBodyGeometry,
} from '@/editor/groom/main/SplineBodyGeometry'
import { computeSmoothModifyWeights } from '@/editor/groom/main/SplineSmoothModifyFalloff'
import { getVertexGizmoFrame } from '@/editor/groom/main/SplineVertexFrame'
import { tryGetSplineVertex } from '@/editor/groom/main/SplineVertexRef'
import { Object3D, Vector3 } from 'three'

function toVector3Data(vector: Vector3): Vector3Data {
	return { x: vector.x, y: vector.y, z: vector.z }
}

function snapshotsEqual(a: SplineVertexTransformSnapshot, b: SplineVertexTransformSnapshot): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

/** One neighbor vertex a "smooth modify" scale drag also resizes - see computeSmoothModifyWeights/onEvent's MoveStart. */
interface NeighborScaleState {
	weight: number
	beforeScale: number
	before: SplineVertexTransformSnapshot
}

/**
 * Drags a selected spline's active vertex's scale handle (see SplineVertexGizmo) along its own
 * (tangent-perpendicular) axis to change its `scale` - a single-axis manipulator, "normal to spline,
 * aligned with the vertex's recorded rotation" (SplineVertexFrame). Same grab-offset lifecycle as
 * HairCardResizeInteractionHandler/SplineVertexDragInteractionHandler: the offset between the
 * vertex's exact scale and the axis-projected distance under the cursor at MoveStart is fixed for
 * the whole gesture (the axis/vertex position are fixed too, the vertex doesn't move during a scale
 * drag), so every Move step re-derives an absolute scale instead of accumulating drift. Always
 * active alongside SplineSelectTool (see GroomEditorController's vertexDragTool), independent of
 * whichever tool the toolbar has active.
 */
export class SplineVertexScaleInteractionHandler implements InteractionHandler {
	public id: string = 'splineVertexScale'

	public priority: number = 70

	public enabled: boolean = true

	private splineId: string | null = null

	private vertexIndex: number | null = null

	private before: SplineVertexTransformSnapshot | null = null

	private vertexPosition: Vector3 | null = null

	private axis: Vector3 | null = null

	/** currentScale - axis-projected distance under the cursor at MoveStart, fixed for the gesture. */
	private grabOffset: number = 0

	/** Captured once at MoveStart from the dragged spline's own `smoothModifyEnabled` - see the class doc's "off" behavior guarantee. */
	private smoothModifyEnabled: boolean = false

	/** Non-null only while smoothModifyEnabled and at least one neighbor fell within the falloff radius. */
	private neighbors: Map<number, NeighborScaleState> | null = null

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		if (
			!this.enabled ||
			(event.type !== CanvasEventType.MoveStart &&
				event.type !== CanvasEventType.Move &&
				event.type !== CanvasEventType.MoveEnd)
		) {
			return false
		}
		const { selectedObjectIds } = this.viewport.editor.reactBridge.getState()
		return selectedObjectIds.size === 1
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const { selectedObjectId } = this.viewport.editor.reactBridge.getState()
		const object = selectedObjectId ? this.viewport.getSplineObject3D(selectedObjectId) : null
		if (!object || !selectedObjectId) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.MoveStart) {
			const hitObject = event.context.hitResult?.object ?? null
			const tag = hitObject ? tryGetSplineVertex(hitObject) : null
			if (!tag || tag.kind !== 'scale' || tag.splineId !== selectedObjectId) {
				return new InteractionHandlerResult().setPass()
			}
			const vertices = getSplineBodyVertices(object)
			const vertexPosition = vertices[tag.vertexIndex]
			const storedDirection = getSplineVertexDirections(object)[tag.vertexIndex]
			if (!vertexPosition || !storedDirection) {
				return new InteractionHandlerResult().setPass()
			}
			const frame = getVertexGizmoFrame(vertices, tag.vertexIndex, storedDirection)
			if (!frame) {
				return new InteractionHandlerResult().setPass()
			}
			const grabPoint = event.context.intersectAxisPlane(vertexPosition, frame.axis)
			if (!grabPoint) {
				return new InteractionHandlerResult().setPass()
			}
			const currentScale = getSplineVertexScales(object)[tag.vertexIndex] ?? GROOM.SPLINE.DEFAULT_VERTEX_SCALE
			const grabDistance = frame.axis.dot(grabPoint.clone().sub(vertexPosition))

			this.splineId = selectedObjectId
			this.vertexIndex = tag.vertexIndex
			this.vertexPosition = vertexPosition.clone()
			this.axis = frame.axis
			this.grabOffset = currentScale - grabDistance
			this.before = {
				position: toVector3Data(vertexPosition),
				direction: toVector3Data(storedDirection),
				scale: currentScale,
			}

			const spline = this.viewport.editor.project.scene.get(selectedObjectId)
			this.smoothModifyEnabled = spline?.smoothModifyEnabled ?? false
			this.neighbors = this.smoothModifyEnabled && spline ? this.captureNeighbors(object, vertices, tag.vertexIndex, spline.influence) : null

			this.viewport.editor.setActiveSplineVertex(tag.vertexIndex)
			this.viewport.controls.enabled = false
			return new InteractionHandlerResult().setCapture()
		}

		if (this.vertexIndex === null || !this.splineId || !this.vertexPosition || !this.axis) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.Move) {
			const point = event.context.intersectAxisPlane(this.vertexPosition, this.axis)
			if (point && this.before) {
				const distance = this.axis.dot(point.clone().sub(this.vertexPosition))
				const nextScale = Math.min(
					GROOM.SPLINE.MAX_VERTEX_SCALE,
					Math.max(GROOM.SPLINE.MIN_VERTEX_SCALE, distance + this.grabOffset)
				)
				const scales = getSplineVertexScales(object)
				const delta = nextScale - this.before.scale
				scales[this.vertexIndex] = nextScale
				this.neighbors?.forEach((neighbor, neighborIndex) => {
					scales[neighborIndex] = Math.min(
						GROOM.SPLINE.MAX_VERTEX_SCALE,
						Math.max(GROOM.SPLINE.MIN_VERTEX_SCALE, neighbor.beforeScale + delta * neighbor.weight)
					)
				})
				this.rebuildBodyGeometry(object, this.splineId)
			}
			return new InteractionHandlerResult().setHandled()
		}

		// MoveEnd
		const entries: SplineVertexTransformEntry[] = []
		const vertexPosition = getSplineBodyVertices(object)[this.vertexIndex]
		const direction = getSplineVertexDirections(object)[this.vertexIndex]
		const scale = getSplineVertexScales(object)[this.vertexIndex]
		if (vertexPosition && direction && scale !== undefined && this.before) {
			const after: SplineVertexTransformSnapshot = {
				position: toVector3Data(vertexPosition),
				direction: toVector3Data(direction),
				scale,
			}
			if (!snapshotsEqual(this.before, after)) {
				entries.push({ vertexIndex: this.vertexIndex, before: this.before, after })
			}
		}
		this.neighbors?.forEach((neighbor, neighborIndex) => {
			const neighborPosition = getSplineBodyVertices(object)[neighborIndex]
			const neighborDirection = getSplineVertexDirections(object)[neighborIndex]
			const neighborScale = getSplineVertexScales(object)[neighborIndex]
			if (!neighborPosition || !neighborDirection || neighborScale === undefined) {
				return
			}
			const after: SplineVertexTransformSnapshot = {
				position: toVector3Data(neighborPosition),
				direction: toVector3Data(neighborDirection),
				scale: neighborScale,
			}
			if (!snapshotsEqual(neighbor.before, after)) {
				entries.push({ vertexIndex: neighborIndex, before: neighbor.before, after })
			}
		})
		if (entries.length > 0) {
			if (this.smoothModifyEnabled) {
				this.viewport.editor.commitTransformSplineVertices(this.splineId, entries)
			} else {
				// Smooth modify off => this.neighbors was never populated => entries has exactly the
				// dragged vertex's own entry, same call this handler always made before falloff existed.
				const [entry] = entries
				this.viewport.editor.commitTransformSplineVertex(this.splineId, entry.vertexIndex, entry.before, entry.after)
			}
		}
		this.splineId = null
		this.vertexIndex = null
		this.before = null
		this.vertexPosition = null
		this.axis = null
		this.grabOffset = 0
		this.smoothModifyEnabled = false
		this.neighbors = null
		this.viewport.controls.enabled = true
		return new InteractionHandlerResult().setReleaseCapture()
	}

	/** Rebuilds the spline's curve geometry from its live vertex arrays - see SplineBodyGeometry.updateSplineBodyGeometry. */
	private rebuildBodyGeometry(object: Object3D, splineId: string): void {
		const spline = this.viewport.editor.project.scene.get(splineId)
		if (spline) {
			updateSplineBodyGeometry(
				object,
				spline.resolution,
				spline.cardStartOffset,
				spline.cardWidth,
				this.viewport.editor.hairCardLookup.getCardUvRect(spline.hairCardId)
			)
		}
	}

	/** Captures every neighbor a smooth-modify scale drag on `draggedIndex` should also resize - see computeSmoothModifyWeights and the class doc's NeighborScaleState. */
	private captureNeighbors(
		object: Object3D,
		vertices: Vector3[],
		draggedIndex: number,
		influence: number
	): Map<number, NeighborScaleState> | null {
		const weights = computeSmoothModifyWeights(vertices, draggedIndex, influence)
		if (weights.size === 0) {
			return null
		}
		const directions = getSplineVertexDirections(object)
		const scales = getSplineVertexScales(object)
		const neighbors = new Map<number, NeighborScaleState>()
		weights.forEach((weight, neighborIndex) => {
			const neighborPosition = vertices[neighborIndex]
			const neighborDirection = directions[neighborIndex]
			const neighborScale = scales[neighborIndex]
			if (!neighborPosition || !neighborDirection || neighborScale === undefined) {
				return
			}
			neighbors.set(neighborIndex, {
				weight,
				beforeScale: neighborScale,
				before: {
					position: toVector3Data(neighborPosition),
					direction: toVector3Data(neighborDirection),
					scale: neighborScale,
				},
			})
		})
		return neighbors.size > 0 ? neighbors : null
	}
}
