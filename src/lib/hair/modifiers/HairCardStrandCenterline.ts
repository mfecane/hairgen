import { HairStrandParams } from '@/lib/hair/HairStrandParams'
import { Vector3 } from 'three'

/**
 * One strand's working centerline while the modifier stack runs - see HairCardModifierStack. Built
 * by HairCardStrandsGenerator before any modifier sees it: `points` are already in card space (root
 * translation applied), so a modifier can compare/group strands by root position directly instead
 * of undoing a later translation. Modifiers mutate `points` in place; `rootX`/`rootY`/`params` never
 * change (a modifier that needs "this strand's own root" reads them, it doesn't recompute them).
 */
export interface HairCardStrandCenterline {
	points: Vector3[]
	rootX: number
	rootY: number
	params: HairStrandParams
}
