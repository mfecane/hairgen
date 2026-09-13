import { GROOM } from '@/constants'
import { tagSceneObject } from '@/editor/main/SceneObjectRef'
import { HairCardUvRect } from '@/editor/groom/main/GroomHairCardLookup'
import { SplineCardStripGeometryGenerator } from '@/editor/groom/main/SplineCardStripGeometryGenerator'
import { SplineCurveGeometryGenerator } from '@/editor/groom/main/SplineCurveGeometryGenerator'
import { BufferGeometry, CatmullRomCurve3, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3 } from 'three'

const curveGenerator = new SplineCurveGeometryGenerator()
const cardStripGenerator = new SplineCardStripGeometryGenerator()

/** Sample count for findClosestPointOnSplineBody's nearest-point search - a hover hint's snapped position doesn't need an exact projection, just to visually sit on the curve. */
const CLOSEST_POINT_SAMPLES = 200

/**
 * A spline body is a `Group` (see GroomViewport.syncSplineObjects/createSplineBodyGroup) holding
 * four children built from the same smooth curve: a visible `Line` tracing it
 * (SplineCurveGeometryGenerator), an invisible collider `Mesh` (a tube extruded along it), and the
 * "card strip" - a flat, textured ribbon instancing the spline's referenced hair card
 * (SplineCardStripGeometryGenerator), split into a shaded/textured/ghost `cardStrip` mesh and a
 * `cardStripWireframe` mesh that shares its geometry (the standard three.js shaded+wireframe-overlay
 * pair - see GroomViewport.render for which material/visibility each gets per view mode/selection).
 * At most one of `collider`/`cardStrip` is ever pickable at a time - see getPickableBodyCollider.
 */
interface SplineBodyChildren {
	line: Line
	collider: Mesh
	cardStrip: Mesh
	cardStripWireframe: Mesh
}

function getChildren(group: Object3D): SplineBodyChildren {
	const children = group.userData.splineBodyChildren as SplineBodyChildren | undefined
	if (!children) {
		throw new Error('SplineBodyGeometry: object was not created via createSplineBodyGroup')
	}
	return children
}

/**
 * Builds one spline's body: a `Group` (tagged with the spline's scene object id, same as the old
 * single-mesh ribbon it replaces) containing a visible curve `Line`, an invisible collider tube
 * `Mesh` (also tagged), and the card-strip mesh pair (`cardStrip` also tagged). Neither collider's
 * own `.raycast` is ever touched - which of `collider`/`cardStrip` is pickable this frame is decided
 * fresh every frame by getPickableBodyCollider and fed into RaycastableObjectsManager, which is the
 * only thing HitTester ever sees (see that class's doc for why). Placeholder (empty)
 * geometry on all four until the first
 * updateSplineBodyGeometry call. `line.renderOrder`/`cardStrip.renderOrder` are set once here (not
 * per-frame) so the curve always draws on top of its own card strip - genuinely coincident geometry
 * (the line runs exactly along the strip's centerline), so this is paired with `polygonOffset` on
 * the card-strip materials themselves (see GroomEditorController) rather than relying on
 * renderOrder alone, which doesn't reliably prevent z-fighting flicker on truly coincident geometry.
 */
export function createSplineBodyGroup(
	splineId: string,
	viewportId: string,
	lineMaterial: LineBasicMaterial,
	colliderMaterial: MeshBasicMaterial,
	cardStripMaterial: MeshStandardMaterial,
	cardStripWireframeMaterial: MeshBasicMaterial
): Group {
	const group = new Group()
	group.name = `${viewportId}SplineBody:${splineId}`
	tagSceneObject(group, splineId)

	const line = new Line(undefined, lineMaterial)
	line.name = `${viewportId}SplineCurve:${splineId}`
	// Purely visual - the collider below is the pick target, same "two objects at the same spot,
	// only one of them raycast-able" scheme every other widget/handle in this editor uses.
	line.raycast = () => {}
	line.renderOrder = 1

	const collider = new Mesh(undefined, colliderMaterial)
	collider.name = `${viewportId}SplineCollider:${splineId}`
	tagSceneObject(collider, splineId)
	// Its `.raycast` is left at the real default - whether it's ever actually raycast against is
	// entirely up to whether GroomViewport's per-frame RaycastableObjectsManager.rebuild call
	// includes it (via getPickableBodyCollider), not anything set here at construction time.

	const cardStrip = new Mesh(undefined, cardStripMaterial)
	cardStrip.name = `${viewportId}SplineCardStrip:${splineId}`
	// Tagged (not just the collider) - it's the pick target for selecting an unselected spline, see
	// getPickableBodyCollider: clicking the visible card is what should select it, rather than relying
	// on the invisible collider tube (whose fixed radius can be narrower than a wide card strip).
	tagSceneObject(cardStrip, splineId)
	cardStrip.renderOrder = 0

	// Shares cardStrip's own geometry instance (assigned together in updateSplineBodyGeometry) -
	// never a second copy.
	const cardStripWireframe = new Mesh(cardStrip.geometry, cardStripWireframeMaterial)
	cardStripWireframe.name = `${viewportId}SplineCardStripWireframe:${splineId}`
	cardStripWireframe.raycast = () => {}

	group.add(line, collider, cardStrip, cardStripWireframe)
	group.userData.splineBodyChildren = { line, collider, cardStrip, cardStripWireframe } satisfies SplineBodyChildren
	return group
}

/**
 * Stores a spline body's live endpoint positions (see GroomViewport.syncSplineObjects,
 * SplineVertexDragInteractionHandler) - the group's geometry is rebuilt from these via
 * updateSplineBodyGeometry. This is the same "the mesh is the live truth during a drag" pattern hair
 * cards use (see HairCardMoveInteractionHandler mutating the card mesh directly, read back by
 * HairCardWidget) - the persisted GroomScene model isn't touched until the drag commits.
 */
export function setSplineBodyVertices(group: Object3D, vertices: readonly Vector3[]): void {
	group.userData.splineVertices = vertices
}

export function getSplineBodyVertices(group: Object3D): Vector3[] {
	return (group.userData.splineVertices as Vector3[] | undefined) ?? []
}

/**
 * Same "live truth during a drag" storage as setSplineBodyVertices/getSplineBodyVertices, but for
 * each vertex's `direction`/`scale` - these feed the rotate/scale gizmo and the card strip's width
 * axis, so SplineVertexRotateInteractionHandler/SplineVertexScaleInteractionHandler can preview into
 * them without touching the persisted GroomScene model until the drag commits. Indices line up with
 * getSplineBodyVertices' array.
 */
export function setSplineVertexDirections(group: Object3D, directions: Vector3[]): void {
	group.userData.splineVertexDirections = directions
}

export function getSplineVertexDirections(group: Object3D): Vector3[] {
	return (group.userData.splineVertexDirections as Vector3[] | undefined) ?? []
}

export function setSplineVertexScales(group: Object3D, scales: number[]): void {
	group.userData.splineVertexScales = scales
}

export function getSplineVertexScales(group: Object3D): number[] {
	return (group.userData.splineVertexScales as number[] | undefined) ?? []
}

/** Whether the card-strip mesh currently has real geometry - see GroomViewport.render's ghosting/visibility rule. */
export function hasSplineCardStrip(group: Object3D): boolean {
	return getChildren(group).cardStrip.geometry.attributes.position !== undefined
}

/**
 * Which of a spline body's two meshes (if either) should be pickable this frame, based on whether
 * it's currently the sole selection - called every frame from GroomViewport.applyViewModeAndGhosting,
 * which already computes `isSelected` per spline, to build the array RaycastableObjectsManager.rebuild
 * feeds HitTester (see that class's doc for why this returns data instead of mutating the mesh's own
 * `.raycast`, the way this used to work). Unselected: the card strip itself, so a click anywhere on
 * the visible card selects it - the collider tube is a fixed `BODY_WIDTH` radius, which can be
 * narrower than a wide card strip, so relying on it alone missed clicks near a card's edges. Selected
 * AND `curveEditingModeActive` (the `'select'` tool, not `'placeSpline'`/`'addVertex'` - see
 * GroomReactBridgeState.activeTool): the collider tube, since it's the one
 * `SplineSelectionInteractionHandler` uses to insert a new vertex at the clicked point along the
 * curve - a gesture that only makes sense on an already-selected spline while that's actually the
 * active tool. Selected but NOT in curve editing mode: neither - the collider must not be a raycast
 * target while a different tool owns clicking (its own plane/sphere raycasts never consult the
 * hitTester anyway, but leaving the collider pickable would still make it a spurious hover target -
 * see SplineHoverInteractionHandler/GroomViewport.setHoveredCurvePoint), and the card strip
 * re-selecting the already-selected spline is a no-op worth skipping too.
 */
export function getPickableBodyCollider(
	group: Object3D,
	isSelected: boolean,
	curveEditingModeActive: boolean
): Object3D | null {
	const { collider, cardStrip } = getChildren(group)
	if (isSelected) {
		return curveEditingModeActive ? collider : null
	}
	return cardStrip
}

/** The 3 children GroomViewport.render() applies per-frame view-mode/ghosting state to - see its "Curve-line visibility"/ghosting logic. Excludes the collider, which nothing outside this module ever needs to touch directly. */
export function getSplineBodyRenderChildren(group: Object3D): Pick<SplineBodyChildren, 'line' | 'cardStrip' | 'cardStripWireframe'> {
	const { line, cardStrip, cardStripWireframe } = getChildren(group)
	return { line, cardStrip, cardStripWireframe }
}

/**
 * The closest point on `group`'s curve to `point` - a raw collider-tube hit is on the tube's
 * surface, not its centerline, so this infers the hit's parameter t along the curve by sampling it
 * at even arc-length spacing (matching generateLineGeometry/generateColliderGeometry's own sampling,
 * cached on the group by updateSplineBodyGeometry) and snapping to the nearest sample, rather than
 * trusting the raw hit point directly. Used only for CurveInsertHintAnchor's hover position - null
 * for a group with no curve yet (fewer than 2 vertices, or degenerate).
 */
export function findClosestPointOnSplineBody(group: Object3D, point: Vector3): Vector3 | null {
	const curve = group.userData.splineCurve as CatmullRomCurve3 | null | undefined
	if (!curve) {
		return null
	}
	const samples = curve.getSpacedPoints(CLOSEST_POINT_SAMPLES)
	let closest = samples[0]
	let closestDistanceSq = Infinity
	for (const sample of samples) {
		const distanceSq = sample.distanceToSquared(point)
		if (distanceSq < closestDistanceSq) {
			closestDistanceSq = distanceSq
			closest = sample
		}
	}
	return closest
}

/**
 * Rebuilds a spline body's curve line, collider tube, and card-strip geometry from its live vertex
 * array - a smooth `CatmullRomCurve3` through every vertex (SplineCurveGeometryGenerator/
 * SplineCardStripGeometryGenerator), subdivided according to `resolution` (subdivisions per world unit,
 * see SplineObject.getSubdivisionCountForResolution). One entry point rebuilding all three
 * geometries from the same `buildCurve` call, rather than a sibling function, so the collider and
 * card strip never drift out of sync. Replaces and disposes each child's previous geometry.
 * `cardWidth` is the spline's own width (SplineObject.cardWidth) - independent of `hairCardId`,
 * which only ever changes the strip's UVs/texture (SplineCardStripGeometryGenerator/
 * GroomHairCardLookup's baked maps), never its physical size. `cardUvRect` is that same
 * `hairCardId`'s atlas rect (GroomHairCardLookup.getCardUvRect) - see
 * SplineCardStripGeometryGenerator for how it confines the strip's UVs. A spline with fewer than 2
 * vertices, or too short/coincident to define a curve, is left with empty geometry on every child
 * (nothing to draw or pick yet).
 */
export function updateSplineBodyGeometry(
	group: Object3D,
	resolution: number,
	cardStartOffset: number,
	cardWidth: number,
	cardUvRect: HairCardUvRect
): void {
	const vertices = getSplineBodyVertices(group)
	const { line, collider, cardStrip, cardStripWireframe } = getChildren(group)
	const curve = curveGenerator.buildCurve(vertices)
	group.userData.splineCurve = curve
	if (!curve) {
		line.geometry.dispose()
		line.geometry = new BufferGeometry()
		collider.geometry.dispose()
		collider.geometry = new BufferGeometry()
		cardStrip.geometry.dispose()
		cardStrip.geometry = new BufferGeometry()
		cardStripWireframe.geometry = cardStrip.geometry
		return
	}
	let totalLength = 0
	for (let i = 1; i < vertices.length; i++) {
		totalLength += vertices[i].distanceTo(vertices[i - 1])
	}
	const subdivisions = Math.min(
		GROOM.SPLINE.MAX_SUBDIVISIONS,
		Math.max(GROOM.SPLINE.MIN_SUBDIVISIONS, Math.round(totalLength * resolution))
	)

	const nextLine = curveGenerator.generateLineGeometry(curve, subdivisions)
	line.geometry.dispose()
	line.geometry = nextLine

	const nextCollider = curveGenerator.generateColliderGeometry(curve, subdivisions)
	collider.geometry.dispose()
	collider.geometry = nextCollider

	const directions = getSplineVertexDirections(group)
	const scales = getSplineVertexScales(group)
	const nextCardStrip = cardStripGenerator.generate(
		vertices,
		directions,
		scales,
		curve,
		cardStartOffset,
		cardWidth,
		subdivisions,
		cardUvRect
	)
	cardStrip.geometry.dispose()
	cardStrip.geometry = nextCardStrip
	// Always the SAME geometry instance as cardStrip - never a second copy, see the class doc.
	cardStripWireframe.geometry = nextCardStrip
}
