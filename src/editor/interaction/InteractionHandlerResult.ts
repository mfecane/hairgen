export class InteractionHandlerResult {
	public handled: boolean = false

	public capture: boolean = false

	public releaseCapture: boolean = false

	public pass: boolean = true

	public setHandled(): InteractionHandlerResult {
		this.handled = true
		this.pass = false
		return this
	}

	public setCapture(): InteractionHandlerResult {
		this.capture = true
		this.handled = true
		this.pass = false
		return this
	}

	public setReleaseCapture(): InteractionHandlerResult {
		this.releaseCapture = true
		this.handled = true
		this.pass = false
		return this
	}

	// It does nothing, but exists for explicitness
	public setPass(): InteractionHandlerResult {
		this.pass = true
		return this
	}
}
