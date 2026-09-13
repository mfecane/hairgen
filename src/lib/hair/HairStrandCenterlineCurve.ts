import { HAIR_STRAND } from '@/constants'
import { HairStrandParams } from '@/lib/hair/HairStrandParams'
import { Curve, Vector3 } from 'three'

/**
 * The strand's centerline, parametrized by nominal arc length t in [0, 1] (t * params.length is
 * the distance travelled from the root). The root sits exactly at the origin - x = 0, y = 0,
 * z = 0 - as if planted right on the surface it grows from. From there a cubic Hermite arc carries
 * it up through its emergence angle (baseBendAngle, tilted toward +Z) and lands it exactly on the
 * z = height plane - x = 0, z = height - by the time it reaches y = -bendLength, then it runs dead
 * straight down -Y (still x = 0, z = height) for the rest of the strand. That's deliberate: a
 * twist modifier applied around local Y only ever twists a main body that's already centered on
 * its own rotation axis. Bending only ever happens in the Y-Z plane, so this also feeds straight
 * into Three's TubeGeometry (via computeFrenetFrames) with no risk of the cross-section frame
 * twisting on its own - see HairStrandGeometryGenerator.
 *
 * Y is the growth axis (down the card, from its root toward its tip) and Z is the rise axis (out
 * of the card's z = 0 plane, toward the viewer) - see docs/editor/hair-cards-plan.md. Swapped from
 * the flat-card convention this replaced (where Z was growth and Y was rise) so the card's own
 * plane is X-Y (z = 0, vertical) instead of X-Z (y = 0, horizontal).
 *
 * The root handle's length is capped (see startHandleLength) so the arc never rises back through
 * z = height before its landing point - it only ever touches the plane tangentially, exactly at
 * the landing point.
 */
export class HairStrandCenterlineCurve extends Curve<Vector3> {
	private readonly bendLength: number

	private readonly height: number

	private readonly startHandleLength: number

	public constructor(private readonly params: HairStrandParams) {
		super()
		this.bendLength = params.length * HAIR_STRAND.BASE_BEND_EXTENT
		this.height = params.thickness * params.heightFactor
		this.startHandleLength = this.computeStartHandleLength()
	}

	public override getPoint(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
		const distance = t * this.params.length
		if (distance >= this.bendLength) {
			return optionalTarget.set(0, -distance, this.height)
		}

		// Cubic Hermite arc from root P0 = (y: 0, z: 0), tangent handle M0 = startHandleLength *
		// (-cos theta, sin theta), to P1 = (y: -bendLength, z: height), tangent handle M1 =
		// bendLength * (-1, 0). Landing tangent M1 is exactly -Y, so the curve joins the straight
		// run above with no kink; landing point P1 is exactly on-axis, so no further z change
		// carries past the bend.
		const u = distance / this.bendLength
		const theta = this.params.baseBendAngle
		const h10 = u ** 3 - 2 * u ** 2 + u
		const h01 = -2 * u ** 3 + 3 * u ** 2
		const h11 = u ** 3 - u ** 2

		const rise = this.height * h01 + h10 * this.startHandleLength * Math.sin(theta)
		const growth = -this.bendLength * (h01 + h11) - h10 * this.startHandleLength * Math.cos(theta)
		return optionalTarget.set(0, growth, rise)
	}

	/**
	 * The largest root-handle length for which rise(u) = height * h01(u) + handle * sin(theta) *
	 * h10(u) stays non-decreasing over u in [0, 1] - i.e. the arc never climbs back through
	 * z = height before reaching its landing point at u = 1. Differentiating rise and factoring gives
	 * d(rise)/du = (1 - u) * [6 * height * u - handle * sin(theta) * (3 * u - 1)], a product of a
	 * non-negative term (1 - u) and a term that is affine in u; that affine term is already
	 * non-negative at u = 0 (it equals handle * sin(theta)), so requiring it non-negative at its
	 * u = 1 endpoint reduces to handle * sin(theta) <= 3 * height. Capping at that bound keeps the
	 * required emergence direction (only the handle's length changes, never its direction) while
	 * guaranteeing the non-crossing constraint for any height/bendLength/theta combination.
	 */
	private computeStartHandleLength(): number {
		const sinTheta = Math.sin(this.params.baseBendAngle)
		if (sinTheta === 0) {
			return this.bendLength
		}
		return Math.min(this.bendLength, (3 * this.height) / sinTheta)
	}
}
