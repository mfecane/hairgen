import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import type { EditorController } from '@/editor/main/EditorController'

export enum EditorModeId {
	Object = 'object',
}

/** Bundles what a mode needs to build handlers and (later) commands - see ToolContext for the tool-level equivalent. */
export interface ModeContext {
	controller: EditorController
}

/**
 * The outer context governing what's interactable and which tools are available. Only one mode is
 * active at a time across the whole editor (see ModeController) - today there's a single ObjectMode,
 * but the seam is here for a future mode (e.g. an edit mode) to plug into.
 */
export interface EditorMode {
	id: EditorModeId

	activate(context: ModeContext): void

	deactivate(): void

	getInteractionHandlers(host: CanvasEventHost): InteractionHandler[]
}
