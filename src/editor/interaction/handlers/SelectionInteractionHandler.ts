import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { Viewport } from '@/editor/main/Viewport'

/** MouseEvent.button value for the primary ("left") button - a single-finger trackpad tap reports this too. */
const SELECT_BUTTON = 0

export class SelectionInteractionHandler implements InteractionHandler {
	public id: string = 'selection'

	public priority: number = 100

	public enabled: boolean = true

	public constructor(private readonly viewport: Viewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Click && event.context.initiatingButton === SELECT_BUTTON
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const object = event.context.hitResult?.object ?? null
		this.viewport.editor.selectObject(object ? tryGetSceneObjectId(object) : null, event.modifiers.shift)
		return new InteractionHandlerResult().setHandled()
	}
}
