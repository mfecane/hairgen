import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { SplineHoverInteractionHandler } from '@/editor/groom/interaction/handlers/SplineHoverInteractionHandler'
import { SplineVertexDragInteractionHandler } from '@/editor/groom/interaction/handlers/SplineVertexDragInteractionHandler'
import { SplineVertexRotateInteractionHandler } from '@/editor/groom/interaction/handlers/SplineVertexRotateInteractionHandler'
import { SplineVertexScaleInteractionHandler } from '@/editor/groom/interaction/handlers/SplineVertexScaleInteractionHandler'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { GroomTool, GroomToolContext } from '@/editor/groom/tools/GroomTool'

/** A selected spline's vertex position/rotate/scale gizmo, always active - mirrors HairCardTool. Only meaningful for GroomViewport. */
export class SplineVertexDragTool implements GroomTool {
	public readonly id: string = 'splineVertexDrag'

	public activate(_context: GroomToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof GroomViewport)) {
			return []
		}
		return [
			new SplineVertexDragInteractionHandler(host),
			new SplineVertexRotateInteractionHandler(host),
			new SplineVertexScaleInteractionHandler(host),
			new SplineHoverInteractionHandler(host),
		]
	}
}
