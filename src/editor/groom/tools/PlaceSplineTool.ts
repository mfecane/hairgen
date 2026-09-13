import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { PlaceSplineInteractionHandler } from '@/editor/groom/interaction/handlers/PlaceSplineInteractionHandler'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { GroomTool, GroomToolContext } from '@/editor/groom/tools/GroomTool'

/** Toggleable single-click spline placement - see GroomEditorController.setActiveTool. Only meaningful for GroomViewport. */
export class PlaceSplineTool implements GroomTool {
	public readonly id: string = 'placeSpline'

	public activate(_context: GroomToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof GroomViewport)) {
			return []
		}
		return [new PlaceSplineInteractionHandler(host)]
	}
}
