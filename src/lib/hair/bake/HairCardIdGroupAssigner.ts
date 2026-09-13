import { SeededRandom } from '@/lib/hair/SeededRandom'
import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * Assigns every strand in the atlas to one of `groupCount` groups for the ID map, then paints a
 * grayscale `color` vertex attribute onto a bake-local geometry clone - never the live shared
 * geometry HairCardStrandsController owns (see HairCardBaker.bake, which clones before calling
 * paintVertexColors).
 */
export class HairCardIdGroupAssigner {
	/**
	 * A shuffled bucketing, not `index % groupCount` - the latter would band strands by generation
	 * order (see HairCardStrandsGenerator's root-sampling loop), reading as visible stripes instead
	 * of an arbitrary grouping. Deterministic per (seed, groupCount), same seeded-PRNG convention as
	 * HairCardStrandsGenerator. The merged atlas uses unique strand indexes across cards.
	 */
	public assign(strandCount: number, groupCount: number, seed: string): Uint32Array {
		const random = new SeededRandom(`${seed}:${groupCount}`)
		const order = Array.from({ length: strandCount }, (_, index) => index)
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(random.next() * (i + 1))
			;[order[i], order[j]] = [order[j], order[i]]
		}

		const groupByStrandIndex = new Uint32Array(strandCount)
		order.forEach((strandIndex, shuffledPosition) => {
			groupByStrandIndex[strandIndex] = Math.floor((shuffledPosition / strandCount) * groupCount)
		})
		return groupByStrandIndex
	}

	/** Reads `hairStrandIndex` per vertex (see HairCardStrandsGenerator), looks up its assigned group, writes a 3-component grayscale `color` attribute = (group + 0.5) / groupCount. */
	public paintVertexColors(geometry: BufferGeometry, groupByStrandIndex: Uint32Array, groupCount: number): void {
		const strandIndexAttribute = geometry.getAttribute('hairStrandIndex')
		const vertexCount = strandIndexAttribute.count
		const colors = new Float32Array(vertexCount * 3)
		for (let vertex = 0; vertex < vertexCount; vertex++) {
			const strandIndex = Math.round(strandIndexAttribute.getX(vertex))
			const group = groupByStrandIndex[strandIndex] ?? 0
			const gray = (group + 0.5) / groupCount
			colors[vertex * 3] = gray
			colors[vertex * 3 + 1] = gray
			colors[vertex * 3 + 2] = gray
		}
		geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
	}
}
