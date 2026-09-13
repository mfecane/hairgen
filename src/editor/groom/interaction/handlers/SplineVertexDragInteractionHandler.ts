import { GROOM } from '@/constants'
import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { Vector3Data } from '@/editor/main/Project'
import { SplineVertexTransformEntry, SplineVertexTransformSnapshot } from '@/editor/groom/main/commands/GroomCommands'
import { GROUND_PLANE } from '@/editor/groom/main/GroomPlanes'
import { SCALP_SPHERE } from '@/editor/groom/main/GroomScalp'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import {
	getSplineBodyVertices,
	getSplineVertexDirections,
	getSplineVertexScales,
	updateSplineBodyGeometry,
} from '@/editor/groom/main/SplineBodyGeometry'
import { computeSmoothModifyWeights } from '@/editor/groom/main/SplineSmoothModifyFalloff'
import { tryGetSplineVertex } from '@/editor/groom/main/SplineVertexRef'
import { Object3D, Vector3 } from 'three'

/** Index of the spline's first vertex - constrained to the scalp sphere surface instead of the screen-space plane every other vertex uses (see the class doc). */
const FIRST_VERTEX_INDEX = 0

function toVector3Data(vector: Vector3): Vector3Data {
	return { x: vector.x, y: vector.y, z: vector.z }
}

function snapshotsEqual(a: SplineVertexTransformSnapshot, b: SplineVertexTransformSnapshot): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

interface NeighborMoveState {
	weight: number
	beforePosition: Vector3
	before: SplineVertexTransformSnapshot
}

/**
 * Drags a selected spline's vertex handle (see SplineVertexWidget) to reposition it - and activates
 * that vertex's rotate/scale gizmo (see SplineVertexGizmo). Vertex 0 is constrained to the scalp
 * sphere surface (a raw intersectSphere raycast, falling back to the ground plane when the ray
 * misses it - the same technique PlaceSplineInteractionHandler already uses, with no grab-offset
 * preservation: the vertex tracks the raycast hit exactly, guaranteeing it always stays on the
 * sphere). Every other vertex moves in 3D within a screen-facing plane through it
 * (InteractionContext.intersectViewPlane) - "in screen space aligned to current view" - using the
 * same grab-offset lifecycle as HairCardResizeInteractionHandler: the offset between the vertex's
 * exact position and the plane point under the cursor at MoveStart is fixed for the whole gesture
 * (the plane itself stays fixed too, since camera orbit is disabled for the gesture's duration), so
 * every Move step re-derives an absolute position instead of accumulating drift. Always active
 * alongside SplineSelectTool (see GroomEditorController), independent of whichever tool the toolbar
 * has active. With soft selection enabled, nearby vertices receive the same position delta scaled
 * by computeSmoothModifyWeights.
 */
export class SplineVertexDragInteractionHandler implements InteractionHandler {
	public id: string = 'splineVertexDrag'

	public priority: number = 70

	public enabled: boolean = true

	private splineId: string | null = null

	private vertexIndex: number | null = null

	private before: SplineVertexTransformSnapshot | null = null

	private beforePosition: Vector3 | null = null

	/** The vertex's offset from the drag plane's point under the cursor at MoveStart - only used for non-first vertices, see the class doc. Fixed for the gesture, every Move step re-derives an absolute position from it instead of accumulating error. */
	private grabOffset: Vector3 | null = null

	/** The fixed point the screen-space drag plane passes through for the whole gesture (the vertex's own MoveStart position) - only used for non-first vertices. */
	private planeAnchor: Vector3 | null = null

	private smoothModifyEnabled: boolean = false

	private neighbors: Map<number, NeighborMoveState> | null = null

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
			// Only a position handle hit starts a drag - the rotate ring/scale handle have their own
			// handlers, and anything else (e.g. the body rod) is SplineSelectionInteractionHandler's
			// click-to-select gesture instead.
			const hitObject = event.context.hitResult?.object ?? null
			const tag = hitObject ? tryGetSplineVertex(hitObject) : null
			if (!tag || tag.kind !== 'position' || tag.splineId !== selectedObjectId) {
				return new InteractionHandlerResult().setPass()
			}
			const vertex = getSplineBodyVertices(object)[tag.vertexIndex]
			if (!vertex) {
				return new InteractionHandlerResult().setPass()
			}

			// Resolve the drag's starting point (and bail if it can't be resolved) BEFORE snapshotting
			// or mutating anything - readSnapshot below must see the vertex's true pre-drag position,
			// not one already snapped to the first Move-equivalent point.
			let startPoint: Vector3 | null
			if (tag.vertexIndex === FIRST_VERTEX_INDEX) {
				startPoint = event.context.intersectSphere(SCALP_SPHERE) ?? event.context.intersectPlane(GROUND_PLANE)
			} else {
				this.planeAnchor = vertex.clone()
				startPoint = event.context.intersectViewPlane(this.planeAnchor)
			}
			if (!startPoint) {
				this.planeAnchor = null
				return new InteractionHandlerResult().setPass()
			}

			this.splineId = selectedObjectId
			this.vertexIndex = tag.vertexIndex
			this.before = this.readSnapshot(object, tag.vertexIndex, vertex)
			this.beforePosition = vertex.clone()

			const spline = this.viewport.editor.project.scene.get(selectedObjectId)
			this.smoothModifyEnabled = spline?.smoothModifyEnabled ?? false
			this.neighbors =
				this.smoothModifyEnabled && spline
					? this.captureNeighbors(object, getSplineBodyVertices(object), tag.vertexIndex, spline.influence)
					: null

			if (tag.vertexIndex === FIRST_VERTEX_INDEX) {
				this.applyPosition(object, startPoint)
			} else {
				this.grabOffset = vertex.clone().sub(startPoint)
			}
			this.rebuildBodyGeometry(object, selectedObjectId)

			this.viewport.editor.setActiveSplineVertex(tag.vertexIndex)
			this.viewport.controls.enabled = false
			return new InteractionHandlerResult().setCapture()
		}

		if (this.vertexIndex === null || !this.splineId) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.Move) {
			let nextPosition: Vector3 | null = null
			if (this.vertexIndex === FIRST_VERTEX_INDEX) {
				nextPosition =
					event.context.intersectSphere(SCALP_SPHERE) ?? event.context.intersectPlane(GROUND_PLANE)
			} else if (this.planeAnchor && this.grabOffset) {
				const point = event.context.intersectViewPlane(this.planeAnchor)
				if (point) {
					nextPosition = point.add(this.grabOffset)
				}
			}
			if (nextPosition) {
				this.applyPosition(object, nextPosition)
				this.rebuildBodyGeometry(object, selectedObjectId)
			}
			return new InteractionHandlerResult().setHandled()
		}

		// MoveEnd
		const entries: SplineVertexTransformEntry[] = []
		const vertex = getSplineBodyVertices(object)[this.vertexIndex]
		if (vertex && this.before) {
			const after = this.readSnapshot(object, this.vertexIndex, vertex)
			if (!snapshotsEqual(this.before, after)) {
				entries.push({ vertexIndex: this.vertexIndex, before: this.before, after })
			}
		}
		this.neighbors?.forEach((neighbor, neighborIndex) => {
			const neighborPosition = getSplineBodyVertices(object)[neighborIndex]
			if (!neighborPosition) {
				return
			}
			const after = this.readSnapshot(object, neighborIndex, neighborPosition)
			if (!snapshotsEqual(neighbor.before, after)) {
				entries.push({ vertexIndex: neighborIndex, before: neighbor.before, after })
			}
		})
		if (entries.length > 0) {
			if (this.smoothModifyEnabled) {
				this.viewport.editor.commitTransformSplineVertices(this.splineId, entries)
			} else {
				const [entry] = entries
				this.viewport.editor.commitTransformSplineVertex(this.splineId, entry.vertexIndex, entry.before, entry.after)
			}
		}
		this.splineId = null
		this.vertexIndex = null
		this.before = null
		this.beforePosition = null
		this.grabOffset = null
		this.planeAnchor = null
		this.smoothModifyEnabled = false
		this.neighbors = null
		this.viewport.controls.enabled = true
		return new InteractionHandlerResult().setReleaseCapture()
	}

	private applyPosition(object: Object3D, nextPosition: Vector3): void {
		if (this.vertexIndex === null || !this.beforePosition) {
			throw new Error('SplineVertexDragInteractionHandler: drag position state is incomplete')
		}
		const vertices = getSplineBodyVertices(object)
		const vertex = vertices[this.vertexIndex]
		if (!vertex) {
			throw new Error(`SplineVertexDragInteractionHandler: no vertex ${this.vertexIndex}`)
		}
		const delta = nextPosition.clone().sub(this.beforePosition)
		vertex.copy(nextPosition)
		this.neighbors?.forEach((neighbor, neighborIndex) => {
			const neighborPosition = vertices[neighborIndex]
			if (neighborPosition) {
				neighborPosition.copy(neighbor.beforePosition).addScaledVector(delta, neighbor.weight)
			}
		})
	}

	private captureNeighbors(
		object: Object3D,
		vertices: Vector3[],
		draggedIndex: number,
		influence: number
	): Map<number, NeighborMoveState> | null {
		const weights = computeSmoothModifyWeights(vertices, draggedIndex, influence)
		if (weights.size === 0) {
			return null
		}
		const neighbors = new Map<number, NeighborMoveState>()
		weights.forEach((weight, neighborIndex) => {
			const position = vertices[neighborIndex]
			if (!position) {
				return
			}
			neighbors.set(neighborIndex, {
				weight,
				beforePosition: position.clone(),
				before: this.readSnapshot(object, neighborIndex, position),
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

	/** Position from the live `vertex`, direction/scale from the live per-vertex arrays (unchanged by this handler, but part of the unified snapshot - see SplineVertexTransformSnapshot). */
	private readSnapshot(object: Object3D, vertexIndex: number, vertex: Vector3): SplineVertexTransformSnapshot {
		const direction = getSplineVertexDirections(object)[vertexIndex]
		const scale = getSplineVertexScales(object)[vertexIndex]
		return {
			position: toVector3Data(vertex),
			direction: direction ? toVector3Data(direction) : GROOM.SPLINE.DEFAULT_VERTEX_DIRECTION,
			scale: scale ?? GROOM.SPLINE.DEFAULT_VERTEX_SCALE,
		}
	}
}
