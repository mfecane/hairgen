import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { SelectionInteractionHandler } from '@/editor/interaction/handlers/SelectionInteractionHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { Tool, ToolContext } from '@/editor/main/tools/Tool'
import { Viewport } from '@/editor/main/Viewport'

/** Click-to-select objects, hosted by ObjectMode. Owns SelectionInteractionHandler - only meaningful for the 3D Viewport. */
export class SelectTool implements Tool {
	public readonly id: string = 'select'

	public activate(_context: ToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof Viewport)) {
			return []
		}
		return [new SelectionInteractionHandler(host)]
	}
}
