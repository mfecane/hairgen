import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'

export interface InteractionHandler {
	id: string

	priority: number

	enabled: boolean

	isEnabled(context: InteractionEvent): boolean

	onEvent(event: InteractionEvent): Promise<InteractionHandlerResult>
}
