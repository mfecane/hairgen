import { EDITOR_SCENE_COLORS, HAIR_CARD } from '@/constants'
import { CameraUpdateController } from '@/editor/main/CameraUpdateController'
import { HAIR_CARD_HANDLES, HairCardHandle, tagHairCardHandle } from '@/editor/main/HairCardHandleRef'
import { tagSceneObject } from '@/editor/main/SceneObjectRef'
import { BoxGeometry, Camera, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

const FLOATS_PER_SEGMENT = 6 // two xyz endpoints
const OUTLINE_CORNER_COUNT = 4 // one edge per corner, closing the rectangle
// A hair's-width in front of z = 0, same reasoning as WorkingAreaGrid's own offset - avoids
// z-fighting the outline against GridHelper/WorkingAreaGrid's own lines at the same depth.
const Z_OFFSET = 0.002

export interface SelectedHairCard {
	id: string
	object: Object3D
}

/**
 * Shown while exactly one hair card is selected (see Viewport.render): a rectangle outline
 * tracking the card's live bounds, plus corner and side handles - drag a corner to resize both
 * axes, a side to resize just one (HairCardResizeInteractionHandler), or the card body itself to
 * move it (HairCardMoveInteractionHandler). Handles stay a roughly constant size on screen
 * regardless of zoom - see refreshHandleScale, driven by CameraUpdateController rather than
 * recomputed inline in update() so sizing stays purely a camera concern, independent of selection.
 * Each handle is two meshes: a small visible cube (not pickable - its raycast is disabled) and a
 * larger invisible collider on top of it (HAIR_CARD.HANDLE_COLLIDER_SCALE), which is the one
 * that's tagged and actually picked - a tiny visible handle with a tight hit box is uncomfortable
 * to grab, so the pick target is deliberately bigger than what's drawn.
 * Own tool, own commands, own pickable gizmo - see docs/editor/hair-cards-plan.md.
 */
export class HairCardWidget {
	public readonly group: Group = new Group()

	/** Collider meshes only - what Viewport feeds to HitTester alongside sceneObjectsGroup. */
	public readonly handleGroup: Group = new Group()

	private readonly outlineMaterial: LineMaterial

	private readonly outline: LineSegments2

	private readonly outlinePositions: Float32Array = new Float32Array(OUTLINE_CORNER_COUNT * FLOATS_PER_SEGMENT)

	// A unit cube shared by every handle's visible mesh and its collider - each is scaled
	// per-instance to its current screen-constant world size (see refreshHandleScale), so the
	// geometry itself stays a fixed reference shape.
	private readonly handleGeometry: BoxGeometry = new BoxGeometry(1, 1, 1)

	private readonly handleMaterial: MeshBasicMaterial

	// Fully transparent - the pick target itself, never drawn. See the class doc for why it's a
	// separate, larger mesh rather than just picking the visible one.
	private readonly colliderMaterial: MeshBasicMaterial

	private readonly handles: ReadonlyArray<{ handle: HairCardHandle; mesh: Mesh; collider: Mesh }>

	private readonly cameraUpdateSubscription: AbortController

	private readonly lastCenter: Vector3 = new Vector3()

	public constructor(
		private readonly camera: Camera,
		cameraUpdateController: CameraUpdateController
	) {
		this.group.name = 'hairCardWidget'
		this.group.visible = false

		this.outlineMaterial = new LineMaterial({ color: EDITOR_SCENE_COLORS.dark.hairCardWidget, linewidth: 2 })
		const outlineGeometry = new LineSegmentsGeometry()
		this.outline = new LineSegments2(outlineGeometry, this.outlineMaterial)
		this.outline.name = 'hairCardWidgetOutline'
		// Not pickable - only each handle's collider below and the card's own collider mesh
		// (EditorController.hairCardMaterial) are.
		this.outline.raycast = () => {}
		this.group.add(this.outline)

		this.handleMaterial = new MeshBasicMaterial({
			name: 'hairCardHandleMaterial',
			color: EDITOR_SCENE_COLORS.dark.hairCardWidget,
		})
		this.colliderMaterial = new MeshBasicMaterial({
			name: 'hairCardHandleColliderMaterial',
			transparent: true,
			opacity: 0,
			depthWrite: false,
		})
		this.handles = HAIR_CARD_HANDLES.map((handle) => {
			const mesh = new Mesh(this.handleGeometry, this.handleMaterial)
			mesh.name = `hairCardHandle:${handle.signX}:${handle.signY}:${handle.axis}`
			// The collider (below) is the pick target, not this - two meshes at the same spot would
			// otherwise both show up in a raycast's intersection list.
			mesh.raycast = () => {}

			const collider = new Mesh(this.handleGeometry, this.colliderMaterial)
			collider.name = `hairCardHandleCollider:${handle.signX}:${handle.signY}:${handle.axis}`

			return { handle, mesh, collider }
		})
		this.handles.forEach(({ mesh, collider }) => {
			this.handleGroup.add(mesh)
			this.handleGroup.add(collider)
		})
		this.group.add(this.handleGroup)

		this.cameraUpdateSubscription = cameraUpdateController.subscribe(() => this.refreshHandleScale())
	}

	/** Repositions the outline and handles to the given card's live transform, or hides the widget entirely when nothing (or something else) is selected. */
	public update(card: SelectedHairCard | null): void {
		if (!card) {
			this.group.visible = false
			return
		}
		this.group.visible = true

		const { position, scale } = card.object
		this.lastCenter.set(position.x, position.y, 0)
		const halfWidth = scale.x / 2
		const halfDepth = scale.y / 2

		this.handles.forEach(({ handle, mesh, collider }) => {
			const handleX = position.x + handle.signX * halfWidth
			const handleY = position.y + handle.signY * halfDepth
			mesh.position.set(handleX, handleY, Z_OFFSET)
			collider.position.set(handleX, handleY, Z_OFFSET)
			// Re-tagged every update (not just on creation) since which card owns a handle changes
			// with the selection. Tagged on the collider - the actual pick target (see the class doc)
			// - not the visible mesh, which has picking disabled. Also tagged as the card's own scene
			// object (tagSceneObject) so a plain click on a handle - no drag - still resolves to
			// selecting the card rather than deselecting it (see SelectionInteractionHandler).
			tagSceneObject(collider, card.id)
			tagHairCardHandle(collider, card.id, handle)
		})

		const corners = [
			{ x: position.x - halfWidth, y: position.y - halfDepth },
			{ x: position.x + halfWidth, y: position.y - halfDepth },
			{ x: position.x + halfWidth, y: position.y + halfDepth },
			{ x: position.x - halfWidth, y: position.y + halfDepth },
		]
		let offset = 0
		for (let i = 0; i < corners.length; i++) {
			const start = corners[i]
			const end = corners[(i + 1) % corners.length]
			offset = this.writeSegment(offset, start.x, start.y, Z_OFFSET, end.x, end.y, Z_OFFSET)
		}
		this.outline.geometry.setPositions(this.outlinePositions)
	}

	public dispose(): void {
		this.cameraUpdateSubscription.abort()
		this.outline.geometry.dispose()
		this.outlineMaterial.dispose()
		this.handleGeometry.dispose()
		this.handleMaterial.dispose()
		this.colliderMaterial.dispose()
	}

	/**
	 * Keeps every handle a roughly constant size on screen: world size grows with distance to the
	 * camera, so apparent (projected) size stays put - see HAIR_CARD.HANDLE_SCREEN_SIZE. Each
	 * collider is scaled up further from the same base size (HAIR_CARD.HANDLE_COLLIDER_SCALE) so
	 * it stays comfortable to grab even once the visible handle itself is small.
	 */
	private refreshHandleScale(): void {
		if (!this.group.visible) {
			return
		}
		const distance = this.camera.position.distanceTo(this.lastCenter)
		const size = distance * HAIR_CARD.HANDLE_SCREEN_SIZE
		this.handles.forEach(({ mesh, collider }) => {
			mesh.scale.setScalar(size)
			collider.scale.setScalar(size * HAIR_CARD.HANDLE_COLLIDER_SCALE)
		})
	}

	private writeSegment(
		offset: number,
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number
	): number {
		this.outlinePositions[offset++] = x0
		this.outlinePositions[offset++] = y0
		this.outlinePositions[offset++] = z0
		this.outlinePositions[offset++] = x1
		this.outlinePositions[offset++] = y1
		this.outlinePositions[offset++] = z1
		return offset
	}
}
