/**
 * string → 32-bit seed (xmur3)
 */
function xmur3(str: string): () => number {
	let h = 1779033703 ^ str.length
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
		h = (h << 13) | (h >>> 19)
	}
	return function () {
		h = Math.imul(h ^ (h >>> 16), 2246822507)
		h = Math.imul(h ^ (h >>> 13), 3266489909)
		return (h ^= h >>> 16) >>> 0
	}
}

/**
 * PRNG (fast, good enough)
 */
function mulberry32(a: number): () => number {
	return function () {
		let t = (a += 0x6d2b79f5)
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Create a seeded random number generator in [0, 1).
 * Same implementation as re-exported from `@/lib/math/random` for Node seed scripts.
 */
export function createSeededRandom(seed: string): () => number {
	const seedFn = xmur3(seed)
	return mulberry32(seedFn())
}
