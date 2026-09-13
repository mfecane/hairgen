import { EDITOR_SCENE_COLORS, EDITOR_VIEWPORT, EditorTheme, GROOM } from '@/constants'
import { CanvasEventHandler } from '@/editor/interaction/CanvasEventHandler'
import { OrbitInteractionHandler } from '@/editor/interaction/handlers/OrbitInteractionHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { CameraUpdateController } from '@/editor/main/CameraUpdateController'
import { ElementResizeObserver } from '@/editor/main/ElementResizeObserver'
import { HitTester } from '@/editor/main/HitTester'
import { tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { AddPointAnchor, AddPointScreenPosition } from '@/editor/groom/main/AddPointAnchor'
import { CurveInsertHintAnchor, CurveInsertScreenPosition } from '@/editor/groom/main/CurveInsertHintAnchor'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { SplineObjectData } from '@/editor/groom/main/GroomProject'
import { GroomViewMode } from '@/editor/groom/main/GroomReactBridge'
import { SCALP_SPHERE } from '@/editor/groom/main/GroomScalp'
import { RaycastableObjectsManager } from '@/editor/groom/main/RaycastableObjectsManager'
import {
	createSplineBodyGroup,
	findClosestPointOnSplineBody,
	getPickableBodyCollider,
	getSplineBodyRenderChildren,
	hasSplineCardStrip,
	setSplineBodyVertices,
	setSplineVertexDirections,
	setSplineVertexScales,
	updateSplineBodyGeometry,
} from '@/editor/groom/main/SplineBodyGeometry'
import { SplineVertexGizmo } from '@/editor/groom/main/SplineVertexGizmo'
import { HoveredSplineVertexHandle } from '@/editor/groom/main/SplineVertexRef'
import { SelectedSpline, SplineVertexWidget } from '@/editor/groom/main/SplineVertexWidget'
import {
	AmbientLight,
	Box3,
	Clock,
	Color,
	DirectionalLight,
	Group,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	PerspectiveCamera,
	Scene,
	Sphere,
	SphereGeometry,
	Vector3,
	WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'

let nextViewportNumber = 1

/**
 * One independent view onto the groom project - mirrors Viewport (the object editor's), trimmed to
 * what the groom editor actually needs: no hair-card system, no bounded working area, just splines
 * over the scalp proxy. Nothing 3D is shared with the object editor's Viewport -
 * see the groom editor plan's "full separation" decision. Structurally satisfies CanvasEventHost/
 * HitTestable the same way Viewport does, without declaring `implements` (matching that file's
 * convention).
 */
export class GroomViewport {
	public readonly id: string = `groomViewport-${nextViewportNumber++}`

	public readonly scene: Scene

	/** Rendered as a second pass with depth cleared, so its contents draw on top of the main scene. */
	public readonly overlayScene: Scene

	public readonly camera: PerspectiveCamera

	public readonly renderer: WebGLRenderer

	public readonly controls: OrbitControls

	public readonly viewHelper: ViewHelper

	public readonly hitTester: HitTester

	/** Rebuilt every frame in render() - the sole place deciding what hitTester actually raycasts against, see its class doc. */
	public readonly raycastableObjectsManager: RaycastableObjectsManager

	public readonly canvasEventHandler: CanvasEventHandler

	public readonly splineObjectsGroup: Group

	/** A selected spline's vertex-drag gizmo - see SplineVertexWidget for why it's not HairCardWidget/SelectionWidget. */
	public readonly splineVertexWidget: SplineVertexWidget

	/** The selected spline's active vertex's rotate/scale gizmo - see SplineVertexGizmo. */
	public readonly splineVertexGizmo: SplineVertexGizmo

	/** Where the selected spline's next vertex would be added - the "add point" UI overlay's anchor. See AddPointAnchor. */
	public readonly addPointAnchor: AddPointAnchor = new AddPointAnchor()

	/** Where a click would insert a new vertex into the curve the pointer's currently hovering - see CurveInsertHintAnchor/setHoveredCurvePoint. */
	public readonly curveInsertHintAnchor: CurveInsertHintAnchor = new CurveInsertHintAnchor()

	private readonly addPointScreenPositionListeners: Set<(position: AddPointScreenPosition | null) => void> =
		new Set()

	private readonly curveInsertScreenPositionListeners: Set<
		(position: CurveInsertScreenPosition | null) => void
	> = new Set()

	/**
	 * Subscribes to this viewport's per-frame "add point" screen position - see AddPointAnchor and
	 * useLiveElementPosition, the React-side consumer (AddPointButton). An arrow field (not a
	 * prototype method) so it's a stable, already-`this`-bound reference a hook can pass straight to
	 * useEffect's dependency array without re-subscribing every render.
	 */
	public readonly subscribeAddPointScreenPosition = (
		listener: (position: AddPointScreenPosition | null) => void
	): AbortController => {
		this.addPointScreenPositionListeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.addPointScreenPositionListeners.delete(listener))
		return controller
	}

	/**
	 * Subscribes to this viewport's per-frame "insert point on the curve" hover screen position - see
	 * CurveInsertHintAnchor and useLiveElementPosition, the React-side consumer (SplineCurveInsertHint).
	 * Same stable-arrow-field shape as subscribeAddPointScreenPosition, for the same reason.
	 */
	public readonly subscribeCurveInsertScreenPosition = (
		listener: (position: CurveInsertScreenPosition | null) => void
	): AbortController => {
		this.curveInsertScreenPositionListeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.curveInsertScreenPositionListeners.delete(listener))
		return controller
	}

	/** Fires once per frame after the camera's final position for that frame is set - see render(). SplineVertexWidget consumes it to keep its handles a constant screen size. */
	public readonly cameraUpdateController: CameraUpdateController = new CameraUpdateController()

	/** The head/scalp proxy - purely visual, mirrors GroomScalp.SCALP_SPHERE's center/radius; recolored (not recreated) on theme change since its material owns the color, not baked vertex data. */
	private readonly scalpMesh: Mesh

	// Camera orbit works regardless of active tool, so it's kept outside the tool system entirely,
	// always present at lowest priority (see getInteractionHandlers) - mirrors Viewport.
	private readonly orbitHandler: OrbitInteractionHandler

	/** Whatever vertex handle the pointer currently sits over, fed into splineVertexWidget/splineVertexGizmo every render() - see SplineHoverInteractionHandler. */
	private hoveredHandle: HoveredSplineVertexHandle | null = null

	/** The curve point (already snapped via findClosestPointOnSplineBody) the pointer currently sits over, fed into curveInsertHintAnchor every render() - see SplineHoverInteractionHandler/setHoveredCurvePoint. */
	private hoveredCurvePoint: Vector3 | null = null

	private readonly handleInteractionHandlersChangedBound = (): void => {
		this.canvasEventHandler.setHandlers(this.getInteractionHandlers())
	}

	/**
	 * Cancels "add point" mode (GroomEditor.cancelAddVertexToSelectedSpline) on any pointerdown whose
	 * target isn't inside this viewport's own mount element (AddPointButton itself included, so
	 * clicking it isn't self-cancelling) - e.g. a click on a toolbar/panel, or anywhere else on the
	 * page, while armed. A no-op outside "add point" mode or once it's already left, checked fresh on
	 * every pointerdown rather than added/removed per tool change, since it's cheap and this avoids
	 * one more listener lifecycle to keep in sync with tool changes.
	 */
	private readonly handleGlobalPointerDownBound = (event: PointerEvent): void => {
		if (this.editor.reactBridge.getState().activeTool !== 'addVertex') {
			return
		}
		if (event.target instanceof Node && this.mountElement.contains(event.target)) {
			return
		}
		this.editor.cancelAddVertexToSelectedSpline()
	}

	private readonly resizeObserver: ElementResizeObserver

	private readonly viewHelperClock: Clock = new Clock()

	private readonly handleViewHelperPointerDownBound = (event: PointerEvent): void => {
		if (!this.viewHelper.handleClick(event)) {
			return
		}
		event.preventDefault()
		event.stopImmediatePropagation()
	}

	public constructor(
		public readonly editor: GroomEditor,
		private readonly mountElement: HTMLElement
	) {
		const colors = EDITOR_SCENE_COLORS[this.editor.controller.getTheme()]
		this.scene = new Scene()
		this.scene.name = `${this.id}Scene`
		this.scene.background = new Color(colors.viewportBackground)

		const ambientLight = new AmbientLight(0xffffff, 0.6)
		ambientLight.name = 'ambientLight'
		this.scene.add(ambientLight)

		const directionalLight = new DirectionalLight(0xffffff, 1)
		directionalLight.name = 'directionalLight'
		directionalLight.position.set(5, 10, 7.5)
		this.scene.add(directionalLight)

		this.overlayScene = new Scene()
		this.overlayScene.name = `${this.id}OverlayScene`

		const { clientWidth, clientHeight } = mountElement

		this.camera = new PerspectiveCamera(50, clientWidth / (clientHeight || 1), 0.01, 1000)
		this.camera.name = `${this.id}Camera`
		this.camera.position.set(4, 4, 4)

		this.renderer = new WebGLRenderer({ antialias: true })
		this.renderer.setSize(clientWidth, clientHeight)
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.autoClear = false
		mountElement.appendChild(this.renderer.domElement)

		this.controls = new OrbitControls(this.camera, this.renderer.domElement)
		this.controls.enableDamping = true
		this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement)
		this.viewHelper.name = `${this.id}ViewHelper`
		this.renderer.domElement.addEventListener('pointerdown', this.handleViewHelperPointerDownBound, true)
		document.addEventListener('pointerdown', this.handleGlobalPointerDownBound)

		this.scalpMesh = this.createScalpMesh(colors)
		this.scene.add(this.scalpMesh)

		this.splineObjectsGroup = new Group()
		this.splineObjectsGroup.name = `${this.id}SplineObjects`
		this.scene.add(this.splineObjectsGroup)

		this.splineVertexWidget = new SplineVertexWidget(this.camera, this.cameraUpdateController)
		this.splineVertexGizmo = new SplineVertexGizmo(this.camera, this.cameraUpdateController)

		this.hitTester = new HitTester()
		// See RaycastableObjectsManager's class doc for the full rationale - it, not this constructor,
		// is what ultimately decides which objects hitTester ever sees, rebuilt every frame from
		// render(). Priority is still fixed here, by tier order: the active vertex's gizmo colliders
		// (SplineVertexGizmo.getPickableColliders) ahead of the selected spline's plain position
		// handles (SplineVertexWidget.getColliders) ahead of every spline body's own pickable collider
		// (getPickableBodyCollider) - so a spline body never blocks its own vertex handles from being
		// picked even when a handle sits geometrically behind/inside the body's card strip/tube
		// collider, and the gizmo always wins over a position handle it happens to visually overlap,
		// regardless of which one is nearer the camera along the ray - see rebuildPickability.
		this.raycastableObjectsManager = new RaycastableObjectsManager(this.hitTester)
		this.orbitHandler = new OrbitInteractionHandler(this)
		this.canvasEventHandler = new CanvasEventHandler(this, this.getInteractionHandlers())
		editor.controller.addOnToolChangedListener(this.handleInteractionHandlersChangedBound)

		this.overlayScene.add(this.splineVertexWidget.group)
		this.overlayScene.add(this.splineVertexGizmo.group)
		this.overlayScene.add(this.addPointAnchor.object3D)
		this.overlayScene.add(this.curveInsertHintAnchor.object3D)

		this.setTheme(this.editor.controller.getTheme())

		this.resizeObserver = new ElementResizeObserver(mountElement, () => this.handleResize())
	}

	public setTheme(theme: EditorTheme): void {
		const colors = EDITOR_SCENE_COLORS[theme]
		this.scene.background = new Color(colors.viewportBackground)
		;(this.scalpMesh.material as MeshStandardMaterial).color = new Color(colors.scalp)
	}

	/** Reconciles this viewport's spline body meshes with the groom scene data - see GroomEditor.syncScene. */
	public syncSplineObjects(items: readonly SplineObjectData[]): void {
		const existingById = new Map(
			this.splineObjectsGroup.children.map((object) => [tryGetSceneObjectId(object), object] as const)
		)
		const seen = new Set<string>()
		for (const item of items) {
			seen.add(item.id)
			let object = existingById.get(item.id)
			if (!object) {
				object = this.createSplineBodyMesh(item.id)
				this.splineObjectsGroup.add(object)
			}
			setSplineBodyVertices(
				object,
				item.vertices.map((vertex) => new Vector3(vertex.position.x, vertex.position.y, vertex.position.z))
			)
			setSplineVertexDirections(
				object,
				item.vertices.map((vertex) => new Vector3(vertex.direction.x, vertex.direction.y, vertex.direction.z))
			)
			setSplineVertexScales(
				object,
				item.vertices.map((vertex) => vertex.scale)
			)
			updateSplineBodyGeometry(
				object,
				item.resolution,
				item.cardStartOffset,
				item.cardWidth,
				this.editor.hairCardLookup.getCardUvRect(item.hairCardId)
			)
		}
		for (const [id, object] of existingById) {
			if (id && !seen.has(id)) {
				this.splineObjectsGroup.remove(object)
			}
		}
	}

	/** Set by SplineHoverInteractionHandler on every Hover event - see hoveredHandle. */
	public setHoveredHandle(handle: HoveredSplineVertexHandle | null): void {
		this.hoveredHandle = handle
	}

	/**
	 * Set by SplineHoverInteractionHandler on every Hover event - see hoveredCurvePoint. Only ever
	 * resolves to a non-null point in curve editing mode - `activeTool === 'select'` AND `splineId` is
	 * the sole selected spline - the exact same guard `SplineSelectionInteractionHandler.insertVertexAtPoint`
	 * requires before a click actually inserts anything there; anything else (an unselected spline's
	 * pickable card strip, a spline that's merely part of a multi-selection, `'placeSpline'`/`'addVertex'`
	 * mode) must never show the hint, since clicking it wouldn't insert a point. `rawPoint` is the
	 * raycast hit on the collider tube's surface; this looks the spline body back up and snaps the
	 * point onto its curve (findClosestPointOnSplineBody) before storing it, so curveInsertHintAnchor
	 * always sits exactly on the curve rather than offset by the tube's radius.
	 */
	public setHoveredCurvePoint(splineId: string | null, rawPoint: Vector3 | null): void {
		const { selectedObjectIds, activeTool } = this.editor.reactBridge.getState()
		const isCurveEditingMode =
			activeTool === 'select' && splineId !== null && selectedObjectIds.size === 1 && selectedObjectIds.has(splineId)
		const group = isCurveEditingMode && splineId ? this.getSplineObject3D(splineId) : null
		this.hoveredCurvePoint = group && rawPoint ? findClosestPointOnSplineBody(group, rawPoint) : null
	}

	/** Looks up one of this viewport's own spline body meshes by its stable scene object id - used by the vertex-drag handler. */
	public getSplineObject3D(splineId: string): Object3D | null {
		return this.splineObjectsGroup.children.find((object) => tryGetSceneObjectId(object) === splineId) ?? null
	}

	/**
	 * Live-previews AddSplineVertexTool's placement gesture (AddSplineVertexPreviewInteractionHandler,
	 * fired on every Hover while "add point" mode is armed) - rebuilds `splineId`'s body geometry from
	 * its COMMITTED vertices (never the live mesh array, so repeated hover calls can't accumulate) plus
	 * `point` appended as one extra temporary vertex, or with nothing appended when `point` is null
	 * (cursor left the viewport, or preview needs clearing). Never touches the persisted GroomScene
	 * model - the actual vertex is only added on commit (GroomEditor.commitAddVertexAt), which
	 * resyncs every viewport from committed data anyway.
	 */
	public previewAddVertex(splineId: string, point: Vector3 | null): void {
		const spline = this.editor.project.scene.get(splineId)
		const object = this.getSplineObject3D(splineId)
		if (!spline || !object) {
			return
		}
		const vertices = spline.vertices.map((vertex) => new Vector3(vertex.position.x, vertex.position.y, vertex.position.z))
		const directions = spline.vertices.map(
			(vertex) => new Vector3(vertex.direction.x, vertex.direction.y, vertex.direction.z)
		)
		const scales = spline.vertices.map((vertex) => vertex.scale)
		if (point) {
			vertices.push(point)
			directions.push(directions[directions.length - 1]?.clone() ?? new Vector3(0, 1, 0))
			scales.push(scales[scales.length - 1] ?? GROOM.SPLINE.DEFAULT_VERTEX_SCALE)
		}
		setSplineBodyVertices(object, vertices)
		setSplineVertexDirections(object, directions)
		setSplineVertexScales(object, scales)
		updateSplineBodyGeometry(
			object,
			spline.resolution,
			spline.cardStartOffset,
			spline.cardWidth,
			this.editor.hairCardLookup.getCardUvRect(spline.hairCardId)
		)
	}

	/** Moves the camera to frame every selected spline (or the whole scene when selection is empty). */
	public frameSelected(objectIds: ReadonlySet<string>): void {
		if (objectIds.size === 0) {
			this.frameAll()
			return
		}
		const targets = [...objectIds]
			.map((objectId) => this.getSplineObject3D(objectId))
			.filter((object): object is Object3D => object !== null)
		this.frameObjects(targets)
	}

	/** Moves the camera to frame the entire scene, plus the ground plane and scalp proxy even when the scene is empty - so a fresh viewport opens zoomed to something meaningful instead of the constructor's arbitrary starting distance. */
	public frameAll(): void {
		const box = new Box3().setFromObject(this.splineObjectsGroup)
		const halfGround = GROOM.GROUND_PLANE_SIZE / 2
		box.union(new Box3(new Vector3(-halfGround, 0, -halfGround), new Vector3(halfGround, 0, halfGround)))
		box.union(new Box3().setFromObject(this.scalpMesh))
		this.frameBox(box)
	}

	public render(): void {
		this.controls.update()
		this.viewHelper.center.copy(this.controls.target)
		const viewHelperDelta = this.viewHelperClock.getDelta()
		if (this.viewHelper.animating) {
			this.viewHelper.update(viewHelperDelta)
		}
		// Camera's final position/zoom for this frame is settled now - notify before anything else
		// reads it (see SplineVertexWidget.refreshHandleScale).
		this.cameraUpdateController.notify()

		const { selectedObjectIds, activeVertexIndex, viewMode, activeTool } = this.editor.reactBridge.getState()
		const selectedSpline = this.getSelectedSpline(selectedObjectIds)
		this.splineVertexWidget.update(selectedSpline, this.hoveredHandle)
		this.splineVertexGizmo.update(selectedSpline, activeVertexIndex, this.hoveredHandle)
		this.addPointAnchor.update(selectedSpline)
		this.curveInsertHintAnchor.update(this.hoveredCurvePoint)
		const pickableBodyColliders = this.applyViewModeAndGhosting(selectedObjectIds, viewMode, activeTool === 'select')
		// Every widget/gizmo/body pickability input above is now current for this frame - see
		// RaycastableObjectsManager's class doc for why this is the one place that assembles them.
		this.raycastableObjectsManager.rebuild([
			this.splineVertexGizmo.getPickableColliders(),
			this.splineVertexWidget.getColliders(),
			pickableBodyColliders,
		])
		// Recomputed fresh every frame (rather than only on tool-change events) so it can never read a
		// stale activeTool - visual feedback that "add point" mode is armed, since otherwise nothing in
		// the viewport itself indicates the next click behaves differently.
		this.renderer.domElement.style.cursor = activeTool === 'addVertex' ? 'crosshair' : ''

		this.renderer.clear()
		this.renderer.render(this.scene, this.camera)
		this.renderer.clearDepth()
		this.renderer.render(this.overlayScene, this.camera)
		this.viewHelper.render(this.renderer)

		// Camera/object matrices are only guaranteed current once the render calls above have run -
		// see AddPointAnchor.getScreenPosition. Handed straight to subscribers (useLiveElementPosition,
		// via AddPointButton) rather than through GroomReactBridge/setState - see subscribeAddPointScreenPosition's
		// doc for why a state update lagged the canvas's own synchronous draw by a frame.
		if (this.addPointScreenPositionListeners.size > 0) {
			// Hidden whenever the curve-insert hint is showing instead - both are "where the next point
			// goes" affordances, so showing both at once would be confusing (see SplineCurveInsertHint.tsx).
			const addPointScreenPosition = this.hoveredCurvePoint
				? null
				: this.addPointAnchor.getScreenPosition(
						this.camera,
						this.mountElement.clientWidth,
						this.mountElement.clientHeight
					)
			this.addPointScreenPositionListeners.forEach((listener) => listener(addPointScreenPosition))
		}
		if (this.curveInsertScreenPositionListeners.size > 0) {
			const curveInsertScreenPosition = this.curveInsertHintAnchor.getScreenPosition(
				this.camera,
				this.mountElement.clientWidth,
				this.mountElement.clientHeight
			)
			this.curveInsertScreenPositionListeners.forEach((listener) => listener(curveInsertScreenPosition))
		}
	}

	public dispose(): void {
		this.editor.controller.removeOnToolChangedListener(this.handleInteractionHandlersChangedBound)
		this.resizeObserver.dispose()
		this.canvasEventHandler.dispose()
		this.splineVertexWidget.dispose()
		this.splineVertexGizmo.dispose()
		this.scalpMesh.geometry.dispose()
		;(this.scalpMesh.material as Material).dispose()
		this.renderer.domElement.removeEventListener('pointerdown', this.handleViewHelperPointerDownBound, true)
		document.removeEventListener('pointerdown', this.handleGlobalPointerDownBound)
		this.viewHelper.dispose()
		this.controls.dispose()
		this.renderer.dispose()
		this.renderer.domElement.remove()
	}

	private frameObjects(targets: readonly Object3D[]): void {
		if (targets.length === 0) {
			return
		}
		const box = new Box3()
		const targetBox = new Box3()
		targets.forEach((target) => box.union(targetBox.setFromObject(target)))
		if (box.isEmpty()) {
			return
		}
		this.frameBox(box)
	}

	private frameBox(box: Box3): void {
		const center = box.getCenter(new Vector3())
		const { radius } = box.getBoundingSphere(new Sphere())

		const verticalFov = (this.camera.fov * Math.PI) / 180
		const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect)
		const distance =
			EDITOR_VIEWPORT.FRAME_DISTANCE_PADDING *
			radius *
			Math.max(1 / Math.sin(verticalFov / 2), 1 / Math.sin(horizontalFov / 2))

		const direction = this.camera.position.clone().sub(this.controls.target)
		if (direction.lengthSq() === 0) {
			direction.set(0, 0, 1)
		}
		direction.normalize()

		this.camera.position.copy(center).addScaledVector(direction, distance)
		this.controls.target.copy(center)
		this.controls.update()
	}

	/** Placeholder geometry, immediately replaced by the first syncSplineObjects call's updateSplineBodyGeometry - see SplineCurveGeometryGenerator/SplineCardStripGeometryGenerator. */
	private createSplineBodyMesh(splineId: string): Group {
		return createSplineBodyGroup(
			splineId,
			this.id,
			this.editor.controller.splineLineMaterial,
			this.editor.controller.splineColliderMaterial,
			this.editor.controller.cardStripShadedMaterial,
			this.editor.controller.cardStripWireframeMaterial
		)
	}

	/** The single selected spline's mesh, in the shape SplineVertexWidget.update wants - null while the selection isn't exactly one spline. */
	private getSelectedSpline(objectIds: ReadonlySet<string>): SelectedSpline | null {
		if (objectIds.size !== 1) {
			return null
		}
		const id = [...objectIds][0]
		const object = this.getSplineObject3D(id)
		return object ? { id, object } : null
	}

	/**
	 * Applies this frame's view mode + selection-driven ghosting to every spline body's card strip
	 * and curve line - see GROOM's request list: "display curve on top of selected quad strip",
	 * "display unselected cards as transparent ghost", "display selected card opaque and following
	 * view mode", "when nothing is selected display all cards following view mode". Also resolves
	 * which of each spline's collider tube/card strip should be pickable this frame
	 * (getPickableBodyCollider) - the same `isSelected` this loop already computes for ghosting, plus
	 * `curveEditingModeActive` (`activeTool === 'select'`, computed once by the caller) - and returns
	 * the flattened result for the caller to feed into RaycastableObjectsManager.rebuild, rather than
	 * mutating each mesh's own `.raycast` (see that class's doc for why). The scalp ("base mesh") is
	 * untouched by any of this - see createScalpMesh.
	 */
	private applyViewModeAndGhosting(
		selectedObjectIds: ReadonlySet<string>,
		viewMode: GroomViewMode,
		curveEditingModeActive: boolean
	): Object3D[] {
		const pickableBodyColliders: Object3D[] = []
		// "Textured" applies the composed preview material (see
		// GroomEditorController.ensureCardStripPreviewMap/HairCardPreviewMapComposer.composePreview).
		const usesPreviewMaterial = viewMode === 'textured'
		// "no alpha baked - no preview map, do nothing" (see GroomHairCardLookup.getBakeStatus) - a
		// 'missing' project just falls back to the plain shaded material below.
		const canComposePreview = this.editor.hairCardLookup.getBakeStatus() !== 'missing'
		if (usesPreviewMaterial && canComposePreview) {
			const bakedMaps = this.editor.hairCardLookup.getBakedMaps()
			this.editor.controller.ensureCardStripPreviewMap(bakedMaps, this.editor.hairCardLookup.getPreviewColors())
		}
		for (const group of this.splineObjectsGroup.children) {
			const splineId = tryGetSceneObjectId(group)
			if (!splineId) {
				continue
			}
			const { line, cardStrip, cardStripWireframe } = getSplineBodyRenderChildren(group)
			const hasCardStrip = hasSplineCardStrip(group)
			const isSelected = selectedObjectIds.has(splineId)
			const isGhosted = selectedObjectIds.size > 0 && !isSelected

			const pickableCollider = getPickableBodyCollider(group, isSelected, curveEditingModeActive)
			if (pickableCollider) {
				pickableBodyColliders.push(pickableCollider)
			}

			if (isGhosted) {
				// A ghost is a dimmed backdrop, not something being authored - it never shows
				// wireframe/texture detail regardless of view mode, and its curve line hides entirely
				// (the ghosted card alone represents it, per "display card strip only for unselected").
				cardStrip.visible = hasCardStrip
				cardStrip.material = this.editor.controller.cardStripGhostMaterial
				cardStripWireframe.visible = false
				line.visible = !hasCardStrip
				continue
			}

			cardStrip.visible = hasCardStrip && viewMode !== 'wireframe'
			cardStrip.material =
				usesPreviewMaterial && canComposePreview
					? this.editor.controller.cardStripPreviewMaterial
					: this.editor.controller.cardStripShadedMaterial
			cardStripWireframe.visible = hasCardStrip && (viewMode === 'wireframe' || viewMode === 'wireframeOnShaded')
			// The curve is an editing affordance, not a permanent visual: shown while selected (on top
			// of its own card strip, see SplineBodyGeometry's renderOrder/polygonOffset), or always when
			// there's no card strip yet to represent the spline instead.
			line.visible = isSelected || !hasCardStrip
		}
		return pickableBodyColliders
	}

	/** The head/scalp proxy mesh - visual twin of GroomScalp.SCALP_SPHERE, which handlers raycast against for placement (see PlaceSplineInteractionHandler). Not tagged/hit-testable itself - it's a backdrop, not a pickable scene object. Always fully opaque - the "base mesh" - regardless of view mode/selection, unlike a spline's card strip. */
	private createScalpMesh(colors: (typeof EDITOR_SCENE_COLORS)[EditorTheme]): Mesh {
		const geometry = new SphereGeometry(
			SCALP_SPHERE.radius,
			GROOM.SCALP.WIDTH_SEGMENTS,
			GROOM.SCALP.HEIGHT_SEGMENTS
		)
		const material = new MeshStandardMaterial({ color: colors.scalp })
		const mesh = new Mesh(geometry, material)
		mesh.name = `${this.id}Scalp`
		mesh.position.copy(SCALP_SPHERE.center)
		mesh.raycast = () => {}
		return mesh
	}

	private handleResize(): void {
		const { clientWidth, clientHeight } = this.mountElement
		if (clientWidth === 0 || clientHeight === 0) {
			return
		}
		this.camera.aspect = clientWidth / clientHeight
		this.camera.updateProjectionMatrix()
		this.renderer.setSize(clientWidth, clientHeight)
	}

	/** Rebuilds the router's handler list from the active tool - called on tool activation (see constructor). */
	private getInteractionHandlers(): InteractionHandler[] {
		return [...this.editor.controller.getInteractionHandlers(this), this.orbitHandler]
	}
}
