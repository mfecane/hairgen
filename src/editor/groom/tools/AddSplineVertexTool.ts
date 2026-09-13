import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { AddSplineVertexInteractionHandler } from '@/editor/groom/interaction/handlers/AddSplineVertexInteractionHandler'
import { AddSplineVertexPreviewInteractionHandler } from '@/editor/groom/interaction/handlers/AddSplineVertexPreviewInteractionHandler'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { GroomTool, GroomToolContext } from '@/editor/groom/tools/GroomTool'

/**
 * Toggled on by AddPointButton's click, toggled back off by AddSplineVertexInteractionHandler's -
 * see GroomEditor.beginAddVertexToSelectedSpline. Unlike PlaceSplineTool (a persistent GroomToolbar
 * toggle), nothing ever displays this as the active tool - it's armed and torn back down within one
 * two-click gesture. Only meaningful for GroomViewport.
 */
export class AddSplineVertexTool implements GroomTool {
	public readonly id: string = 'addSplineVertex'

	public activate(_context: GroomToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof GroomViewport)) {
			return []
		}
		return [new AddSplineVertexInteractionHandler(host), new AddSplineVertexPreviewInteractionHandler(host)]
	}
}
