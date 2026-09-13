import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionContext } from '@/editor/interaction/InteractionContext'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerRouter } from '@/editor/interaction/InteractionHandlerRouter'
import { HitTestable } from '@/editor/main/HitTester'
import { Camera, Raycaster, Vector2, WebGLRenderer } from 'three'

/** Anything with its own renderer/camera/hitTester can host an interaction system - Viewport (3D) does. */
export interface CanvasEventHost extends HitTestable {
	renderer: WebGLRenderer
	camera: Camera
}

/** Raw event pre-processor - detects click/double-click/drag/wheel and dispatches synthetic InteractionEvents to the given handlers. */
export class CanvasEventHandler {
	private static readonly DOUBLE_CLICK_SHIFT: number = 2

	private static readonly SINGLE_CLICK_DELAY_MS: number = 200

	private static readonly DOUBLE_CLICK_TIME_MS: number = 300

	private lastPointerDownPosition: Vector2 | null = null

	private lastMovePosition: Vector2 | null = null

	private lastPointerUpPosition: Vector2 | null = null

	private lastPointerUpTime: number = 0

	private singleClickTimeoutId: ReturnType<typeof setTimeout> | null = null

	private isPointerDown: boolean = false

	private isDragging: boolean = false

	private readonly context: InteractionContext

	private readonly handlerRouter: InteractionHandlerRouter

	private readonly raycaster: Raycaster = new Raycaster()

	private readonly mouse: Vector2 = new Vector2()

	private readonly element: HTMLElement

	private readonly camera: Camera

	private readonly onPointerDownBound = (event: PointerEvent) => void this.onPointerDown(event)

	private readonly onPointerMoveBound = (event: PointerEvent) => void this.onPointerMove(event)

	private readonly onPointerUpBound = (event: PointerEvent) => void this.onPointerUp(event)

	private readonly onWheelBound = (event: WheelEvent) => void this.onWheel(event)

	// Belt-and-suspenders alongside pointerdown's preventDefault: some browsers activate
	// middle-click autoscroll off the native mousedown/auxclick compatibility events rather than
	// (or in addition to) pointerdown, so those need their own preventDefault too.
	private readonly onMouseDownBound = (event: MouseEvent) => {
		if (event.button === 1) {
			event.preventDefault()
		}
	}

	private readonly onAuxClickBound = (event: MouseEvent) => {
		if (event.button === 1) {
			event.preventDefault()
		}
	}

	// Copied straight from OrbitControls' onContextMenu (works there): unconditionally block the
	// native context menu on this element, since it fires on middle/right-drag in some browsers.
	private readonly onContextMenuBound = (event: MouseEvent) => {
		event.preventDefault()
	}

	// Without this, a hover highlight (see EdgePickInteractionHandler) sticks at its last position
	// once the pointer leaves the canvas, since no more pointermove events arrive to clear it.
	private readonly onPointerLeaveBound = () => void this.onPointerLeave()

	public constructor(host: CanvasEventHost, handlers: InteractionHandler[]) {
		this.element = host.renderer.domElement
		this.camera = host.camera
		this.context = new InteractionContext(host)
		this.handlerRouter = new InteractionHandlerRouter(handlers)

		this.context.initialize(this.raycaster, this.camera, this.element, this.mouse)

		this.element.addEventListener('pointerdown', this.onPointerDownBound)
		this.element.addEventListener('pointermove', this.onPointerMoveBound)
		this.element.addEventListener('pointerup', this.onPointerUpBound)
		this.element.addEventListener('wheel', this.onWheelBound, { passive: false })
		this.element.addEventListener('mousedown', this.onMouseDownBound)
		this.element.addEventListener('auxclick', this.onAuxClickBound)
		this.element.addEventListener('contextmenu', this.onContextMenuBound)
		this.element.addEventListener('pointerleave', this.onPointerLeaveBound)
	}

	public async onPointerDown(event: PointerEvent): Promise<void> {
		// Middle button: stop the browser's native autoscroll cursor / Linux primary-selection
		// paste from firing, since middle-drag is used for panning (see UvPanInteractionHandler).
		if (event.button === 1) {
			event.preventDefault()
		}

		// Keeps the interaction scoped to the view for the whole gesture - without this, a drag
		// that crosses out of the canvas stops receiving
		// pointermove/pointerup, leaving isPointerDown stuck and dragging desynced.
		this.element.setPointerCapture(event.pointerId)

		this.lastPointerDownPosition = new Vector2(event.clientX, event.clientY)
		this.isPointerDown = true
		this.isDragging = false

		this.context.setInitiatingButton(event.button)
		await this.dispatchEvent(CanvasEventType.PointerDown, event.clientX, event.clientY, 0, 0, event)

		if (this.singleClickTimeoutId) {
			clearTimeout(this.singleClickTimeoutId)
			this.singleClickTimeoutId = null
		}
	}

	public async onPointerMove(event: PointerEvent): Promise<void> {
		if (!this.isDragging && this.isPointerDown && this.isMoved(event.clientX, event.clientY)) {
			this.isDragging = true
			this.lastMovePosition = new Vector2(event.clientX, event.clientY)
			await this.dispatchEvent(CanvasEventType.MoveStart, event.clientX, event.clientY, 0, 0, event)
		}
		if (this.isDragging) {
			const dx = this.lastMovePosition ? event.clientX - this.lastMovePosition.x : 0
			const dy = this.lastMovePosition ? event.clientY - this.lastMovePosition.y : 0
			this.lastMovePosition = new Vector2(event.clientX, event.clientY)
			await this.dispatchEvent(CanvasEventType.Move, event.clientX, event.clientY, dx, dy, event)
		} else if (!this.isPointerDown) {
			await this.dispatchEvent(CanvasEventType.Hover, event.clientX, event.clientY, 0, 0, event)
		}
	}

	public async onPointerUp(event: PointerEvent): Promise<void> {
		if (this.element.hasPointerCapture(event.pointerId)) {
			this.element.releasePointerCapture(event.pointerId)
		}

		this.isPointerDown = false
		const pointerUpHandled = await this.dispatchEvent(
			CanvasEventType.PointerUp,
			event.clientX,
			event.clientY,
			0,
			0,
			event
		)

		if (this.isDragging) {
			await this.dispatchEvent(CanvasEventType.MoveEnd, event.clientX, event.clientY, 0, 0, event)
			this.isDragging = false
			this.lastMovePosition = null
			this.lastPointerUpPosition = null
			this.lastPointerUpTime = 0
			return
		}
		if (pointerUpHandled) {
			this.lastPointerUpPosition = null
			this.lastPointerUpTime = 0
			return
		}

		if (this.isMoved(event.clientX, event.clientY)) {
			this.lastPointerUpPosition = null
			this.lastPointerUpTime = 0
			return
		}

		const currentTime = Date.now()
		const currentPosition = new Vector2(event.clientX, event.clientY)

		const isDoubleClick =
			this.lastPointerUpPosition !== null &&
			this.lastPointerUpTime > 0 &&
			currentTime - this.lastPointerUpTime < CanvasEventHandler.DOUBLE_CLICK_TIME_MS &&
			!this.isMoved(event.clientX, event.clientY, this.lastPointerUpPosition)

		if (isDoubleClick) {
			if (this.singleClickTimeoutId) {
				clearTimeout(this.singleClickTimeoutId)
				this.singleClickTimeoutId = null
			}
			this.lastPointerUpPosition = null
			this.lastPointerUpTime = 0
			void this.dispatchEvent(CanvasEventType.DoubleClick, event.clientX, event.clientY, 0, 0, event)
			return
		}

		this.lastPointerUpPosition = currentPosition
		this.lastPointerUpTime = currentTime

		if (this.singleClickTimeoutId) {
			clearTimeout(this.singleClickTimeoutId)
		}
		this.singleClickTimeoutId = setTimeout(() => {
			this.singleClickTimeoutId = null
			this.lastPointerUpPosition = null
			this.lastPointerUpTime = 0
			void this.dispatchEvent(CanvasEventType.Click, event.clientX, event.clientY, 0, 0, event)
		}, CanvasEventHandler.SINGLE_CLICK_DELAY_MS)
	}

	/** Clears any live hit (so a hover highlight doesn't linger) and re-dispatches Hover so handlers see nothing under the cursor - only fires while the pointer isn't down, matching onPointerMove's own hover condition. */
	public async onPointerLeave(): Promise<void> {
		if (this.isPointerDown) {
			return
		}
		this.context.clear()
		await this.handlerRouter.dispatch({
			type: CanvasEventType.Hover,
			x: -1,
			y: -1,
			dx: 0,
			dy: 0,
			modifiers: { shift: false, ctrl: false, meta: false, alt: false },
			context: this.context,
			raw: new MouseEvent('pointerleave'),
		})
	}

	public async onWheel(event: WheelEvent): Promise<void> {
		event.preventDefault()
		await this.dispatchEvent(CanvasEventType.Wheel, event.clientX, event.clientY, 0, 0, event, event.deltaY)
	}

	/** Swaps the handler list, e.g. when ModeController activates a new EditorMode. */
	public setHandlers(handlers: InteractionHandler[]): void {
		this.handlerRouter.setHandlers(handlers)
	}

	public enableHandler(handlerId: string): void {
		this.handlerRouter.enableHandler(handlerId)
	}

	public disableHandler(handlerId: string): void {
		this.handlerRouter.disableHandler(handlerId)
	}

	public dispose(): void {
		this.element.removeEventListener('pointerdown', this.onPointerDownBound)
		this.element.removeEventListener('pointermove', this.onPointerMoveBound)
		this.element.removeEventListener('pointerup', this.onPointerUpBound)
		this.element.removeEventListener('wheel', this.onWheelBound)
		this.element.removeEventListener('mousedown', this.onMouseDownBound)
		this.element.removeEventListener('auxclick', this.onAuxClickBound)
		this.element.removeEventListener('contextmenu', this.onContextMenuBound)
		this.element.removeEventListener('pointerleave', this.onPointerLeaveBound)
		if (this.singleClickTimeoutId) {
			clearTimeout(this.singleClickTimeoutId)
		}
	}

	private isMoved(x: number, y: number, referencePosition?: Vector2): boolean {
		const position = referencePosition ?? this.lastPointerDownPosition
		if (!position) {
			return false
		}
		const dx: number = x - position.x
		const dy: number = y - position.y
		return Math.hypot(dx, dy) > CanvasEventHandler.DOUBLE_CLICK_SHIFT
	}

	private async dispatchEvent(
		type: CanvasEventType,
		x: number,
		y: number,
		dx: number,
		dy: number,
		event: MouseEvent,
		wheelDelta?: number
	): Promise<boolean> {
		this.context.findIntersections(x, y)

		const newEvent: InteractionEvent = {
			type,
			x,
			y,
			dx,
			dy,
			wheelDelta,
			modifiers: {
				shift: event.shiftKey,
				ctrl: event.ctrlKey,
				meta: event.metaKey,
				alt: event.altKey,
			},
			context: this.context,
			raw: event,
		}

		return this.handlerRouter.dispatch(newEvent)
	}
}
