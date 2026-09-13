import { BraidModifier } from '@/lib/hair/modifiers/BraidModifier'
import { ClumpModifier } from '@/lib/hair/modifiers/ClumpModifier'
import { HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'
import { NoiseModifier } from '@/lib/hair/modifiers/NoiseModifier'
import { TwistModifier } from '@/lib/hair/modifiers/TwistModifier'

/**
 * Runs a hair card's modifier stack over its strands' working centerlines, in stack order -
 * reordering the stack (HairCardOptionsPanel's drag-and-drop list) changes the result, since each
 * modifier sees the previous one's output. Disabled modifiers are skipped. `rng` continues the same
 * seeded sequence HairCardStrandsGenerator used for root sampling, so a given card id + modifier
 * stack always regenerates the same result.
 */
export class HairCardModifierStack {
	private readonly twist = new TwistModifier()

	private readonly noise = new NoiseModifier()

	private readonly clump = new ClumpModifier()

	private readonly braid = new BraidModifier()

	public apply(
		strands: readonly HairCardStrandCenterline[],
		modifiers: readonly HairCardModifier[],
		rng: () => number
	): void {
		modifiers.forEach((modifier) => {
			if (!modifier.enabled) {
				return
			}
			switch (modifier.type) {
				case 'twist':
					this.twist.apply(strands, modifier.params)
					break
				case 'noise':
					this.noise.apply(strands, modifier.params, rng)
					break
				case 'clump':
					this.clump.apply(strands, modifier.params, rng)
					break
				case 'braid':
					this.braid.apply(strands, modifier.params)
					break
			}
		})
	}
}
