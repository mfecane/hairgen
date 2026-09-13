import { HAIR_CARD } from '@/constants'
import { NoiseModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'
import { MathUtils } from 'three'

/**
 * Jitters each strand's points sideways with a per-strand sine wave (no external noise library -
 * the seeded sine wave reads the same as value noise at hair-strand scale, and stays deterministic
 * per card the same way HairCardStrandsGenerator's own seeded PRNG does). X and Z get independent
 * random phases so the wobble isn't a flat sideways wave. Scaled by t so the root (t = 0) never
 * moves, matching TwistModifier's anchoring.
 */
export class NoiseModifier {
	public apply(strands: readonly HairCardStrandCenterline[], params: NoiseModifierParams, rng: () => number): void {
		const amplitude = params.amount * HAIR_CARD.MODIFIERS.NOISE.MAX_AMPLITUDE
		const frequency = MathUtils.lerp(
			HAIR_CARD.MODIFIERS.NOISE.MIN_FREQUENCY,
			HAIR_CARD.MODIFIERS.NOISE.MAX_FREQUENCY,
			params.scale
		)

		strands.forEach((strand) => {
			const phaseX = rng() * Math.PI * 2
			const phaseZ = rng() * Math.PI * 2
			const lastIndex = strand.points.length - 1
			strand.points.forEach((point, index) => {
				const t = index / lastIndex
				const wave = t * frequency * Math.PI * 2
				point.x += t * amplitude * Math.sin(wave + phaseX)
				point.z += t * amplitude * Math.sin(wave + phaseZ)
			})
		})
	}
}
