/**
 * Shape parameters for one generated hair strand. The strand's centerline runs along -Y in local
 * space: the root sits at y = 0, the tip approaches y = -length (exactly, when baseBendAngle is 0 -
 * see HairStrandCenterlineCurve for how a non-zero bend spends some of that length curving through
 * +Z instead). See HairStrandGeometryGenerator for how these turn into a mesh.
 */
export class HairStrandParams {
	public constructor(
		/** World-space length of the strand along its centerline, in scene units. */
		public readonly length: number,
		/** Diameter of the strand at its thickest cross-section (its midpoint). */
		public readonly thickness: number,
		/** How pointed the root is: 0 keeps it at full thickness, 1 pinches it to a point at y = 0. */
		public readonly baseTaper: number,
		/** Tip end thickness: 0 pinches it to a point at the tip, 1 keeps it at full thickness. */
		public readonly tipTaper: number,
		/**
		 * Root emergence angle, in radians, measured from the -Y trailing direction toward +Z. 0 means
		 * the strand runs straight along -Y from the root. Larger values make it emerge more
		 * perpendicularly (+Z, out of the skin surface) before smoothly curving over into the trailing
		 * -Y direction.
		 */
		public readonly baseBendAngle: number,
		/**
		 * Multiplier on thickness giving the height (see HairStrandCenterlineCurve) the strand rises
		 * to before flattening out - height = thickness * heightFactor. Exposed as its own param
		 * (rather than a fixed constant) so callers can jitter it per strand, e.g. HairCardStrandsGenerator's
		 * heightVariance.
		 */
		public readonly heightFactor: number
	) {
		if (!(length > 0)) {
			throw new Error(`HairStrandParams: length must be > 0, got ${length}`)
		}
		if (!(thickness > 0)) {
			throw new Error(`HairStrandParams: thickness must be > 0, got ${thickness}`)
		}
		if (baseTaper < 0 || baseTaper > 1) {
			throw new Error(`HairStrandParams: baseTaper must be within [0, 1], got ${baseTaper}`)
		}
		if (tipTaper < 0 || tipTaper > 1) {
			throw new Error(`HairStrandParams: tipTaper must be within [0, 1], got ${tipTaper}`)
		}
		if (baseBendAngle < 0 || baseBendAngle > Math.PI / 2) {
			throw new Error(`HairStrandParams: baseBendAngle must be within [0, PI/2] radians, got ${baseBendAngle}`)
		}
		if (heightFactor < 0) {
			throw new Error(`HairStrandParams: heightFactor must be >= 0, got ${heightFactor}`)
		}
	}
}
