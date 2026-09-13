import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'

export class InteractionHandlerRouter {
	private capturedHandlerId: string | null = null

	public constructor(private handlers: InteractionHandler[]) {
		this.handlers = this.orderHandlers(this.handlers)
	}

	public async dispatch(event: InteractionEvent): Promise<boolean> {
		const capturedHandler: InteractionHandler | null = this.getCapturedHandler()
		if (capturedHandler) {
			const result = await this.dispatchToHandler(capturedHandler, event)
			return result.handled || result.capture || result.releaseCapture
		}

		for (const handler of this.handlers) {
			if (!handler.isEnabled(event)) {
				continue
			}
			const result: InteractionHandlerResult = await this.dispatchToHandler(handler, event)
			if (result.handled || result.capture || result.releaseCapture) {
				return true
			}
		}
		return false
	}

	/** Swaps the handler list, e.g. when the active EditorMode (or its active Tool) changes. Drops any in-flight capture. */
	public setHandlers(handlers: InteractionHandler[]): void {
		this.handlers = this.orderHandlers(handlers)
		this.capturedHandlerId = null
	}

	public enableHandler(handlerId: string): void {
		const handler = this.getHandlerById(handlerId)
		if (handler) {
			handler.enabled = true
		}
	}

	public disableHandler(handlerId: string): void {
		const handler = this.getHandlerById(handlerId)
		if (handler) {
			handler.enabled = false
		}
	}

	private getCapturedHandler(): InteractionHandler | null {
		if (!this.capturedHandlerId) {
			return null
		}
		return this.getHandlerById(this.capturedHandlerId)
	}

	private orderHandlers(handlers: InteractionHandler[]): InteractionHandler[] {
		return handlers.sort((a, b) => b.priority - a.priority)
	}

	private getHandlerById(handlerId: string): InteractionHandler | null {
		return this.handlers.find((handler) => handler.id === handlerId) ?? null
	}

	private async dispatchToHandler(handler: InteractionHandler, event: InteractionEvent): Promise<InteractionHandlerResult> {
		const result: InteractionHandlerResult = await handler.onEvent(event)

		if (result.capture) {
			this.capturedHandlerId = handler.id
		}

		if (result.releaseCapture) {
			this.capturedHandlerId = null
		}

		return result
	}
}
