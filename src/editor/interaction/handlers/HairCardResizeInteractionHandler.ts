import { HAIR_CARD } from '@/constants'
import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { HairCardHandle, tryGetHairCardHandle } from '@/editor/main/HairCardHandleRef'
import { clampToWorkingArea } from '@/editor/main/HairCardWorkingArea'
import { Viewport } from '@/editor/main/Viewport'
import { Object3D } from 'three'

interface ResizeSnapshot {
	x: number
	y: number
	width: number
	depth: number
}

function snapshotsEqual(a: ResizeSnapshot, b: ResizeSnapshot): boolean {
	return a.x === b.x && a.y === b.y && a.width === b.width && a.depth === b.depth
}

/**
 * Drags one of a selected hair card's handles (see HairCardWidget) to resize it: a corner handle
 * keeps the opposite corner fixed and drives both width and depth; a side handle keeps the
 * opposite edge fixed and drives only its own axis, leaving the other dimension untouched (see
 * HAIR_CARD_HANDLES). Corners stay right angles by construction, since width/depth are independent
 * scalars, not free points. Tracks the cursor's own world-space position each Move event (via
 * InteractionContext.intersectCardPlane), preserving the offset between where the drag started
 * and the handle's exact edge/corner - rather than scaling screen-pixel deltas by a fixed
 * sensitivity constant, which drifts out of sync with the cursor as soon as zoom/distance isn't
 * whatever it was tuned for. Always active alongside SelectTool (see HairCardTool). Runs at higher
 * priority than HairCardMoveInteractionHandler so a handle hit is claimed here first, never
 * mistaken for a card-body drag.
 */
export class HairCardResizeInteractionHandler implements InteractionHandler {
	public id: string = 'hairCardResize'

	public priority: number = 70

	public enabled: boolean = true

	private cardId: string | null = null

	private handle: HairCardHandle | null = null

	private before: ResizeSnapshot | null = null

	/** The dragged handle's exact edge/corner position, minus the card-plane point under the cursor at MoveStart - fixed for the gesture, so a Move step reproduces the same grab point rather than snapping the edge to wherever the (larger, see HairCardWidget) collider happened to be clicked. */
	private grabOffset: { x: number; y: number } | null = null

	public constructor(private readonly viewport: Viewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		if (
			!this.enabled ||
			(event.type !== CanvasEventType.MoveStart &&
				event.type !== CanvasEventType.Move &&
				event.type !== CanvasEventType.MoveEnd)
		) {
			return false
		}
		const { selectedObjectId, selectedObjectIds } = this.viewport.editor.reactBridge.getState()
		if (selectedObjectIds.size !== 1 || !selectedObjectId) {
			return false
		}
		return this.viewport.editor.project.scene.get(selectedObjectId)?.type === 'hairCard'
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const { selectedObjectId } = this.viewport.editor.reactBridge.getState()
		const object = selectedObjectId ? this.viewport.getSceneObject3D(selectedObjectId) : null
		if (!object || !selectedObjectId) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.MoveStart) {
			const hitObject = event.context.hitResult?.object ?? null
			const tag = hitObject ? tryGetHairCardHandle(hitObject) : null
			if (!tag || tag.cardId !== selectedObjectId) {
				return new InteractionHandlerResult().setPass()
			}
			const startPoint = event.context.intersectCardPlane()
			if (!startPoint) {
				return new InteractionHandlerResult().setPass()
			}

			this.cardId = selectedObjectId
			this.handle = tag.handle
			this.before = this.readSnapshot(object)
			const handleX = this.before.x + tag.handle.signX * (this.before.width / 2)
			const handleY = this.before.y + tag.handle.signY * (this.before.depth / 2)
			this.grabOffset = { x: handleX - startPoint.x, y: handleY - startPoint.y }
			// Hidden for the duration of the drag rather than recomputed every Move step - see
			// HairCardStrandsController.
			this.viewport.editor.removeHairCardStrands(this.cardId)
			this.viewport.controls.enabled = false
			return new InteractionHandlerResult().setCapture()
		}

		if (!this.cardId || !this.handle || !this.before || !this.grabOffset) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.Move) {
			const point = event.context.intersectCardPlane()
			if (point) {
				this.applyDelta(object, point, this.handle, this.before, this.grabOffset)
			}
			return new InteractionHandlerResult().setHandled()
		}

		// MoveEnd
		const after = this.readSnapshot(object)
		if (!snapshotsEqual(this.before, after)) {
			this.viewport.editor.commitResizeHairCard(this.cardId, this.before, after)
		}
		// Debounced regardless of whether the size actually changed - a plain click (no drag) still
		// hid the strands above and must bring them back.
		this.viewport.editor.scheduleHairCardStrandsRegenerate(this.cardId)
		this.cardId = null
		this.handle = null
		this.before = null
		this.grabOffset = null
		this.viewport.controls.enabled = true
		return new InteractionHandlerResult().setReleaseCapture()
	}

	private readSnapshot(object: Object3D): ResizeSnapshot {
		return { x: object.position.x, y: object.position.y, width: object.scale.x, depth: object.scale.y }
	}

	/**
	 * Re-derives the dragged handle's edge/corner as an absolute position each step - the cursor's
	 * current card-plane point plus the fixed grab offset - clamped to the shared 0-1 working
	 * area (see WorkingAreaGrid), while the opposite edge (from the MoveStart snapshot) stays put:
	 * width/depth become the distance between the two edges, and the center becomes their midpoint.
	 * A side handle only runs the axis it owns (see HairCardHandle.axis), leaving the other
	 * dimension untouched. Working from the fixed MoveStart snapshot rather than incrementing the
	 * live object avoids accumulating error across many Move events, and stays correct even if the
	 * dragged edge crosses over the fixed one. Below HAIR_CARD.MIN_SIZE, that axis freezes - its
	 * edge stops following the pointer - rather than collapsing further.
	 */
	private applyDelta(
		object: Object3D,
		point: { x: number; y: number },
		handle: HairCardHandle,
		before: ResizeSnapshot,
		grabOffset: { x: number; y: number }
	): void {
		if (handle.axis === 'both' || handle.axis === 'x') {
			const fixedEdgeX = before.x - handle.signX * (before.width / 2)
			const movingEdgeX = clampToWorkingArea(point.x + grabOffset.x)
			const nextWidth = Math.abs(movingEdgeX - fixedEdgeX)
			if (nextWidth >= HAIR_CARD.MIN_SIZE) {
				object.position.x = (movingEdgeX + fixedEdgeX) / 2
				object.scale.x = nextWidth
			}
		}

		if (handle.axis === 'both' || handle.axis === 'y') {
			const fixedEdgeY = before.y - handle.signY * (before.depth / 2)
			const movingEdgeY = clampToWorkingArea(point.y + grabOffset.y)
			const nextDepth = Math.abs(movingEdgeY - fixedEdgeY)
			if (nextDepth >= HAIR_CARD.MIN_SIZE) {
				object.position.y = (movingEdgeY + fixedEdgeY) / 2
				object.scale.y = nextDepth
			}
		}

		object.scale.z = 1
	}
}
