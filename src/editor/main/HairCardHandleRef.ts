import { Object3D } from 'three'

/** Which axis dragging a handle resizes - 'both' for a corner, or a single axis for a side handle (see HAIR_CARD_HANDLES). */
export type HairCardHandleAxis = 'both' | 'x' | 'y'

/**
 * One resize handle's position in card-local XY sign (0 meaning "centered on that axis"), and
 * which axis dragging it resizes. A corner (signX and signY both ±1) drives both axes at once; a
 * side handle (one sign 0) drives only its own axis, leaving the other dimension untouched - see
 * HairCardResizeInteractionHandler.applyDelta's per-axis gating.
 */
export interface HairCardHandle {
	readonly signX: -1 | 0 | 1
	readonly signY: -1 | 0 | 1
	readonly axis: HairCardHandleAxis
}

/** Four corners (resize width and depth together) plus four side midpoints (resize one axis each) - see HairCardWidget. */
export const HAIR_CARD_HANDLES: readonly HairCardHandle[] = [
	{ signX: -1, signY: -1, axis: 'both' },
	{ signX: 1, signY: -1, axis: 'both' },
	{ signX: 1, signY: 1, axis: 'both' },
	{ signX: -1, signY: 1, axis: 'both' },
	{ signX: 1, signY: 0, axis: 'x' },
	{ signX: -1, signY: 0, axis: 'x' },
	{ signX: 0, signY: 1, axis: 'y' },
	{ signX: 0, signY: -1, axis: 'y' },
]

/**
 * Tags a hair card's handle mesh (see HairCardWidget) with the card it resizes and which handle it
 * is. Separate from tagSceneObject/tryGetSceneObjectId, which identify a selectable scene object
 * rather than a gizmo handle - HairCardResizeInteractionHandler hit-tests this tag specifically so
 * a handle drag is never mistaken for a card-body drag (see HairCardMoveInteractionHandler).
 */
export function tagHairCardHandle(object: Object3D, cardId: string, handle: HairCardHandle): void {
	object.userData.hairCardHandle = { cardId, handle }
}

export function tryGetHairCardHandle(object: Object3D): { cardId: string; handle: HairCardHandle } | null {
	const tag = object.userData.hairCardHandle as { cardId: string; handle: HairCardHandle } | undefined
	return tag ?? null
}
