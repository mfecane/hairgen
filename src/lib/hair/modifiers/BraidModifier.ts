import { BraidModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'
import { MathUtils } from 'three'

/**
 * Chunks strands into `groupSize`-strand groups (roots sorted by X, then split into consecutive
 * groups - a card's root-sampling strip is narrow in Y relative to its width, so X is the dimension
 * that actually separates one braid group from its neighbors). Each group weaves around its own
 * centroid root: member `k` of `groupSize` gets a `2*PI*k/groupSize` phase offset on a shared
 * helix, so the group reads as strands wound around each other rather than independently wavy.
 * Leftover strands that don't fill a full group are left unmodified. Blended in by `strength * t`
 * (t = position along the strand, 0 at the root) so every strand still starts exactly at its own
 * root.
 */
export class BraidModifier {
	public apply(strands: readonly HairCardStrandCenterline[], params: BraidModifierParams): void {
		const groupSize = params.groupSize
		const order = strands.map((_, index) => index).sort((a, b) => strands[a].rootX - strands[b].rootX)

		for (let start = 0; start + groupSize <= order.length; start += groupSize) {
			this.applyGroup(strands, order.slice(start, start + groupSize), params)
		}
	}

	private applyGroup(
		strands: readonly HairCardStrandCenterline[],
		groupIndices: readonly number[],
		params: BraidModifierParams
	): void {
		const members = groupIndices.map((index) => strands[index])
		const centroidX = this.average(members.map((member) => member.rootX))
		const radius = this.average(members.map((member) => Math.abs(member.rootX - centroidX)))

		groupIndices.forEach((strandIndex, memberIndex) => {
			const strand = strands[strandIndex]
			const phase = (memberIndex / groupIndices.length) * Math.PI * 2
			const lastIndex = strand.points.length - 1
			strand.points.forEach((point, index) => {
				const t = index / lastIndex
				const angle = t * params.period * Math.PI * 2 + phase
				const targetX = centroidX + radius * Math.cos(angle)
				const targetZ = radius * Math.sin(angle)
				point.x = MathUtils.lerp(point.x, targetX, params.strength * t)
				point.z = MathUtils.lerp(point.z, targetZ, params.strength * t)
			})
		})
	}

	private average(values: readonly number[]): number {
		return values.reduce((sum, value) => sum + value, 0) / values.length
	}
}
