import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** Anything with its own OrbitControls can host this handler - Viewport and GroomViewport both do. */
export interface OrbitControlsHost {
	controls: OrbitControls
}

/**
 * Lowest priority handler - lets camera orbit run whenever a higher-priority handler hasn't
 * captured the pointer. A hair card's move/resize drag (see HairCardMoveInteractionHandler,
 * HairCardResizeInteractionHandler) captures the router for its whole gesture, so this handler's
 * synthetic event never fires mid-drag. That alone doesn't stop OrbitControls though - it listens
 * to raw DOM pointer events independently of the router, so those handlers also toggle
 * `viewport.controls.enabled` directly.
 */
export class OrbitInteractionHandler implements InteractionHandler {
	public id: string = 'orbit'

	public priority: number = 1

	public enabled: boolean = true

	public constructor(private readonly host: OrbitControlsHost) {}

	public isEnabled(event: InteractionEvent): boolean {
		return (
			this.enabled &&
			(event.type === CanvasEventType.MoveStart ||
				event.type === CanvasEventType.Move ||
				event.type === CanvasEventType.MoveEnd)
		)
	}

	public async onEvent(): Promise<InteractionHandlerResult> {
		this.host.controls.enabled = true
		return new InteractionHandlerResult().setPass()
	}
}
