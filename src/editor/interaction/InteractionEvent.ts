import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionContext } from '@/editor/interaction/InteractionContext'

interface InteractionEventModifiers {
	shift: boolean
	ctrl: boolean
	meta: boolean
	alt: boolean
}

export interface InteractionEvent {
	type: CanvasEventType
	x: number
	y: number
	dx: number
	dy: number
	/** Wheel delta (deltaY), only meaningful for CanvasEventType.Wheel events. */
	wheelDelta?: number
	modifiers: InteractionEventModifiers
	context: InteractionContext
	raw: MouseEvent
}
