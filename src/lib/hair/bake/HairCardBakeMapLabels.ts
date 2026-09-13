import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'

/** Display label for each bake map kind - shared by the bake form's checkboxes and its result preview. */
export const BAKE_MAP_LABELS: Record<BakeMapKind, string> = {
	alpha: 'Alpha',
	color: 'Color',
	normal: 'Normal',
	ao: 'Ambient occlusion',
	height: 'Height',
	roots: 'Roots',
	tips: 'Tips',
	id: 'ID',
}
