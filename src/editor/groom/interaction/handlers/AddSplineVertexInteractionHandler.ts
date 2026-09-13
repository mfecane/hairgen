import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { Vector3 } from 'three'

/** MouseEvent.button value for the primary ("left") button - mirrors PlaceSplineInteractionHandler. */
const ADD_VERTEX_BUTTON = 0

/**
 * Commits AddPointButton's two-click "add point" gesture: the button's own click arms "addVertex"
 * mode (GroomEditor.beginAddVertexToSelectedSpline/AddSplineVertexTool), which also captures the
 * anchor point (getAddVertexAnchorPosition) - the spline's current extrapolated next-vertex
 * position. This handler's click raycasts against the screen-facing plane through that anchor
 * (InteractionContext.intersectViewPlane - the same "drag in screen space aligned to the current
 * view" technique every other spline vertex's position drag already uses), not the scalp/ground
 * plane: the new point should land at the depth the user is looking at (where the anchor/button
 * appeared), not wherever a sphere/ground raycast happens to hit. Only present in the interaction
 * handler list while the "addVertex" tool is active (see GroomEditorController.getInteractionHandlers),
 * so it doesn't need to check the active tool itself; it runs above SplineSelectionInteractionHandler
 * so this click commits a point rather than (re)selecting whatever's under the cursor.
 */
export class AddSplineVertexInteractionHandler implements InteractionHandler {
	public id: string = 'addSplineVertex'

	public priority: number = 110

	public enabled: boolean = true

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Click && event.context.initiatingButton === ADD_VERTEX_BUTTON
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const { editor } = this.viewport
		const { selectedObjectIds } = editor.reactBridge.getState()
		const anchorPosition = editor.getAddVertexAnchorPosition()
		if (selectedObjectIds.size !== 1 || !anchorPosition) {
			editor.cancelAddVertexToSelectedSpline()
			return new InteractionHandlerResult().setHandled()
		}

		const point = event.context.intersectViewPlane(
			new Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z)
		)
		if (!point) {
			editor.cancelAddVertexToSelectedSpline()
			return new InteractionHandlerResult().setHandled()
		}

		const splineId = [...selectedObjectIds][0]
		editor.commitAddVertexAt(splineId, { x: point.x, y: point.y, z: point.z })
		return new InteractionHandlerResult().setHandled()
	}
}
