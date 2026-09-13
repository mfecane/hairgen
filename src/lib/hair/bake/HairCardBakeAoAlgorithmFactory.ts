import { BAKE } from '@/constants'
import { HairCardBakeAoAlgorithm } from '@/lib/hair/bake/HairCardBakeAoAlgorithm'
import { HairCardBakeRaytracedAoPass } from '@/lib/hair/bake/HairCardBakeRaytracedAoPass'
import { HairCardBakeShadowSweepAoPass } from '@/lib/hair/bake/HairCardBakeShadowSweepAoPass'

/** Picks the HairCardBakeAoAlgorithm implementation named by the BAKE.AO.ALGORITHM dev flag. */
export class HairCardBakeAoAlgorithmFactory {
	public create(): HairCardBakeAoAlgorithm {
		switch (BAKE.AO.ALGORITHM) {
			case 'shadowSweep':
				return new HairCardBakeShadowSweepAoPass()
			case 'raytrace':
				return new HairCardBakeRaytracedAoPass()
		}
	}
}
