import { EDITOR_SCENE_COLORS, EDITOR_VIEWPORT, EditorTheme } from '@/constants'
import { CanvasEventHandler } from '@/editor/interaction/CanvasEventHandler'
import { OrbitInteractionHandler } from '@/editor/interaction/handlers/OrbitInteractionHandler'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { CameraUpdateController } from '@/editor/main/CameraUpdateController'
import { Editor } from '@/editor/main/Editor'
import { ElementResizeObserver } from '@/editor/main/ElementResizeObserver'
import { HitTester } from '@/editor/main/HitTester'
import { HairCardWidget, SelectedHairCard } from '@/editor/main/HairCardWidget'
import { EditorMode } from '@/editor/main/modes/EditorMode'
import { SceneObjectData } from '@/editor/main/Project'
import { tagSceneObject, tryGetSceneObjectId } from '@/editor/main/SceneObjectRef'
import { WorkingAreaGrid } from '@/editor/main/WorkingAreaGrid'
import {
	AmbientLight,
	Box3,
	BufferGeometry,
	Clock,
	Color,
	DirectionalLight,
	Group,
	Line,
	Mesh,
	Object3D,
	PerspectiveCamera,
	Scene,
	Sphere,
	Vector3,
	WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'

let nextViewportNumber = 1

/**
 * One independent view onto the project - its own scene, camera, renderer, controls, hit tester
 * and interaction system (CanvasEventHandler + handlers). Nothing here is shared between
 * viewports; each builds its own scene object meshes straight from Project.scene data (see
 * syncSceneObjects).
 */
export class Viewport {
	public readonly id: string = `viewport-${nextViewportNumber++}`

	public readonly scene: Scene

	/** Rendered as a second pass with depth cleared, so its contents draw on top of the main scene. */
	public readonly overlayScene: Scene

	public readonly camera: PerspectiveCamera

	public readonly renderer: WebGLRenderer

	public readonly controls: OrbitControls

	public readonly viewHelper: ViewHelper

	public readonly hitTester: HitTester

	public readonly canvasEventHandler: CanvasEventHandler

	public readonly sceneObjectsGroup: Group

	/** Every hair card's rectangle-and-handles gizmo - drives move/resize (see HairCardResizeInteractionHandler/HairCardMoveInteractionHandler). */
	public readonly hairCardWidget: HairCardWidget

	/** Fires once per frame after the camera's final position for that frame is set - see render(). HairCardWidget consumes it to keep its handles a constant screen size. */
	public readonly cameraUpdateController: CameraUpdateController = new CameraUpdateController()

	/** Accented-border/muted-subdivision grid covering the 0-1 square hair cards are laid out inside - see HairCardWorkingArea's clamp helpers. */
	private readonly workingAreaGrid: WorkingAreaGrid

	/** Every hair card's generated strand mesh, keyed by card id - mirrors EditorController.hairCardStrands (see syncHairCardStrandMeshes), which every viewport shares. */
	private readonly hairCardStrandsGroup: Group

	private readonly hairCardStrandMeshes: Map<string, Mesh> = new Map()

	private readonly hairCardStrandsSubscription: AbortController

	// Camera orbit works regardless of active mode/tool, so it's kept outside the mode/tool system
	// entirely, always present at lowest priority (see getInteractionHandlers). A hair card's
	// move/resize drag captures the pointer for its own duration (see HairCardMoveInteractionHandler,
	// HairCardResizeInteractionHandler), so it never actually competes with this handler mid-drag.
	private readonly orbitHandler: OrbitInteractionHandler

	private readonly handleInteractionHandlersChangedBound = (): void => {
		this.canvasEventHandler.setHandlers(this.getInteractionHandlers())
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
		public readonly editor: Editor,
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

		this.workingAreaGrid = new WorkingAreaGrid()
		this.scene.add(this.workingAreaGrid.innerLines)
		this.scene.add(this.workingAreaGrid.border)

		this.sceneObjectsGroup = new Group()
		this.sceneObjectsGroup.name = `${this.id}SceneObjects`
		this.scene.add(this.sceneObjectsGroup)

		this.hairCardStrandsGroup = new Group()
		this.hairCardStrandsGroup.name = `${this.id}HairCardStrands`
		this.scene.add(this.hairCardStrandsGroup)
		this.hairCardStrandsSubscription = editor.controller.hairCardStrands.subscribe(() =>
			this.syncHairCardStrandMeshes()
		)
		// Picks up any strand geometry already cached (e.g. a project loaded before this viewport
		// existed) instead of waiting for the next controller change to mirror it in.
		this.syncHairCardStrandMeshes()

		this.hairCardWidget = new HairCardWidget(this.camera, this.cameraUpdateController)

		this.hitTester = new HitTester()
		// Corner handles live in hairCardWidget.handleGroup (an overlay-scene child), not
		// sceneObjectsGroup - included here so they're pickable even though they're not persisted
		// scene objects - see HairCardResizeInteractionHandler.
		// The widget's handles are their own, higher-priority tier - see HitTester's class doc for why
		// a flat combined list would let a card mesh block its own resize handles from being picked.
		this.hitTester.setTargets([[this.hairCardWidget.handleGroup], [this.sceneObjectsGroup]])
		this.orbitHandler = new OrbitInteractionHandler(this)
		this.canvasEventHandler = new CanvasEventHandler(this, this.getInteractionHandlers())
		editor.controller.modeController.addOnModeChangedListener(this.handleInteractionHandlersChangedBound)

		this.overlayScene.add(this.hairCardWidget.group)

		this.setTheme(this.editor.controller.getTheme())

		this.resizeObserver = new ElementResizeObserver(mountElement, () => this.handleResize())
	}

	public setTheme(theme: EditorTheme): void {
		const colors = EDITOR_SCENE_COLORS[theme]
		this.scene.background = new Color(colors.viewportBackground)
		this.workingAreaGrid.setTheme(theme)
	}

	/** Reconciles this viewport's scene object meshes with the project's scene data - see Editor.syncScene. */
	public syncSceneObjects(items: readonly SceneObjectData[]): void {
		const existingById = new Map(
			this.sceneObjectsGroup.children.map((object) => [tryGetSceneObjectId(object), object] as const)
		)
		const seen = new Set<string>()
		for (const item of items) {
			seen.add(item.id)
			let object = existingById.get(item.id)
			if (!object) {
				object = this.createHairCardMesh(item.id)
				this.sceneObjectsGroup.add(object)
			}
			object.position.set(item.position.x, item.position.y, item.position.z)
			// Cards aren't rotatable and are sized by width/depth, not a persisted scale - see
			// docs/editor/hair-cards-plan.md. The mesh's own scale is still how that size reaches the
			// geometry (hairCardGeometry is a unit square) and how HairCardWidget reads it back. Width
			// scales local/world X, depth scales local/world Y - Z (the geometry's flat axis) stays 1.
			object.scale.set(item.width, item.depth, 1)
		}
		for (const [id, object] of existingById) {
			if (id && !seen.has(id)) {
				this.sceneObjectsGroup.remove(object)
			}
		}
	}

	/** Looks up one of this viewport's own scene object meshes by its stable scene object id - used by HairCardWidget. */
	public getSceneObject3D(sceneObjectId: string): Object3D | null {
		return this.sceneObjectsGroup.children.find((object) => tryGetSceneObjectId(object) === sceneObjectId) ?? null
	}

	/** Moves the camera to frame every selected object (or the whole scene when selection is empty). */
	public frameSelected(objectIds: ReadonlySet<string>): void {
		if (objectIds.size === 0) {
			this.frameAll()
			return
		}
		const targets = [...objectIds]
			.map((objectId) => this.getSceneObject3D(objectId))
			.filter((object): object is Object3D => object !== null)
		this.frameObjects(targets)
	}

	/** Moves the camera to frame the entire scene, plus the working area even when the scene is empty - so a fresh viewport opens zoomed to something meaningful instead of the constructor's arbitrary starting distance. */
	public frameAll(): void {
		const box = new Box3().setFromObject(this.sceneObjectsGroup)
		box.union(this.workingAreaGrid.box)
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
		// reads it (see HairCardWidget.refreshHandleScale).
		this.cameraUpdateController.notify()

		const { selectedObjectIds, hiddenIdentifiers } = this.editor.reactBridge.getState()
		this.applyVisibility(hiddenIdentifiers)

		this.hairCardWidget.update(this.getSelectedHairCard(selectedObjectIds))

		this.renderer.clear()
		this.renderer.render(this.scene, this.camera)
		this.renderer.clearDepth()
		this.renderer.render(this.overlayScene, this.camera)
		this.viewHelper.render(this.renderer)
	}

	public dispose(): void {
		this.editor.controller.modeController.removeOnModeChangedListener(this.handleInteractionHandlersChangedBound)
		this.resizeObserver.dispose()
		this.canvasEventHandler.dispose()
		this.hairCardWidget.dispose()
		this.workingAreaGrid.dispose()
		this.hairCardStrandsSubscription.abort()
		this.renderer.domElement.removeEventListener('pointerdown', this.handleViewHelperPointerDownBound, true)
		this.viewHelper.dispose()
		this.controls.dispose()
		this.renderer.dispose()
		this.renderer.domElement.remove()
	}

	protected frameObjects(targets: readonly Object3D[]): void {
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

	/**
	 * Mirrors EditorController.hairCardStrands' geometry cache into this viewport's own meshes -
	 * called on every controller change (subscribe, above) as well as once up front to pick up
	 * whatever's already cached. Each mesh reuses the shared geometry/material instances directly
	 * (no per-viewport copy), positioned at its card's current center since the geometry itself is
	 * in card-local space (see HairCardStrandsGenerator).
	 */
	private syncHairCardStrandMeshes(): void {
		const geometries = this.editor.controller.hairCardStrands.getEntries()
		const seen = new Set<string>()
		geometries.forEach((geometry, cardId) => {
			seen.add(cardId)
			this.getOrCreateHairCardStrandMesh(cardId, geometry)
		})
		for (const [cardId, mesh] of this.hairCardStrandMeshes) {
			if (!seen.has(cardId)) {
				this.hairCardStrandsGroup.remove(mesh)
				this.hairCardStrandMeshes.delete(cardId)
			}
		}
	}

	private getOrCreateHairCardStrandMesh(cardId: string, geometry: BufferGeometry): void {
		let mesh = this.hairCardStrandMeshes.get(cardId)
		if (!mesh) {
			mesh = new Mesh(geometry, this.editor.controller.hairCardStrandMaterial)
			mesh.name = `${this.id}HairCardStrands:${cardId}`
			// Not a pick target - the card's own collider mesh (EditorController.hairCardMaterial)
			// already handles selecting it.
			mesh.raycast = () => {}
			this.hairCardStrandMeshes.set(cardId, mesh)
			this.hairCardStrandsGroup.add(mesh)
		} else if (mesh.geometry !== geometry) {
			mesh.geometry = geometry
		}
		const card = this.editor.project.scene.get(cardId)
		if (card) {
			mesh.position.set(card.position.x, card.position.y, card.position.z)
		}
	}

	private createHairCardMesh(sceneObjectId: string): Mesh {
		const mesh = new Mesh(this.editor.controller.hairCardGeometry, this.editor.controller.hairCardMaterial)
		mesh.name = `${this.id}HairCard:${sceneObjectId}`
		tagSceneObject(mesh, sceneObjectId)

		// The card's always-on unselected-state visual (see EditorController.hairCardOutlineGeometry) -
		// a child of the (invisible) collider mesh so it inherits the same position/width/depth
		// transform for free, with no extra per-card sync of its own. Not pickable, same as
		// WorkingAreaGrid's lines - the collider mesh above is the only pick target.
		const outline = new Line(this.editor.controller.hairCardOutlineGeometry, this.editor.controller.hairCardOutlineMaterial)
		outline.name = `${this.id}HairCardOutline:${sceneObjectId}`
		outline.raycast = () => {}
		mesh.add(outline)

		return mesh
	}

	/** The single selected hair card's mesh, in the shape HairCardWidget.update wants - null while the selection isn't exactly one hair card. */
	private getSelectedHairCard(objectIds: ReadonlySet<string>): SelectedHairCard | null {
		if (objectIds.size !== 1) {
			return null
		}
		const id = [...objectIds][0]
		if (this.editor.project.scene.get(id)?.type !== 'hairCard') {
			return null
		}
		const object = this.getSceneObject3D(id)
		return object ? { id, object } : null
	}

	/** Mirrors ReactBridge's hidden-identifier set onto this viewport's own scene object meshes, including a hidden hair card's separately-tracked strand mesh (see hairCardStrandMeshes/syncHairCardStrandMeshes). */
	private applyVisibility(hiddenIdentifiers: ReadonlySet<string>): void {
		this.sceneObjectsGroup.children.forEach((object) => {
			const id = tryGetSceneObjectId(object)
			object.visible = id === null || !hiddenIdentifiers.has(id)
		})
		this.hairCardStrandMeshes.forEach((mesh, cardId) => {
			mesh.visible = !hiddenIdentifiers.has(cardId)
		})
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

	/** Rebuilds the router's handler list from the active EditorMode/tool - called on mode or tool activation (see constructor). */
	private getInteractionHandlers(): InteractionHandler[] {
		const activeMode: EditorMode = this.editor.controller.modeController.getActiveMode()
		return [...activeMode.getInteractionHandlers(this), this.orbitHandler]
	}
}
