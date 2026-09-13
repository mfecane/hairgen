/**
 * A tiny mulberry32 PRNG seeded from an FNV-1a hash of `seed` - deterministic per seed, so the same
 * seed always reproduces the same sequence. Same algorithm as HairCardStrandsGenerator's inlined
 * createSeededRandom (left as-is there to avoid touching an already-working, unrelated file), as a
 * reusable class for new callers - see HairCardIdGroupAssigner, HairCardBakeRaytracedAoPass.
 */
export class SeededRandom {
	private state: number

	public constructor(seed: string) {
		let hash = 0x811c9dc5 // FNV-1a offset basis
		for (let i = 0; i < seed.length; i++) {
			hash ^= seed.charCodeAt(i)
			hash = Math.imul(hash, 0x01000193)
		}
		this.state = hash >>> 0
	}

	public next(): number {
		this.state |= 0
		this.state = (this.state + 0x6d2b79f5) | 0
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
