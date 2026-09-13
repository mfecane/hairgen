import { EDITOR_SCENE_COLORS, GROOM } from '@/constants'
import { CameraUpdateController } from '@/editor/main/CameraUpdateController'
import { tagSceneObject } from '@/editor/main/SceneObjectRef'
import { getSplineBodyVertices, getSplineVertexDirections } from '@/editor/groom/main/SplineBodyGeometry'
import { getVertexGizmoFrame } from '@/editor/groom/main/SplineVertexFrame'
import {
	HoveredSplineVertexHandle,
	SplineVertexHandleKind,
	tagSplineVertex,
} from '@/editor/groom/main/SplineVertexRef'
import { SelectedSpline } from '@/editor/groom/main/SplineVertexWidget'
import {
	Camera,
	Color,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	SphereGeometry,
	TorusGeometry,
	Vector3,
} from 'three'

// TorusGeometry lies flat in its local XY plane (the hole runs through local Z) - see
// three.js' own TorusGeometry vertex generation - so aligning the ring's plane to be perpendicular
// to the tangent means rotating this axis onto the tangent, not local Y (which projectPerpendicular
// et al treat as "up" in an entirely unrelated, purely 2D sense).
const RING_NORMAL: Vector3 = new Vector3(0, 0, 1)
const UP: Vector3 = new Vector3(0, 1, 0)

/**
 * Shown for exactly one vertex at a time - the selected spline's "active" vertex (see
 * GroomReactBridgeState.activeVertexIndex) - a rotate ring plus a single-axis scale handle,
 * alongside SplineVertexWidget's always-shown position handles. A sibling class, not an extension of
 * SplineVertexWidget: the contracts genuinely differ (fixed pool for every vertex vs. at most one
 * vertex's extra handles), see the groom editor plan. Mirrors SplineVertexWidget's mesh-pair/
 * constant-screen-size/tagging scheme as closely as the two extra handle shapes allow.
 *
 * Rotate: a thin, purely visual torus ring whose plane is perpendicular to the vertex's tangent
 * (SplineVertexFrame) plus a small grab-sphere sitting on the ring (offset from the scale handle's
 * axis, see SplineVertexFrame.axisB) - dragging that sphere rotates the vertex's `direction` around
 * the tangent axis. Scale: a thin, purely visual "line" (a narrow cylinder) at a fixed constant
 * screen size, longer than the rotate ring's radius so the two don't overlap. Every dimension is
 * specified directly in screen space; the rotate and scale knobs share one screen diameter and are
 * independent of the vertex's `scale` value. Dragging the scale knob still edits that value. Only
 * the two grab-spheres are ever pickable (see getPickableColliders), each using the same explicit
 * larger collider diameter.
 * See SplineVertexWidget's class doc for why a visible mesh and its collider are always two separate
 * meshes at the same spot. Both grab-spheres, plus the ring and the scale line, turn
 * GROOM.SPLINE.HANDLE_HOVER_COLOR while the pointer is over their collider (see
 * SplineHoverInteractionHandler/GroomViewport.render).
 */
export class SplineVertexGizmo {
	public readonly group: Group = new Group()

	/** Every piece's meshes, purely for scene-graph placement under `group` - never fed to HitTester directly, see getPickableColliders. */
	public readonly handleGroup: Group = new Group()

	private readonly ringGeometry: TorusGeometry
	// A unit sphere (radius 0.5) shared by the rotate grab-sphere and the scale knob's visible mesh
	// and collider - each scaled per-instance, mirrors SplineVertexWidget.handleGeometry.
	private readonly sphereGeometry: SphereGeometry
	// The scale handle's visual line at its configured screen-space radius and length. Scaling the
	// mesh uniformly by camera distance keeps both dimensions constant on screen.
	private readonly lineGeometry: CylinderGeometry

	// One material per handle piece (rather than one shared material, as elsewhere in this file's
	// siblings) since each piece's color independently flips to GROOM.SPLINE.HANDLE_HOVER_COLOR based
	// on hover state - see applyHoverColors.
	private readonly ringMaterial: MeshBasicMaterial
	private readonly rotateHandleMaterial: MeshBasicMaterial
	private readonly lineMaterial: MeshBasicMaterial
	private readonly scaleHandleMaterial: MeshBasicMaterial
	private readonly colliderMaterial: MeshBasicMaterial

	private readonly baseColor: Color
	private readonly hoverColor: Color = new Color(GROOM.SPLINE.HANDLE_HOVER_COLOR)

	private readonly ringMesh: Mesh
	private readonly rotateHandleMesh: Mesh
	private readonly rotateHandleCollider: Mesh
	private readonly lineMesh: Mesh
	private readonly scaleHandleMesh: Mesh
	private readonly scaleHandleCollider: Mesh

	private readonly cameraUpdateSubscription: AbortController

	private readonly lastVertexPosition: Vector3 = new Vector3()
	private readonly lastTangent: Vector3 = new Vector3(0, 0, 1)
	private readonly lastAxis: Vector3 = new Vector3(0, 1, 0)
	private readonly lastAxisB: Vector3 = new Vector3(1, 0, 0)
	private lastHoveredKind: SplineVertexHandleKind | null = null

	public constructor(
		private readonly camera: Camera,
		cameraUpdateController: CameraUpdateController
	) {
		this.group.name = 'splineVertexGizmo'
		this.group.visible = false

		this.baseColor = new Color(EDITOR_SCENE_COLORS.dark.splineVertexGizmo)

		this.ringGeometry = new TorusGeometry(
			GROOM.SPLINE.ROTATE_RING_SCREEN_RADIUS,
			GROOM.SPLINE.GIZMO_LINE_SCREEN_RADIUS,
			8,
			24
		)
		this.sphereGeometry = new SphereGeometry(0.5, 12, 8)
		this.lineGeometry = new CylinderGeometry(
			GROOM.SPLINE.GIZMO_LINE_SCREEN_RADIUS,
			GROOM.SPLINE.GIZMO_LINE_SCREEN_RADIUS,
			GROOM.SPLINE.SCALE_LINE_SCREEN_LENGTH,
			8,
			1
		)

		this.ringMaterial = new MeshBasicMaterial({ name: 'splineVertexGizmoRingMaterial', color: this.baseColor })
		this.rotateHandleMaterial = new MeshBasicMaterial({
			name: 'splineVertexGizmoRotateHandleMaterial',
			color: this.baseColor,
		})
		this.lineMaterial = new MeshBasicMaterial({ name: 'splineVertexGizmoLineMaterial', color: this.baseColor })
		this.scaleHandleMaterial = new MeshBasicMaterial({
			name: 'splineVertexGizmoScaleHandleMaterial',
			color: this.baseColor,
		})
		this.colliderMaterial = new MeshBasicMaterial({
			name: 'splineVertexGizmoColliderMaterial',
			transparent: true,
			opacity: 0,
			depthWrite: false,
		})

		this.ringMesh = new Mesh(this.ringGeometry, this.ringMaterial)
		this.ringMesh.name = 'splineVertexRotateRing'
		// Purely visual, never picked - see the class doc.
		this.ringMesh.raycast = () => {}

		this.rotateHandleMesh = new Mesh(this.sphereGeometry, this.rotateHandleMaterial)
		this.rotateHandleMesh.name = 'splineVertexRotateHandle'
		this.rotateHandleMesh.raycast = () => {}

		this.rotateHandleCollider = new Mesh(this.sphereGeometry, this.colliderMaterial)
		this.rotateHandleCollider.name = 'splineVertexRotateHandleCollider'
		// Its `.raycast` is left at the real default, same as scaleHandleCollider below - neither is
		// ever touched. Whether either is actually raycast against is entirely up to whether
		// getPickableColliders() (consumed by GroomViewport's per-frame RaycastableObjectsManager.rebuild
		// call) currently includes it - see that method's doc.

		this.lineMesh = new Mesh(this.lineGeometry, this.lineMaterial)
		this.lineMesh.name = 'splineVertexScaleLine'
		this.lineMesh.raycast = () => {}

		this.scaleHandleMesh = new Mesh(this.sphereGeometry, this.scaleHandleMaterial)
		this.scaleHandleMesh.name = 'splineVertexScaleHandle'
		this.scaleHandleMesh.raycast = () => {}

		this.scaleHandleCollider = new Mesh(this.sphereGeometry, this.colliderMaterial)
		this.scaleHandleCollider.name = 'splineVertexScaleHandleCollider'

		this.handleGroup.add(
			this.ringMesh,
			this.rotateHandleMesh,
			this.rotateHandleCollider,
			this.lineMesh,
			this.scaleHandleMesh,
			this.scaleHandleCollider
		)
		this.group.add(this.handleGroup)

		this.cameraUpdateSubscription = cameraUpdateController.subscribe(() => this.refreshLayout())
	}

	/**
	 * Repositions/reorients the ring and scale handle at `activeVertexIndex`'s live position, or
	 * hides the gizmo entirely when nothing is selected, no vertex is active, or the vertex's tangent
	 * is undefined (coincident vertices - see SplineVertexFrame). `hovered` is whatever handle the
	 * pointer currently sits over (any spline/vertex, or none) - only consumed when it names this
	 * gizmo's own active vertex, see applyHoverColors.
	 */
	public update(
		spline: SelectedSpline | null,
		activeVertexIndex: number | null,
		hovered: HoveredSplineVertexHandle | null
	): void {
		if (!spline || activeVertexIndex === null) {
			this.group.visible = false
			return
		}

		const vertices = getSplineBodyVertices(spline.object)
		const directions = getSplineVertexDirections(spline.object)
		const vertexPosition = vertices[activeVertexIndex]
		const storedDirection = directions[activeVertexIndex]
		if (!vertexPosition || !storedDirection) {
			this.group.visible = false
			return
		}

		const frame = getVertexGizmoFrame(vertices, activeVertexIndex, storedDirection)
		if (!frame) {
			this.group.visible = false
			return
		}

		this.group.visible = true
		this.lastVertexPosition.copy(vertexPosition)
		this.lastTangent.copy(frame.tangent)
		this.lastAxis.copy(frame.axis)
		this.lastAxisB.copy(frame.axisB)
		this.lastHoveredKind =
			hovered && hovered.splineId === spline.id && hovered.vertexIndex === activeVertexIndex ? hovered.kind : null

		// Re-tagged every update (not just on creation) since which spline/vertex owns the gizmo
		// changes with selection/activation. Also tagged as the spline's own scene object
		// (tagSceneObject) so a plain click on either handle still resolves to selecting the spline -
		// see SplineVertexWidget's class doc for the same reasoning.
		tagSceneObject(this.rotateHandleCollider, spline.id)
		tagSplineVertex(this.rotateHandleCollider, spline.id, activeVertexIndex, 'rotate')
		tagSceneObject(this.scaleHandleCollider, spline.id)
		tagSplineVertex(this.scaleHandleCollider, spline.id, activeVertexIndex, 'scale')

		this.layout()
	}

	public dispose(): void {
		this.cameraUpdateSubscription.abort()
		this.ringGeometry.dispose()
		this.sphereGeometry.dispose()
		this.lineGeometry.dispose()
		this.ringMaterial.dispose()
		this.rotateHandleMaterial.dispose()
		this.lineMaterial.dispose()
		this.scaleHandleMaterial.dispose()
		this.colliderMaterial.dispose()
	}

	/**
	 * This frame's pickable colliders - the two grab-spheres while the gizmo is actually laid out on a
	 * real active vertex (`group.visible`, set by update()), or none while hidden (its pre-first-layout
	 * origin, or a stale vertex's position after the active vertex/selection changes). Consumed by
	 * GroomViewport's per-frame RaycastableObjectsManager.rebuild call - see RaycastableObjectsManager's
	 * class doc for why this is the only thing that decides whether these meshes are actually raycast
	 * against, rather than either mesh's own `.raycast`.
	 */
	public getPickableColliders(): Object3D[] {
		return this.group.visible ? [this.rotateHandleCollider, this.scaleHandleCollider] : []
	}

	private refreshLayout(): void {
		if (!this.group.visible) {
			return
		}
		this.layout()
	}

	/**
	 * Sizes and places every piece from the cached last-known vertex/tangent/axis/scale/hover (see
	 * update()) plus the camera's current distance to the vertex - split out from update() so a
	 * camera-only move (refreshLayout, via CameraUpdateController) can re-apply constant-screen-size
	 * sizing without needing a fresh read of the live vertex data. Mirrors
	 * SplineVertexWidget.refreshHandleScale.
	 */
	private layout(): void {
		const distance = this.camera.position.distanceTo(this.lastVertexPosition)

		const ringRadius = distance * GROOM.SPLINE.ROTATE_RING_SCREEN_RADIUS
		const ringQuaternion = this.ringMesh.quaternion.setFromUnitVectors(RING_NORMAL, this.lastTangent)
		this.ringMesh.position.copy(this.lastVertexPosition)
		this.ringMesh.quaternion.copy(ringQuaternion)
		this.ringMesh.scale.setScalar(distance)

		const knobDiameter = distance * GROOM.SPLINE.GIZMO_KNOB_SCREEN_DIAMETER
		const knobColliderDiameter = distance * GROOM.SPLINE.GIZMO_KNOB_COLLIDER_SCREEN_DIAMETER
		const rotateHandlePosition = this.lastVertexPosition.clone().addScaledVector(this.lastAxisB, ringRadius)
		this.rotateHandleMesh.position.copy(rotateHandlePosition)
		this.rotateHandleMesh.scale.setScalar(knobDiameter)
		this.rotateHandleCollider.position.copy(rotateHandlePosition)
		this.rotateHandleCollider.scale.setScalar(knobColliderDiameter)

		const lineLength = distance * GROOM.SPLINE.SCALE_LINE_SCREEN_LENGTH
		// The line runs from the vertex's own position (the widget's origin, same as the rotate
		// ring's center) straight out to the knob - no gap between origin/line/knob, unlike the
		// earlier version which shifted the whole line+knob assembly BODY_WIDTH/2 past the vertex.
		const lineQuaternion = this.lineMesh.quaternion.setFromUnitVectors(UP, this.lastAxis)
		const lineCenter = this.lastVertexPosition.clone().addScaledVector(this.lastAxis, lineLength / 2)
		this.lineMesh.position.copy(lineCenter)
		this.lineMesh.quaternion.copy(lineQuaternion)
		this.lineMesh.scale.setScalar(distance)

		const scaleHandlePosition = this.lastVertexPosition.clone().addScaledVector(this.lastAxis, lineLength)
		this.scaleHandleMesh.position.copy(scaleHandlePosition)
		this.scaleHandleMesh.scale.setScalar(knobDiameter)
		this.scaleHandleCollider.position.copy(scaleHandlePosition)
		this.scaleHandleCollider.scale.setScalar(knobColliderDiameter)

		this.applyHoverColors()
	}

	/** Ring+rotate-sphere turn GROOM.SPLINE.HANDLE_HOVER_COLOR together, same for line+scale-sphere - see lastHoveredKind. */
	private applyHoverColors(): void {
		const rotateColor = this.lastHoveredKind === 'rotate' ? this.hoverColor : this.baseColor
		this.ringMaterial.color.copy(rotateColor)
		this.rotateHandleMaterial.color.copy(rotateColor)

		const scaleColor = this.lastHoveredKind === 'scale' ? this.hoverColor : this.baseColor
		this.lineMaterial.color.copy(scaleColor)
		this.scaleHandleMaterial.color.copy(scaleColor)
	}
}
