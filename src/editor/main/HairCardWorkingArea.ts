import { HAIR_CARD } from '@/constants'

/**
 * Clamps one axis of a hair card's center so its full edge-to-edge extent (`size` wide, centered
 * on `value`) stays inside the working area - used by HairCardMoveInteractionHandler, which
 * resizes nothing, only translates. If `size` alone exceeds the working area, the valid range
 * collapses to its midpoint rather than inverting.
 */
export function clampHairCardCenter(value: number, size: number): number {
	const half = size / 2
	const low = Math.min(HAIR_CARD.WORKING_AREA_MIN + half, HAIR_CARD.WORKING_AREA_MAX - half)
	const high = Math.max(HAIR_CARD.WORKING_AREA_MIN + half, HAIR_CARD.WORKING_AREA_MAX - half)
	return Math.min(Math.max(value, low), high)
}

/** Clamps a single world-space coordinate (e.g. a dragged corner) to the working area's bounds - used by HairCardResizeInteractionHandler. */
export function clampToWorkingArea(value: number): number {
	return Math.min(Math.max(value, HAIR_CARD.WORKING_AREA_MIN), HAIR_CARD.WORKING_AREA_MAX)
}
