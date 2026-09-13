/** Thin wrapper around ResizeObserver for one element - Viewport watches its mount element this way. */
export class ElementResizeObserver {
	private readonly observer: ResizeObserver

	public constructor(element: HTMLElement, onResize: () => void) {
		this.observer = new ResizeObserver(onResize)
		this.observer.observe(element)
	}

	public dispose(): void {
		this.observer.disconnect()
	}
}
