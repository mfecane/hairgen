import { Vector3 } from 'three'

const MIN_LENGTH = 1e-4
const MIN_PERPENDICULAR_LENGTH = 1e-4

const WORLD_UP: Vector3 = new Vector3(0, 1, 0)
const WORLD_RIGHT: Vector3 = new Vector3(1, 0, 0)
// How close to parallel (dot product magnitude) a tangent has to be to WORLD_UP before
// projectPerpendicular falls back to WORLD_RIGHT instead - avoids picking a near-zero-length
// fallback perpendicular when the tangent itself points (near) straight up.
const NEAR_VERTICAL_TANGENT_DOT = 0.99

/**
 * The spline's tangent direction at `index` - a central difference (`vertices[index+1] -
 * vertices[index-1]`) when both neighbors exist, so an interior vertex on a multi-point spline gets
 * a tangent smoothed across both adjoining segments, falling back to whichever single neighbor
 * exists at an endpoint (`next - current` at the start, `current - prev` at the end - together the
 * same "toward the other vertex" vector today's original always-2-vertex model used for both its
 * endpoints). Returns null when there's no neighbor at all, or the resulting vector is
 * (near-)zero-length (coincident vertices), mirroring SplineBodyGeometry's MIN_LENGTH epsilon -
 * callers treat that as "no meaningful gizmo this frame" rather than dividing by ~0. The single
 * source of tangent computation for both SplineVertexGizmo's visual orientation and the rotate/scale
 * handlers' drag math - see getVertexGizmoFrame.
 */
export function getSplineVertexTangent(vertices: readonly Vector3[], index: number): Vector3 | null {
	const current = vertices[index]
	const prev = vertices[index - 1] ?? null
	const next = vertices[index + 1] ?? null
	if (!current || (!prev && !next)) {
		return null
	}
	const tangent = (next ?? current).clone().sub(prev ?? current)
	if (tangent.length() < MIN_LENGTH) {
		return null
	}
	return tangent.normalize()
}

/**
 * Projects `direction` perpendicular to `tangent` (Gram-Schmidt) and normalizes it - the rotate
 * ring's/scale handle's in-plane axis is always exactly perpendicular to the tangent, regardless of
 * whatever raw vector is stored. Falls back to projecting `fallbackAxis` instead when the result is
 * near-zero-length (direction (near-)parallel to tangent) - this is the state GroomScene.addSpline
 * leaves a freshly placed scalp spline in (both the segment's tangent and both vertices' `direction`
 * are set from the same placement normal), so the gizmo still needs a well-defined starting axis the
 * very first time it's drawn, with no special-casing in addSpline itself.
 */
export function projectPerpendicular(direction: Vector3, tangent: Vector3, fallbackAxis: Vector3): Vector3 {
	const perpendicular = direction.clone().addScaledVector(tangent, -direction.dot(tangent))
	if (perpendicular.length() >= MIN_PERPENDICULAR_LENGTH) {
		return perpendicular.normalize()
	}
	const fallbackPerpendicular = fallbackAxis.clone().addScaledVector(tangent, -fallbackAxis.dot(tangent))
	return fallbackPerpendicular.normalize()
}

/**
 * One vertex's complete gizmo frame: `tangent` (the rotate ring's plane normal), `axis` (the scale
 * handle's direction, and the rotate ring's zero-angle reference), and `axisB` (`tangent` cross
 * `axis` - the rotate handle's grab-sphere direction, perpendicular to the scale handle so the two
 * never overlap) - the single entry point combining getSplineVertexTangent/projectPerpendicular so
 * SplineVertexGizmo (visual orientation) and SplineVertexRotateInteractionHandler/
 * SplineVertexScaleInteractionHandler (drag math) never compute subtly different orientations.
 * Returns null when the tangent itself is undefined (coincident vertices).
 */
export function getVertexGizmoFrame(
	vertices: readonly Vector3[],
	vertexIndex: number,
	storedDirection: Vector3
): { tangent: Vector3; axis: Vector3; axisB: Vector3 } | null {
	const tangent = getSplineVertexTangent(vertices, vertexIndex)
	if (!tangent) {
		return null
	}
	const fallbackAxis = Math.abs(tangent.dot(WORLD_UP)) > NEAR_VERTICAL_TANGENT_DOT ? WORLD_RIGHT : WORLD_UP
	const axis = projectPerpendicular(storedDirection, tangent, fallbackAxis)
	const axisB = tangent.clone().cross(axis).normalize()
	return { tangent, axis, axisB }
}
