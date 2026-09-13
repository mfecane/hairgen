/** The subset of a hair card's placement that changes its baked atlas footprint - see computeHairCardLayoutHash. */
export interface HairCardLayoutEntry {
	id: string
	position: { x: number; y: number; z: number }
	width: number
	depth: number
}

/**
 * A cheap, deterministic fingerprint of every hair card's placement in the shared 0-1 working area
 * - used only to detect "the cards moved/resized since the last bake" (GroomHairCardLookup's
 * `getBakeStatus`/`bakeStatus: 'stale'`), never for anything security-sensitive, so a fast
 * non-cryptographic hash (FNV-1a, 32-bit) is enough - no Web Crypto dependency needed on either the
 * client (Editor.bakeHairCards, computed from the exact cards just baked) or the server (nowhere -
 * the server just stores whatever hash the client computed alongside the maps it uploaded).
 * Cards are sorted by id first so insertion order never changes the hash.
 */
export function computeHairCardLayoutHash(cards: readonly HairCardLayoutEntry[]): string {
	const serialized = [...cards]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(
			(card) =>
				`${card.id}:${card.position.x.toFixed(4)},${card.position.y.toFixed(4)},${card.position.z.toFixed(4)}:${card.width.toFixed(4)}x${card.depth.toFixed(4)}`
		)
		.join('|')

	let hash = 0x811c9dc5
	for (let i = 0; i < serialized.length; i++) {
		hash ^= serialized.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16)
}
