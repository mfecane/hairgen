/** Uniformly picks one item, drawing from the supplied generator so the caller keeps control of seeding. */
export function pickRandom<T>(items: readonly T[], random: () => number): T {
	if (items.length === 0) {
		throw new Error('pickRandom: cannot pick from an empty list')
	}
	return items[Math.floor(random() * items.length)]
}
