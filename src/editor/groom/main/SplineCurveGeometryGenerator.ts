import { GROOM } from '@/constants'
import { BufferGeometry, CatmullRomCurve3, TubeGeometry, Vector3 } from 'three'

/** Below this, a spline's total length is treated as zero - no meaningful curve to draw. */
const MIN_TOTAL_LENGTH = 1e-4

/** Cross-sections around the collider tube's circumference - purely a collision proxy, so a low, cheap segment count is enough. */
const COLLIDER_RADIAL_SEGMENTS = 8

/**
 * Builds a spline's smooth centerline curve - a `CatmullRomCurve3` through its vertices, replacing
 * the earlier vertex-to-vertex linear interpolation (the straight-segment "quad-chain" ribbon),
 * which visibly kinked at every interior vertex instead of flowing smoothly through it. Two
 * geometries are generated from the same curve (see GroomViewport.syncSplineObjects):
 * - a thin visible `Line` tracing the curve itself
 * - an invisible `TubeGeometry` extruded along it, used only as the pickable collider - clicking
 *   anywhere along the spline's body hit-tests against this, never the (unpickable) line
 * `subdivisions` is resolved by the caller (SplineObject.getSubdivisionCountForResolution), same as
 * the ribbon generator this replaces.
 */
export class SplineCurveGeometryGenerator {
	/** Null when there aren't enough vertices, or they're (near-)coincident, to define a curve. */
	public buildCurve(vertices: readonly Vector3[]): CatmullRomCurve3 | null {
		if (vertices.length < 2) {
			return null
		}
		let totalLength = 0
		for (let i = 1; i < vertices.length; i++) {
			totalLength += vertices[i].distanceTo(vertices[i - 1])
		}
		if (totalLength < MIN_TOTAL_LENGTH) {
			return null
		}
		// 'centripetal' avoids the loops/overshoot a uniform or chordal parameterization can produce
		// when a spline's segments have very different lengths - the standard choice for an
		// interactively-edited Catmull-Rom curve.
		return new CatmullRomCurve3([...vertices], false, 'centripetal')
	}

	/** The visible curve line's geometry - points spaced evenly along the curve's arc length. */
	public generateLineGeometry(curve: CatmullRomCurve3, subdivisions: number): BufferGeometry {
		const geometry = new BufferGeometry().setFromPoints(curve.getSpacedPoints(subdivisions))
		geometry.name = 'splineCurveLineGeometry'
		return geometry
	}

	/** The invisible collider's geometry - a uniform-radius tube extruded along the curve. */
	public generateColliderGeometry(curve: CatmullRomCurve3, subdivisions: number): BufferGeometry {
		const geometry = new TubeGeometry(
			curve,
			subdivisions,
			GROOM.SPLINE.BODY_WIDTH / 2,
			COLLIDER_RADIAL_SEGMENTS,
			false
		)
		geometry.name = 'splineCurveColliderGeometry'
		return geometry
	}
}
