/** Picks one item with probability proportional to its weight, drawing from the supplied generator so the caller keeps control of seeding. */
export function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, random: () => number): T {
	if (items.length === 0) {
		throw new Error('pickWeighted: cannot pick from an empty list')
	}
	const total = items.reduce((sum, item) => sum + weightOf(item), 0)
	if (!(total > 0)) {
		throw new Error(`pickWeighted: the weights of ${items.length} items sum to ${total}, so nothing can be drawn`)
	}
	let remaining = random() * total
	for (const item of items) {
		remaining -= weightOf(item)
		if (remaining <= 0) {
			return item
		}
	}
	// Only reachable through floating-point drift at the very top of the range.
	return items[items.length - 1]
}
