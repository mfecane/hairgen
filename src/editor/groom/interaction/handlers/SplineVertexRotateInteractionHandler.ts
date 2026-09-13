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
import { Object3D, Plane, Vector3 } from 'three'

function toVector3Data(vector: Vector3): Vector3Data {
	return { x: vector.x, y: vector.y, z: vector.z }
}

function snapshotsEqual(a: SplineVertexTransformSnapshot, b: SplineVertexTransformSnapshot): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

/** One neighbor vertex a "smooth modify" rotate drag also spins - see computeSmoothModifyWeights/onEvent's MoveStart. `axis`/`tangent` are the neighbor's OWN gizmo frame (getVertexGizmoFrame), captured once since it doesn't move during the gesture - rotating a neighbor's `direction` around its own tangent, not a copy of the dragged vertex's world-space rotation, is what keeps the result physically sensible. */
interface NeighborRotateState {
	weight: number
	axis: Vector3
	tangent: Vector3
	before: SplineVertexTransformSnapshot
}

/**
 * Drags a selected spline's active vertex's rotate ring (see SplineVertexGizmo) to spin its
 * `direction` around the vertex's tangent axis (SplineVertexFrame - "tangent to curve"). The ring's
 * plane (normal = tangent, through the vertex's position) and the vertex's gizmo frame (tangent +
 * in-plane axis) are both fixed for the whole gesture at MoveStart - the vertex doesn't move during
 * a rotate drag, so nothing about the frame needs re-deriving on every Move. The drag angle is
 * measured against that frame's own basis (axisA = the frame's axis, axisB = tangent × axisA), so
 * `direction` always lands exactly where the ring visually points. Always active alongside
 * SplineSelectTool (see GroomEditorController's vertexDragTool), independent of whichever tool the
 * toolbar has active.
 */
export class SplineVertexRotateInteractionHandler implements InteractionHandler {
	public id: string = 'splineVertexRotate'

	public priority: number = 70

	public enabled: boolean = true

	private splineId: string | null = null

	private vertexIndex: number | null = null

	private before: SplineVertexTransformSnapshot | null = null

	private vertexPosition: Vector3 | null = null

	private tangent: Vector3 | null = null

	private axisA: Vector3 | null = null

	private axisB: Vector3 | null = null

	private rotationPlane: Plane | null = null

	private grabAngle: number = 0

	/** Captured once at MoveStart from the dragged spline's own `smoothModifyEnabled` - see the class doc's "off" behavior guarantee. */
	private smoothModifyEnabled: boolean = false

	/** Non-null only while smoothModifyEnabled and at least one neighbor fell within the falloff radius. */
	private neighbors: Map<number, NeighborRotateState> | null = null

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
			if (!tag || tag.kind !== 'rotate' || tag.splineId !== selectedObjectId) {
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
			const rotationPlane = new Plane().setFromNormalAndCoplanarPoint(frame.tangent, vertexPosition)
			const grabPoint = event.context.intersectPlane(rotationPlane)
			if (!grabPoint) {
				return new InteractionHandlerResult().setPass()
			}
			const grabVec = grabPoint.clone().sub(vertexPosition)

			this.splineId = selectedObjectId
			this.vertexIndex = tag.vertexIndex
			this.vertexPosition = vertexPosition.clone()
			this.tangent = frame.tangent
			this.axisA = frame.axis
			this.axisB = frame.axisB
			this.rotationPlane = rotationPlane
			this.grabAngle = Math.atan2(grabVec.dot(frame.axisB), grabVec.dot(frame.axis))
			this.before = this.readSnapshot(object, tag.vertexIndex, vertexPosition, storedDirection)

			const spline = this.viewport.editor.project.scene.get(selectedObjectId)
			this.smoothModifyEnabled = spline?.smoothModifyEnabled ?? false
			this.neighbors = this.smoothModifyEnabled && spline ? this.captureNeighbors(object, vertices, tag.vertexIndex, spline.influence) : null

			this.viewport.editor.setActiveSplineVertex(tag.vertexIndex)
			this.viewport.controls.enabled = false
			return new InteractionHandlerResult().setCapture()
		}

		if (
			this.vertexIndex === null ||
			!this.splineId ||
			!this.tangent ||
			!this.axisA ||
			!this.axisB ||
			!this.rotationPlane
		) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.Move) {
			const point = event.context.intersectPlane(this.rotationPlane)
			if (point && this.vertexPosition) {
				const vec = point.clone().sub(this.vertexPosition)
				const angle = Math.atan2(vec.dot(this.axisB), vec.dot(this.axisA))
				const delta = angle - this.grabAngle
				const newDirection = this.axisA.clone().applyAxisAngle(this.tangent, delta)
				const directions = getSplineVertexDirections(object)
				directions[this.vertexIndex]?.copy(newDirection)
				this.neighbors?.forEach((neighbor, neighborIndex) => {
					const neighborDirection = directions[neighborIndex]
					neighborDirection?.copy(neighbor.axis.clone().applyAxisAngle(neighbor.tangent, delta * neighbor.weight))
				})
				this.rebuildBodyGeometry(object, this.splineId)
			}
			// A null point (camera looking straight down the tangent) simply leaves direction as-is
			// until the view angle changes - inherent to any ring-in-a-plane rotate gizmo.
			return new InteractionHandlerResult().setHandled()
		}

		// MoveEnd
		const entries: SplineVertexTransformEntry[] = []
		const vertexPosition = getSplineBodyVertices(object)[this.vertexIndex]
		const direction = getSplineVertexDirections(object)[this.vertexIndex]
		if (vertexPosition && direction && this.before) {
			const after = this.readSnapshot(object, this.vertexIndex, vertexPosition, direction)
			if (!snapshotsEqual(this.before, after)) {
				entries.push({ vertexIndex: this.vertexIndex, before: this.before, after })
			}
		}
		this.neighbors?.forEach((neighbor, neighborIndex) => {
			const neighborPosition = getSplineBodyVertices(object)[neighborIndex]
			const neighborDirection = getSplineVertexDirections(object)[neighborIndex]
			if (!neighborPosition || !neighborDirection) {
				return
			}
			const after = this.readSnapshot(object, neighborIndex, neighborPosition, neighborDirection)
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
		this.tangent = null
		this.axisA = null
		this.axisB = null
		this.rotationPlane = null
		this.grabAngle = 0
		this.smoothModifyEnabled = false
		this.neighbors = null
		this.viewport.controls.enabled = true
		return new InteractionHandlerResult().setReleaseCapture()
	}

	/** Captures every neighbor a smooth-modify rotate drag on `draggedIndex` should also spin - see computeSmoothModifyWeights and the class doc's NeighborRotateState. */
	private captureNeighbors(
		object: Object3D,
		vertices: Vector3[],
		draggedIndex: number,
		influence: number
	): Map<number, NeighborRotateState> | null {
		const weights = computeSmoothModifyWeights(vertices, draggedIndex, influence)
		if (weights.size === 0) {
			return null
		}
		const directions = getSplineVertexDirections(object)
		const neighbors = new Map<number, NeighborRotateState>()
		weights.forEach((weight, neighborIndex) => {
			const neighborPosition = vertices[neighborIndex]
			const neighborDirection = directions[neighborIndex]
			if (!neighborPosition || !neighborDirection) {
				return
			}
			const neighborFrame = getVertexGizmoFrame(vertices, neighborIndex, neighborDirection)
			if (!neighborFrame) {
				return
			}
			neighbors.set(neighborIndex, {
				weight,
				axis: neighborFrame.axis,
				tangent: neighborFrame.tangent,
				before: this.readSnapshot(object, neighborIndex, neighborPosition, neighborDirection),
			})
		})
		return neighbors.size > 0 ? neighbors : null
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

	private readSnapshot(
		object: Object3D,
		vertexIndex: number,
		position: Vector3,
		direction: Vector3
	): SplineVertexTransformSnapshot {
		const scale = getSplineVertexScales(object)[vertexIndex]
		return {
			position: toVector3Data(position),
			direction: toVector3Data(direction),
			scale: scale ?? GROOM.SPLINE.DEFAULT_VERTEX_SCALE,
		}
	}
}
