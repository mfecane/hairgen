import { HAIR_CARD } from '@/constants'
import { TwistModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { HairCardStrandCenterline } from '@/lib/hair/modifiers/HairCardStrandCenterline'

/**
 * Rotates each strand's points around the vertical line through its own root (rootX, z = 0) - the
 * same local-Y axis HairStrandCenterlineCurve's class doc anticipates a twist modifier using. The
 * root (t = 0) never moves; rotation angle grows linearly with t up to `amount * MAX_TURNS` full
 * turns at the tip, so a strand reads as spiraling more the further it gets from its root.
 */
export class TwistModifier {
	public apply(strands: readonly HairCardStrandCenterline[], params: TwistModifierParams): void {
		strands.forEach((strand) => {
			const lastIndex = strand.points.length - 1
			strand.points.forEach((point, index) => {
				const t = index / lastIndex
				const angle = t * params.amount * HAIR_CARD.MODIFIERS.TWIST.MAX_TURNS * Math.PI * 2
				const dx = point.x - strand.rootX
				const dz = point.z
				const cos = Math.cos(angle)
				const sin = Math.sin(angle)
				point.x = strand.rootX + dx * cos - dz * sin
				point.z = dx * sin + dz * cos
			})
		})
	}
}
