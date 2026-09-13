import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import type { GroomEditorController } from '@/editor/groom/main/GroomEditorController'

/** Bundles what a groom tool needs to build handlers - mirrors ToolContext (main/tools/Tool.ts). */
export interface GroomToolContext {
	controller: GroomEditorController
}

/**
 * A specific interaction behavior hosted by GroomEditorController - mirrors Tool (main/tools/Tool.ts).
 * There's no mode-controller indirection here (unlike ObjectMode/EditorMode): the groom editor only
 * ever has one tool-set, so GroomEditorController hosts these tools directly.
 */
export interface GroomTool {
	id: string

	activate(context: GroomToolContext): void

	deactivate(): void

	getInteractionHandlers(host: CanvasEventHost): InteractionHandler[]
}
