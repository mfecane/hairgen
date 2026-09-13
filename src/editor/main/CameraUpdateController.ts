/**
 * Fires after the active camera has been updated and before the scene renders.
 * Subscribers are a Set, so subscribing the same callback twice is a no-op
 * rather than double-firing it. subscribe() returns an AbortController -
 * call .abort() on it to unsubscribe, instead of a bespoke unsubscribe fn.
 */
export class CameraUpdateController {
	private readonly subscribers: Set<() => void> = new Set()

	public subscribe(callback: () => void): AbortController {
		this.subscribers.add(callback)

		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.subscribers.delete(callback))
		return controller
	}

	public notify(): void {
		for (const callback of this.subscribers) {
			callback()
		}
	}
}
