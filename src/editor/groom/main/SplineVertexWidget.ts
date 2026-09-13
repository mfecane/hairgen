import { EDITOR_SCENE_COLORS, GROOM } from '@/constants'
import { CameraUpdateController } from '@/editor/main/CameraUpdateController'
import { tagSceneObject } from '@/editor/main/SceneObjectRef'
import { getSplineBodyVertices } from '@/editor/groom/main/SplineBodyGeometry'
import { HoveredSplineVertexHandle, tagSplineVertex } from '@/editor/groom/main/SplineVertexRef'
import { Camera, Color, Group, Mesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three'

export interface SelectedSpline {
	id: string
	object: Object3D
}

/**
 * Shown while exactly one spline is selected (see GroomViewport.render): a small sphere handle per
 * vertex, draggable via SplineVertexDragInteractionHandler. Mirrors HairCardWidget's pattern
 * exactly - each handle is two meshes at the same spot: a small visible sphere (not pickable - its
 * raycast is disabled) and a larger invisible collider on top
 * (GROOM.SPLINE.POSITION_HANDLE_COLLIDER_SCREEN_DIAMETER),
 * which is the one that's tagged and actually picked. Unlike HairCardWidget, no separate outline
 * geometry is needed here - the always-visible, always-pickable spline body rod (see
 * GroomViewport.syncSplineObjects) already serves that role. Each handle owns its own material (not
 * one shared across the pool) so it can independently turn GROOM.SPLINE.HANDLE_HOVER_COLOR while the
 * pointer is over it - see update()'s `hovered` param and SplineHoverInteractionHandler. The pool
 * itself is resized (not fixed, unlike HairCardWidget's fixed 8-handle pool) to match the selected
 * spline's own vertex count every update() - see ensureHandleCount - since a spline's vertex count
 * can grow past 2 (GroomEditor.addVertexToSelectedSpline).
 */
export class SplineVertexWidget {
	public readonly group: Group = new Group()

	/** Every handle's mesh pair, purely for scene-graph placement under `group` - never fed to HitTester directly, see getColliders. */
	public readonly handleGroup: Group = new Group()

	// A unit sphere (radius 0.5, so scaling by `size` gives a `size`-diameter sphere) shared by
	// every handle's visible mesh and its collider - each is scaled per-instance to its current
	// screen-constant world size (see refreshHandleScale).
	private readonly handleGeometry: SphereGeometry = new SphereGeometry(0.5, 12, 8)

	private readonly baseColor: Color = new Color(EDITOR_SCENE_COLORS.dark.splineVertexWidget)
	private readonly hoverColor: Color = new Color(GROOM.SPLINE.HANDLE_HOVER_COLOR)

	// Fully transparent - the pick target itself, never drawn. See the class doc for why it's a
	// separate, larger mesh rather than just picking the visible one.
	private readonly colliderMaterial: MeshBasicMaterial

	// Grown/shrunk in ensureHandleCount to match the selected spline's live vertex count - not a
	// fixed-size pool, see the class doc.
	private readonly handles: Array<{ mesh: Mesh; collider: Mesh; material: MeshBasicMaterial }> = []

	private readonly cameraUpdateSubscription: AbortController

	private readonly lastCenter: Vector3 = new Vector3()

	public constructor(
		private readonly camera: Camera,
		cameraUpdateController: CameraUpdateController
	) {
		this.group.name = 'splineVertexWidget'
		this.group.visible = false

		this.colliderMaterial = new MeshBasicMaterial({
			name: 'splineVertexHandleColliderMaterial',
			transparent: true,
			opacity: 0,
			depthWrite: false,
		})
		this.group.add(this.handleGroup)

		this.cameraUpdateSubscription = cameraUpdateController.subscribe(() => this.refreshHandleScale())
	}

	/**
	 * Repositions the handles to the given spline's live vertex positions, or hides the widget
	 * entirely when nothing (or something else) is selected. `hovered` is whatever handle the
	 * pointer currently sits over (any spline/vertex/kind, or none) - only a 'position' entry naming
	 * this spline turns that one handle GROOM.SPLINE.HANDLE_HOVER_COLOR, see
	 * SplineHoverInteractionHandler.
	 */
	public update(spline: SelectedSpline | null, hovered: HoveredSplineVertexHandle | null): void {
		if (!spline) {
			this.group.visible = false
			// `group.visible = false` alone does NOT stop these colliders from being raycast - three.js'
			// Raycaster never consults `.visible` (see SplineBodyGeometry's collider/cardStrip toggling,
			// which disables `.raycast` itself for the same reason). Shrinking the pool to 0 actually
			// removes them from handleGroup (what GroomViewport feeds the hitTester), rather than leaving
			// a stale, still-pickable handle sitting at the last selected spline's vertex position.
			this.ensureHandleCount(0)
			return
		}
		this.group.visible = true

		const vertices = getSplineBodyVertices(spline.object)
		this.lastCenter.copy(vertices[0] ?? spline.object.position)
		this.ensureHandleCount(vertices.length)

		this.handles.forEach(({ mesh, collider, material }, index) => {
			const position = vertices[index]
			if (!position) {
				return
			}
			mesh.position.copy(position)
			collider.position.copy(position)
			// Re-tagged every update (not just on creation) since which spline owns a handle changes
			// with the selection. Tagged on the collider - the actual pick target (see the class doc)
			// - not the visible mesh, which has picking disabled. Also tagged as the spline's own
			// scene object (tagSceneObject) so a plain click on a handle - no drag - still resolves to
			// selecting the spline rather than deselecting it (see SplineSelectionInteractionHandler).
			tagSceneObject(collider, spline.id)
			tagSplineVertex(collider, spline.id, index, 'position')

			const isHovered =
				hovered && hovered.kind === 'position' && hovered.splineId === spline.id && hovered.vertexIndex === index
			material.color.copy(isHovered ? this.hoverColor : this.baseColor)
		})
	}

	public dispose(): void {
		this.cameraUpdateSubscription.abort()
		this.handleGeometry.dispose()
		this.handles.forEach(({ material }) => material.dispose())
		this.colliderMaterial.dispose()
	}

	/**
	 * This frame's pickable colliders - exactly the live pool (ensureHandleCount already only ever
	 * holds as many handles as the selected spline currently has vertices, or none while nothing's
	 * selected, so there's nothing further to filter here). Consumed by GroomViewport's per-frame
	 * RaycastableObjectsManager.rebuild call - see that class's doc.
	 */
	public getColliders(): Object3D[] {
		return this.handles.map(({ collider }) => collider)
	}

	/**
	 * Grows or shrinks the handle pool to exactly `count` entries, mirroring
	 * GroomViewport.syncSplineObjects' add/remove-by-diff reconciliation. New handles get their own
	 * material (see the class doc); removed ones have theirs disposed - the shared handleGeometry/
	 * colliderMaterial are never touched here, only ever disposed once in dispose().
	 */
	private ensureHandleCount(count: number): void {
		while (this.handles.length < count) {
			const index = this.handles.length
			const material = new MeshBasicMaterial({ name: `splineVertexHandleMaterial:${index}`, color: this.baseColor })
			const mesh = new Mesh(this.handleGeometry, material)
			mesh.name = `splineVertexHandle:${index}`
			// The collider (below) is the pick target, not this - two meshes at the same spot would
			// otherwise both show up in a raycast's intersection list.
			mesh.raycast = () => {}

			const collider = new Mesh(this.handleGeometry, this.colliderMaterial)
			collider.name = `splineVertexHandleCollider:${index}`

			this.handleGroup.add(mesh, collider)
			this.handles.push({ mesh, collider, material })
		}
		while (this.handles.length > count) {
			const handle = this.handles.pop()
			if (!handle) {
				break
			}
			this.handleGroup.remove(handle.mesh, handle.collider)
			handle.material.dispose()
		}
	}

	/**
	 * Keeps every handle a roughly constant size on screen: world size grows with distance to the
	 * camera, so apparent (projected) size stays put - see
	 * GROOM.SPLINE.POSITION_HANDLE_SCREEN_DIAMETER.
	 * Mirrors HairCardWidget.refreshHandleScale.
	 */
	private refreshHandleScale(): void {
		if (!this.group.visible) {
			return
		}
		const distance = this.camera.position.distanceTo(this.lastCenter)
		const handleDiameter = distance * GROOM.SPLINE.POSITION_HANDLE_SCREEN_DIAMETER
		const colliderDiameter = distance * GROOM.SPLINE.POSITION_HANDLE_COLLIDER_SCREEN_DIAMETER
		this.handles.forEach(({ mesh, collider }) => {
			mesh.scale.setScalar(handleDiameter)
			collider.scale.setScalar(colliderDiameter)
		})
	}
}
