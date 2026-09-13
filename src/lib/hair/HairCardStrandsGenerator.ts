import { HAIR_CARD, HAIR_STRAND } from '@/constants'
import { HairStrandCenterlineCurve } from '@/lib/hair/HairStrandCenterlineCurve'
import { HairStrandGeometryGenerator } from '@/lib/hair/HairStrandGeometryGenerator'
import { HairStrandParams } from '@/lib/hair/HairStrandParams'
import { HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardModifierStack } from '@/lib/hair/modifiers/HairCardModifierStack'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface HairCardStrandsInput {
	width: number
	depth: number
	/** Fraction in [0, 1] of the card's depth, measured in from its "top" (+Y) edge, that root positions are sampled within. */
	rootSpread: number
	/**
	 * Root density, not a raw strand count - see the class doc's "Coverage as density" section. The
	 * actual number of strands generated scales with the card's width and rootSpread, so this value
	 * (and therefore how "covered" a card looks) stays meaningful across resizes instead of getting
	 * sparser as a card is widened or denser as it's narrowed.
	 */
	coverage: number
	/** Global strand thickness (see Project.thickness) - shared by every card, not per-card. */
	thickness: number
	/**
	 * Fraction in [0, 1] each strand's rise height (HairStrandParams.heightFactor) is randomly
	 * jittered away from the HAIR_STRAND.BASE_HEIGHT_FACTOR baseline - 0 keeps every strand at the
	 * same height, 1 lets it swing anywhere from flat (factor 0) to double the baseline.
	 */
	heightVariance: number
	/**
	 * Fraction in [0, 1] each strand's length is randomly shortened by, relative to its own full
	 * (untrimmed) length - 0 leaves every strand at full length, 1 lets an individual strand be cut
	 * anywhere from full length down to nothing, so the card reads as trimmed unevenly rather than
	 * cut to one exact length.
	 */
	cutVariance: number
	/** Stack of shape modifiers (twist/noise/clump/braid) applied, in order, after every strand's raw centerline is placed at its root - see HairCardModifierStack. */
	modifiers: HairCardModifier[]
	/** Deterministic seed (the card's id) - regenerating with the same inputs reproduces the same layout instead of reshuffling it. */
	seed: string
}

/**
 * Fills a hair card's rectangle with `coverage` individual strands, each still built by
 * HairStrandGeometryGenerator, merged into one geometry in the card's own local space - root
 * positions span [-width/2, width/2] x [-depth/2, depth/2], centered on the card's own origin, so a
 * Mesh using this geometry just needs the card's position, the same as HairCardWidget's outline.
 * The card itself lies in the z = 0 plane (see EditorController.hairCardGeometry) - width runs
 * along local/world X, depth along local/world Y, and a strand's rise (HairStrandCenterlineCurve)
 * puffs out along Z, toward the viewer - see docs/editor/hair-cards-plan.md.
 *
 * "Root spread" picks which strip of the card roots may spawn in: the card's local +Y edge is
 * treated as its "top", so roots are sampled with y in [halfDepth - rootSpread * depth, halfDepth]
 * and x uniformly across the full width. Every strand's raw centerline is placed at its root
 * (translated in card space) before the modifier stack runs (see docs/editor/hair-card-modifiers.md)
 * - a modifier stack entry (twist/noise) may then bend a strand off that straight run, or (clump/
 * braid) pull it toward nearby strands, using the root positions every strand already carries. Each
 * strand's length is set to fill the room from its root to the bottom edge (rootY + halfDepth) minus
 * a small BOTTOM_PADDING gap, so strands always span the full card instead of falling short of it,
 * while still leaving a sliver of visible card at the bottom edge.
 *
 * Coverage as density: `input.coverage` isn't used as a strand count directly - it's scaled by
 * `width * rootSpread` (the root-sampling strip's area, width x stripDepth), normalized against
 * that same product at the card's default size (HAIR_CARD.DEFAULT_WIDTH x DEFAULT_ROOT_SPREAD), so
 * a default-sized card's strand count matches the slider value one-to-one while a wider card (or
 * one with a deeper root-sampling strip) gets proportionally more strands instead of the same count
 * spread thinner - the card's visual density stays put as it's resized rather than drifting with it.
 */
export class HairCardStrandsGenerator {
	private readonly strandGenerator: HairStrandGeometryGenerator = new HairStrandGeometryGenerator()

	private readonly modifierStack: HairCardModifierStack = new HairCardModifierStack()

	public generate(input: HairCardStrandsInput): BufferGeometry | null {
		const halfWidth = input.width / 2
		const halfDepth = input.depth / 2
		const rootSpread = Math.min(1, Math.max(0, input.rootSpread))
		const stripDepth = input.depth * rootSpread
		const heightVariance = Math.min(1, Math.max(0, input.heightVariance))
		const cutVariance = Math.min(1, Math.max(0, input.cutVariance))

		// See "Coverage as density" above - scales the coverage slider's value by how much bigger (or
		// smaller) this card's root-sampling area is than the default card's.
		const referenceArea = HAIR_CARD.DEFAULT_WIDTH * HAIR_CARD.DEFAULT_ROOT_SPREAD
		const coverage = Math.max(1, Math.round((input.coverage / referenceArea) * input.width * rootSpread))

		const nextRandom = createSeededRandom(input.seed)
		const strandCenterlines: HairCardStrandCenterline[] = []

		for (let i = 0; i < coverage; i++) {
			const rootX = -halfWidth + nextRandom() * input.width
			const rootY = halfDepth - nextRandom() * stripDepth
			const distanceToBottomEdge = rootY + halfDepth
			const fullLength = Math.max(
				HAIR_CARD.STRAND.MIN_LENGTH,
				distanceToBottomEdge - HAIR_CARD.STRAND.BOTTOM_PADDING
			)
			// Shortens this strand by a random fraction of its own full length, up to cutVariance, so a
			// card's strands trail off to uneven lengths instead of all ending at the same trim line.
			const length = Math.max(HAIR_CARD.STRAND.MIN_LENGTH, fullLength * (1 - nextRandom() * cutVariance))
			// Jitters this strand's height factor within +/- heightVariance of the baseline, so a
			// card's strands rise to slightly different heights instead of all lining up exactly flat.
			const heightFactor = HAIR_STRAND.BASE_HEIGHT_FACTOR * (1 + (nextRandom() * 2 - 1) * heightVariance)

			const params = new HairStrandParams(
				length,
				input.thickness,
				HAIR_CARD.STRAND.BASE_TAPER,
				HAIR_CARD.STRAND.TIP_TAPER,
				HAIR_CARD.STRAND.BASE_BEND_ANGLE,
				heightFactor
			)
			const segments = this.strandGenerator.segmentsForLength(length)
			const points = new HairStrandCenterlineCurve(params).getSpacedPoints(segments)
			// Root translation only (x, y) - the strand's own local growth (-Y) and rise (+Z) axes
			// already line up with the card's world axes (see the class doc). Done here, before the
			// modifier stack runs, so every modifier sees strands already positioned in card space.
			points.forEach((point) => {
				point.x += rootX
				point.y += rootY
			})
			strandCenterlines.push({ points, rootX, rootY, params })
		}

		this.modifierStack.apply(strandCenterlines, input.modifiers, nextRandom)

		// hairStrandIndex is constant across a strand's own vertices - which strand a bake-time texel
		// belongs to, consumed by the id map (see src/lib/hair/bake/HairCardIdGroupAssigner).
		const strands = strandCenterlines.map((strand, index) => {
			const geometry = this.strandGenerator.generateFromCenterline(strand.points, strand.params)
			const vertexCount = geometry.getAttribute('position').count
			geometry.setAttribute(
				'hairStrandIndex',
				new Float32BufferAttribute(new Float32Array(vertexCount).fill(index), 1)
			)
			return geometry
		})

		const merged = mergeGeometries(strands)
		strands.forEach((strand) => strand.dispose())
		if (!merged) {
			return null
		}
		merged.name = 'hairCardStrandsGeometry'
		merged.computeBoundingSphere()
		return merged
	}
}

/**
 * A tiny mulberry32 PRNG seeded from a hash of `seed` - deterministic per card id, so regenerating a
 * card's strands (after a move, or an unrelated settings change) reproduces the same root layout
 * instead of reshuffling it on every call.
 */
function createSeededRandom(seed: string): () => number {
	let hash = 0x811c9dc5 // FNV-1a offset basis
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	let state = hash >>> 0
	return () => {
		state |= 0
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
