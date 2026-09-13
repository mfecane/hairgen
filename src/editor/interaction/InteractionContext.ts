import { HitResult, HitTestable } from '@/editor/main/HitTester'
import { Camera, Intersection, Object3D, Plane, Raycaster, Sphere, Vector2, Vector3 } from 'three'

/** z = 0 - the vertical plane hair cards live on (see docs/editor/hair-cards-plan.md). */
const CARD_PLANE: Plane = new Plane(new Vector3(0, 0, 1), 0)

/**
 * Owned by any viewport's CanvasEventHandler - raycasts against whatever HitTestable it's given
 * (Viewport's 3D scene). Camera-agnostic (Perspective or Orthographic both work with
 * Raycaster.setFromCamera).
 */
export class InteractionContext {
	/**
	 * The button (MouseEvent.button: 0=left, 1=middle, 2=right) that started the current gesture,
	 * captured once at pointerdown. Deliberately not the `buttons` bitmask - OrbitControls picks
	 * its drag mode off `event.button` at mousedown for the same reason: bitmask state can be
	 * unreliable across browsers/input devices (trackpad middle-click emulation, etc), while the
	 * single originating button is unambiguous.
	 */
	public initiatingButton: number | null = null

	public hit: Intersection<Object3D> | null = null

	public hitResult: HitResult | null = null

	private raycaster: Raycaster | null = null

	private camera: Camera | null = null

	private domElement: HTMLElement | null = null

	private mouse: Vector2 | null = null

	public constructor(private readonly target: HitTestable) {}

	public initialize(raycaster: Raycaster, camera: Camera, domElement: HTMLElement, mouse: Vector2): void {
		this.raycaster = raycaster
		this.camera = camera
		this.domElement = domElement
		this.mouse = mouse
	}

	public setInitiatingButton(button: number): void {
		this.initiatingButton = button
	}

	public findIntersections(x: number, y: number): void {
		if (!this.raycaster || !this.camera || !this.domElement || !this.mouse) {
			return
		}

		const rect = this.domElement.getBoundingClientRect()
		this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1
		this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1

		this.raycaster.setFromCamera(this.mouse, this.camera)
		this.hitResult = this.target.hitTester.performHitTest(this.raycaster)
		this.hit = this.hitResult.intersection
	}

	/**
	 * The world-space point on the given plane under the current event's cursor position - reuses
	 * the ray findIntersections already set up for this event's x/y, rather than recomputing NDC
	 * coordinates from scratch, so it's exactly the same ray object-picking used. Returns null only
	 * when the ray is (near enough to) parallel to the plane, which a normal orbit camera
	 * essentially never produces. Used by drag/placement handlers instead of a fixed pixel-to-world
	 * sensitivity constant, so the dragged/placed point tracks the cursor exactly regardless of zoom.
	 */
	public intersectPlane(plane: Plane): Vector3 | null {
		if (!this.raycaster) {
			return null
		}
		const target = new Vector3()
		return this.raycaster.ray.intersectPlane(plane, target) ? target : null
	}

	/** The hair-card system's z = 0 plane specifically - see intersectPlane for the general form. */
	public intersectCardPlane(): Vector3 | null {
		return this.intersectPlane(CARD_PLANE)
	}

	/**
	 * The world-space point on the given sphere under the current event's cursor position - same
	 * shape as intersectPlane but against a sphere (the groom editor's scalp proxy - see
	 * GroomScalp.ts). Returns the nearest intersection along the ray, or null when the ray misses
	 * the sphere entirely.
	 */
	public intersectSphere(sphere: Sphere): Vector3 | null {
		if (!this.raycaster) {
			return null
		}
		const target = new Vector3()
		return this.raycaster.ray.intersectSphere(sphere, target) ? target : null
	}

	/**
	 * The world-space point on the camera-facing ("billboard") plane through `point` under the
	 * cursor - a plane whose normal is the camera's current view direction, so screen-space cursor
	 * movement maps directly to movement within it. Used by the groom editor's vertex position drag
	 * to move a vertex in 3D "in screen space aligned to current view" instead of being locked to a
	 * fixed world plane.
	 */
	public intersectViewPlane(point: Vector3): Vector3 | null {
		if (!this.raycaster || !this.camera) {
			return null
		}
		const normal = new Vector3()
		this.camera.getWorldDirection(normal)
		const plane = new Plane().setFromNormalAndCoplanarPoint(normal, point)
		return this.intersectPlane(plane)
	}

	/**
	 * The world-space point under the cursor on the plane that contains the line through `origin`
	 * along `axis`, oriented to face the camera as closely as possible while still containing that
	 * line (`normal = axis × (axis × eyeToPoint)` - the standard single-axis-drag technique). Callers
	 * project the returned point back onto the axis (a dot product against `origin`) for a signed
	 * distance - this stays a pure "point under the cursor" primitive, the same shape as
	 * intersectPlane/intersectViewPlane. Returns null when the camera looks straight down the axis
	 * (the cross product degenerates) or the ray misses the plane.
	 */
	public intersectAxisPlane(origin: Vector3, axis: Vector3): Vector3 | null {
		if (!this.raycaster || !this.camera) {
			return null
		}
		const eyeToPoint = origin.clone().sub(this.camera.position)
		const normal = new Vector3().crossVectors(axis, eyeToPoint).cross(axis)
		if (normal.lengthSq() < 1e-8) {
			return null
		}
		normal.normalize()
		const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin)
		return this.intersectPlane(plane)
	}

	public clear(): void {
		this.initiatingButton = null
		this.hit = null
		this.hitResult = null
	}
}
