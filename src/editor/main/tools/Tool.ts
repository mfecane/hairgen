import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import type { EditorController } from '@/editor/main/EditorController'

/** Bundles what a Tool needs to build handlers and (later) commands - see ModeContext for the mode-level equivalent. */
export interface ToolContext {
	controller: EditorController
}

/**
 * A specific interaction behavior hosted by the active EditorMode (e.g. object mode's click-to-select
 * today, or a future edit-mode move/extrude tool). A mode can host exactly one tool, several
 * switchable tools, or none - composing a tool's handlers into the mode's own getInteractionHandlers()
 * is the mode's business, not the router's or CanvasEventHandler's.
 */
export interface Tool {
	id: string

	activate(context: ToolContext): void

	deactivate(): void

	getInteractionHandlers(host: CanvasEventHost): InteractionHandler[]
}
