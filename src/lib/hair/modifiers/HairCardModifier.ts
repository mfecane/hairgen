import { HAIR_CARD } from '@/constants'

export type HairCardModifierType = 'twist' | 'noise' | 'clump' | 'braid'

export interface TwistModifierParams {
	/** Fraction in [0, 1] - amount = 1 twists a strand HAIR_CARD.MODIFIERS.TWIST.MAX_TURNS full turns over its own length. */
	amount: number
}

export interface NoiseModifierParams {
	/** Fraction in [0, 1] - jitter strength, up to HAIR_CARD.MODIFIERS.NOISE.MAX_AMPLITUDE world units at amount = 1. */
	amount: number
	/** Fraction in [0, 1] - jitter frequency, from MIN_FREQUENCY at scale = 0 to MAX_FREQUENCY at scale = 1. */
	scale: number
}

export interface ClumpModifierParams {
	/** How many clusters strand roots are grouped into - see ClumpModifier. */
	regionCount: number
	/** Fraction in [0, 1] - how far each non-stray strand's shape is pulled toward its region's average. */
	strength: number
	/** Fraction in [0, 1] of strands, ranked farthest from their region's center, left unclumped. */
	strayFraction: number
}

export interface BraidModifierParams {
	/** Strands per braid group - see BraidModifier. */
	groupSize: number
	/** Fraction in [0, 1] - how far each strand is pulled onto its group's woven helix. */
	strength: number
	/** How many full crossings the weave makes over a strand's length. */
	period: number
}

/**
 * One entry in a hair card's modifier stack (see SceneObjectData.modifiers) - a discriminated union
 * so each type's params are only ever the shape it actually uses. `id` is stable across reorders/
 * edits (React keys, undo snapshots), `enabled` lets a modifier be toggled off without removing it
 * from the stack.
 */
export type HairCardModifier =
	| { id: string; type: 'twist'; enabled: boolean; params: TwistModifierParams }
	| { id: string; type: 'noise'; enabled: boolean; params: NoiseModifierParams }
	| { id: string; type: 'clump'; enabled: boolean; params: ClumpModifierParams }
	| { id: string; type: 'braid'; enabled: boolean; params: BraidModifierParams }

/** Display order for the "add modifier" menu - see HairCardModifierStackPanel. */
export const HAIR_CARD_MODIFIER_TYPES: readonly HairCardModifierType[] = ['twist', 'noise', 'clump', 'braid']

/** Clean, user-facing labels - see HairCardModifierRow/HairCardModifierStackPanel. Never the internal type string. */
export const HAIR_CARD_MODIFIER_LABELS: Record<HairCardModifierType, string> = {
	twist: 'Twist',
	noise: 'Noise',
	clump: 'Clump',
	braid: 'Braid',
}

/** Builds one new modifier of `type` with its default params (HAIR_CARD.MODIFIERS.<TYPE>), enabled. */
export class HairCardModifierFactory {
	public create(type: HairCardModifierType): HairCardModifier {
		const id = crypto.randomUUID()
		switch (type) {
			case 'twist':
				return { id, type, enabled: true, params: { amount: HAIR_CARD.MODIFIERS.TWIST.DEFAULT_AMOUNT } }
			case 'noise':
				return {
					id,
					type,
					enabled: true,
					params: {
						amount: HAIR_CARD.MODIFIERS.NOISE.DEFAULT_AMOUNT,
						scale: HAIR_CARD.MODIFIERS.NOISE.DEFAULT_SCALE,
					},
				}
			case 'clump':
				return {
					id,
					type,
					enabled: true,
					params: {
						regionCount: HAIR_CARD.MODIFIERS.CLUMP.DEFAULT_REGION_COUNT,
						strength: HAIR_CARD.MODIFIERS.CLUMP.DEFAULT_STRENGTH,
						strayFraction: HAIR_CARD.MODIFIERS.CLUMP.DEFAULT_STRAY_FRACTION,
					},
				}
			case 'braid':
				return {
					id,
					type,
					enabled: true,
					params: {
						groupSize: HAIR_CARD.MODIFIERS.BRAID.DEFAULT_GROUP_SIZE,
						strength: HAIR_CARD.MODIFIERS.BRAID.DEFAULT_STRENGTH,
						period: HAIR_CARD.MODIFIERS.BRAID.DEFAULT_PERIOD,
					},
				}
		}
	}
}
