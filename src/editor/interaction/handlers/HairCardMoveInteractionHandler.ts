import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { clampHairCardCenter } from '@/editor/main/HairCardWorkingArea'
import { tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { Viewport } from '@/editor/main/Viewport'

/**
 * Drags a selected hair card's body (its collider mesh - see EditorController.hairCardMaterial) to
 * translate it within the z = 0 plane. Tracks the cursor's own world-space position each Move
 * event (via InteractionContext.intersectCardPlane), preserving the offset between where the
 * drag started and the card's center, rather than scaling screen-pixel deltas by a fixed
 * sensitivity constant - the latter drifts out of sync with the cursor as soon as zoom/distance
 * isn't whatever it was tuned for. Always active alongside SelectTool (see HairCardTool). Runs at
 * lower priority than HairCardResizeInteractionHandler so a handle drag is claimed there first.
 */
export class HairCardMoveInteractionHandler implements InteractionHandler {
	public id: string = 'hairCardMove'

	public priority: number = 60

	public enabled: boolean = true

	private cardId: string | null = null

	private before: { x: number; y: number } | null = null

	/** The card's offset from the card-plane point under the cursor at MoveStart, fixed for the gesture - every Move step re-derives an absolute position from it instead of accumulating error. */
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

		console.log('event', event)

		if (!object || !selectedObjectId) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.MoveStart) {
			// Only the card's own body starts a move - a handle hit is resize's gesture, already
			// claimed by HairCardResizeInteractionHandler's higher priority by the time this handler
			// would otherwise see it.
			const hitObject = event.context.hitResult?.object ?? null
			const hitObjectId = hitObject ? tryGetSceneObjectId(hitObject) : null
			if (hitObjectId !== selectedObjectId) {
				return new InteractionHandlerResult().setPass()
			}

			const startPoint = event.context.intersectCardPlane()
			if (!startPoint) {
				return new InteractionHandlerResult().setPass()
			}

			this.cardId = selectedObjectId
			this.before = { x: object.position.x, y: object.position.y }
			this.grabOffset = { x: object.position.x - startPoint.x, y: object.position.y - startPoint.y }
			// Hidden for the duration of the drag rather than recomputed every Move step - see
			// HairCardStrandsController.
			this.viewport.editor.removeHairCardStrands(this.cardId)
			// OrbitControls listens to raw DOM pointer events on its own, outside the router's
			// capture mechanism, so it must be disabled explicitly for the drag.
			this.viewport.controls.enabled = false
			return new InteractionHandlerResult().setCapture()
		}

		if (!this.cardId || !this.grabOffset) {
			return new InteractionHandlerResult().setPass()
		}

		if (event.type === CanvasEventType.Move) {
			const point = event.context.intersectCardPlane()
			if (point) {
				// Clamped to the shared 0-1 working area every card is laid out inside - see
				// WorkingAreaGrid.
				object.position.x = clampHairCardCenter(point.x + this.grabOffset.x, object.scale.x)
				object.position.y = clampHairCardCenter(point.y + this.grabOffset.y, object.scale.y)
			}
			return new InteractionHandlerResult().setHandled()
		}

		// MoveEnd
		if (this.before) {
			const after = { x: object.position.x, y: object.position.y }
			if (after.x !== this.before.x || after.y !== this.before.y) {
				this.viewport.editor.commitMoveHairCard(this.cardId, this.before, after)
			}
		}
		// Debounced regardless of whether the position actually changed - a plain click (no drag)
		// still hid the strands above and must bring them back.
		this.viewport.editor.scheduleHairCardStrandsRegenerate(this.cardId)
		this.cardId = null
		this.before = null
		this.grabOffset = null
		this.viewport.controls.enabled = true
		return new InteractionHandlerResult().setReleaseCapture()
	}
}
