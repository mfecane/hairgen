import { CanvasEventHost } from '@/editor/interaction/CanvasEventHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { EditorMode, EditorModeId, ModeContext } from '@/editor/main/modes/EditorMode'
import { HairCardTool } from '@/editor/main/tools/HairCardTool'
import { SelectTool } from '@/editor/main/tools/SelectTool'

/**
 * The editor's only mode. SelectTool and HairCardTool are always active - click-to-select, and hair
 * cards' own move/resize gestures, both always work. Each is a real Tool contributing its own
 * InteractionHandler(s) to the router - the same seam a future tool would use.
 */
export class ObjectMode implements EditorMode {
	public static readonly ID: EditorModeId = EditorModeId.Object

	public readonly id: EditorModeId = ObjectMode.ID

	private readonly selectTool: SelectTool = new SelectTool()

	private readonly hairCardTool: HairCardTool = new HairCardTool()

	public activate(context: ModeContext): void {
		this.selectTool.activate({ controller: context.controller })
		this.hairCardTool.activate({ controller: context.controller })
	}

	public deactivate(): void {
		this.selectTool.deactivate()
		this.hairCardTool.deactivate()
	}

	public getInteractionHandlers(host: CanvasEventHost): InteractionHandler[] {
		return [...this.selectTool.getInteractionHandlers(host), ...this.hairCardTool.getInteractionHandlers(host)]
	}
}
