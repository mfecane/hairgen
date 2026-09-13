import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { HairCardMoveInteractionHandler } from '@/editor/interaction/handlers/HairCardMoveInteractionHandler'
import { HairCardResizeInteractionHandler } from '@/editor/interaction/handlers/HairCardResizeInteractionHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { Tool, ToolContext } from '@/editor/main/tools/Tool'
import { Viewport } from '@/editor/main/Viewport'

/**
 * Always active alongside SelectTool (see ObjectMode) - hair cards have their own always-on
 * move/resize gestures (drag the body, drag a corner handle), with their own handlers and commands
 * (MoveHairCardCommand/ResizeHairCardCommand). Resize (not scale) is corner-anchored, not uniform,
 * and cards aren't rotatable. See docs/editor/hair-cards-plan.md.
 */
export class HairCardTool implements Tool {
	public readonly id: string = 'hairCard'

	public activate(_context: ToolContext): void {}

	public deactivate(): void {}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		if (!(host instanceof Viewport)) {
			return []
		}
		return [new HairCardResizeInteractionHandler(host), new HairCardMoveInteractionHandler(host)]
	}
}
