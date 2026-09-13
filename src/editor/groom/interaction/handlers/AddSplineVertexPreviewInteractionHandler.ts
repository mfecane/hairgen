import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { Vector3 } from 'three'

/**
 * Live-previews AddPointButton's "add point" gesture: while "addVertex" mode is armed, every Hover
 * event appends a temporary vertex to the selected spline's live mesh (GroomViewport.previewAddVertex)
 * at the cursor's raycast point on the same view-plane-through-anchor
 * AddSplineVertexInteractionHandler's commit click uses - so the curve visibly extends toward the
 * cursor before that click. `CanvasEventHandler.onPointerLeave` dispatches Hover with x=y=-1 without
 * re-raycasting, so that's treated as "clear the preview" rather than raycast at a meaningless point.
 * Always setPass()es - a pure visual side effect, never consumes the event (SplineHoverInteractionHandler
 * still needs to run for handle-hover highlighting).
 */
export class AddSplineVertexPreviewInteractionHandler implements InteractionHandler {
	public id: string = 'addSplineVertexPreview'

	public priority: number = 60

	public enabled: boolean = true

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Hover
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const { editor } = this.viewport
		const { selectedObjectIds } = editor.reactBridge.getState()
		const anchorPosition = editor.getAddVertexAnchorPosition()
		if (selectedObjectIds.size !== 1 || !anchorPosition) {
			return new InteractionHandlerResult().setPass()
		}

		const splineId = [...selectedObjectIds][0]
		const isLeave = event.x === -1 && event.y === -1
		const point = isLeave
			? null
			: event.context.intersectViewPlane(new Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z))
		this.viewport.previewAddVertex(splineId, point)
		return new InteractionHandlerResult().setPass()
	}
}
