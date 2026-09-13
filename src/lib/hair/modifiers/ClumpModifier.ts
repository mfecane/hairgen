import { HAIR_CARD } from '@/constants'
import { ClumpModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'
import { MathUtils } from 'three'

type RelativePoint = readonly [x: number, z: number]

/**
 * Groups strands into `regionCount` clusters by root position (fixed-iteration Lloyd's k-means -
 * see HAIR_CARD.MODIFIERS.CLUMP.KMEANS_ITERATIONS), excludes the `strayFraction` of strands ranked
 * farthest from their cluster's center, then pulls every remaining strand's own shape (its points
 * relative to its own root - position never changes, only shape) toward its region's average shape
 * by `strength`. Reads as strands within a region bending together into one clump while a few
 * outliers are left alone, rather than every strand's tip collapsing onto one shared point.
 */
export class ClumpModifier {
	public apply(strands: readonly HairCardStrandCenterline[], params: ClumpModifierParams, rng: () => number): void {
		if (strands.length === 0) {
			return
		}
		const regionCount = Math.min(params.regionCount, strands.length)
		const centers = this.pickInitialCenters(strands, regionCount, rng)
		let assignments = this.assign(strands, centers)
		for (let iteration = 1; iteration < HAIR_CARD.MODIFIERS.CLUMP.KMEANS_ITERATIONS; iteration++) {
			this.recomputeCenters(strands, assignments, centers)
			assignments = this.assign(strands, centers)
		}

		const strayCount = Math.round(strands.length * params.strayFraction)
		const strayIndices = this.strayIndices(strands, centers, assignments, strayCount)
		const regionShapes = this.averageShapes(strands, assignments, regionCount, strayIndices)

		strands.forEach((strand, strandIndex) => {
			if (strayIndices.has(strandIndex)) {
				return
			}
			const shape = regionShapes[assignments[strandIndex]]
			const lastIndex = strand.points.length - 1
			strand.points.forEach((point, index) => {
				const t = index / lastIndex
				const [meanX, meanZ] = this.sampleShape(shape, t)
				point.x = strand.rootX + MathUtils.lerp(point.x - strand.rootX, meanX, params.strength)
				point.z = MathUtils.lerp(point.z, meanZ, params.strength)
			})
		})
	}

	/** `regionCount` distinct strand roots, drawn without replacement via `rng`, as the k-means seed. */
	private pickInitialCenters(
		strands: readonly HairCardStrandCenterline[],
		regionCount: number,
		rng: () => number
	): RelativePoint[] {
		const remainingIndices = strands.map((_, index) => index)
		const centers: RelativePoint[] = []
		for (let i = 0; i < regionCount; i++) {
			const pick = Math.floor(rng() * remainingIndices.length)
			const strandIndex = remainingIndices.splice(pick, 1)[0]
			centers.push([strands[strandIndex].rootX, strands[strandIndex].rootY])
		}
		return centers
	}

	/** Nearest-center region index per strand, by squared distance between roots. */
	private assign(strands: readonly HairCardStrandCenterline[], centers: readonly RelativePoint[]): number[] {
		return strands.map((strand) => {
			let nearest = 0
			let nearestDistance = Infinity
			centers.forEach(([centerX, centerY], regionIndex) => {
				const dx = strand.rootX - centerX
				const dy = strand.rootY - centerY
				const distance = dx * dx + dy * dy
				if (distance < nearestDistance) {
					nearestDistance = distance
					nearest = regionIndex
				}
			})
			return nearest
		})
	}

	/** Each center becomes the centroid of its currently-assigned strands' roots; untouched if a region is empty. */
	private recomputeCenters(
		strands: readonly HairCardStrandCenterline[],
		assignments: readonly number[],
		centers: RelativePoint[]
	): void {
		const sums = centers.map(() => ({ x: 0, y: 0, count: 0 }))
		strands.forEach((strand, index) => {
			const sum = sums[assignments[index]]
			sum.x += strand.rootX
			sum.y += strand.rootY
			sum.count++
		})
		sums.forEach((sum, regionIndex) => {
			if (sum.count > 0) {
				centers[regionIndex] = [sum.x / sum.count, sum.y / sum.count]
			}
		})
	}

	/** The `strayCount` strands ranked farthest from their assigned center's root position. */
	private strayIndices(
		strands: readonly HairCardStrandCenterline[],
		centers: readonly RelativePoint[],
		assignments: readonly number[],
		strayCount: number
	): ReadonlySet<number> {
		const ranked = strands
			.map((strand, index) => {
				const [centerX, centerY] = centers[assignments[index]]
				const dx = strand.rootX - centerX
				const dy = strand.rootY - centerY
				return { index, distance: dx * dx + dy * dy }
			})
			.sort((a, b) => b.distance - a.distance)
		return new Set(ranked.slice(0, strayCount).map((entry) => entry.index))
	}

	/** Per region, the average of its non-stray members' shapes, sampled at SHAPE_SAMPLE_COUNT even t steps. */
	private averageShapes(
		strands: readonly HairCardStrandCenterline[],
		assignments: readonly number[],
		regionCount: number,
		strayIndices: ReadonlySet<number>
	): RelativePoint[][] {
		const sampleCount = HAIR_CARD.MODIFIERS.CLUMP.SHAPE_SAMPLE_COUNT
		const sums: { x: number; z: number }[][] = Array.from({ length: regionCount }, () =>
			Array.from({ length: sampleCount }, () => ({ x: 0, z: 0 }))
		)
		const memberCounts = new Array<number>(regionCount).fill(0)

		strands.forEach((strand, strandIndex) => {
			if (strayIndices.has(strandIndex)) {
				return
			}
			const region = assignments[strandIndex]
			memberCounts[region]++
			for (let sample = 0; sample < sampleCount; sample++) {
				const t = sample / (sampleCount - 1)
				const [x, z] = this.relativePointAt(strand, t)
				sums[region][sample].x += x
				sums[region][sample].z += z
			}
		})

		return sums.map((regionSums, region) => {
			const count = memberCounts[region] || 1
			return regionSums.map(({ x, z }): RelativePoint => [x / count, z / count])
		})
	}

	/** Linearly interpolated (x, z) relative to `strand`'s own root at continuous t in [0, 1]. */
	private relativePointAt(strand: HairCardStrandCenterline, t: number): RelativePoint {
		const lastIndex = strand.points.length - 1
		const position = t * lastIndex
		const lowerIndex = Math.floor(position)
		const upperIndex = Math.min(lastIndex, lowerIndex + 1)
		const fraction = position - lowerIndex
		const lower = strand.points[lowerIndex]
		const upper = strand.points[upperIndex]
		return [
			MathUtils.lerp(lower.x - strand.rootX, upper.x - strand.rootX, fraction),
			MathUtils.lerp(lower.z, upper.z, fraction),
		]
	}

	/** The region shape's own (x, z) at continuous t in [0, 1], interpolated between its even samples. */
	private sampleShape(shape: readonly RelativePoint[], t: number): RelativePoint {
		const lastIndex = shape.length - 1
		const position = t * lastIndex
		const lowerIndex = Math.floor(position)
		const upperIndex = Math.min(lastIndex, lowerIndex + 1)
		const fraction = position - lowerIndex
		const [lowerX, lowerZ] = shape[lowerIndex]
		const [upperX, upperZ] = shape[upperIndex]
		return [MathUtils.lerp(lowerX, upperX, fraction), MathUtils.lerp(lowerZ, upperZ, fraction)]
	}
}
