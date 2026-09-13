import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { SplineSelectionInteractionHandler } from '@/editor/groom/interaction/handlers/SplineSelectionInteractionHandler'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { GroomTool, GroomToolContext } from '@/editor/groom/tools/GroomTool'

/** Click-to-select splines, always active - mirrors SelectTool. Only meaningful for GroomViewport. */
export class SplineSelectTool implements GroomTool {
	public readonly id: string = 'splineSelect'

	public activate(_context: GroomToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof GroomViewport)) {
			return []
		}
		return [new SplineSelectionInteractionHandler(host)]
	}
}
