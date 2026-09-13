import { BufferGeometry } from 'three'

/** One texture in the shared hair-card atlas rendered by HairCardBaker. */
export type BakeMapKind = 'alpha' | 'color' | 'normal' | 'ao' | 'roots' | 'tips' | 'height' | 'id'

/** Which maps a bake should produce, and the per-map options the request/roots/tips/id maps expose. */
export interface HairCardBakeRequest {
	resolution: number
	alpha: boolean
	color: boolean
	normal: boolean
	ao: boolean
	height: boolean
	roots: { enabled: boolean; scale: number }
	tips: { enabled: boolean; scale: number }
	id: { enabled: boolean; groupCount: number }
}

/** One card's live geometry and placement inside the shared 0-1 working area. */
export interface HairCardBakeCardInput {
	cardId: string
	geometry: BufferGeometry
	position: { x: number; y: number; z: number }
}

/** One step of an in-progress bake, reported through HairCardBakeInput.onProgress. */
export interface HairCardBakeProgress {
	/** Display label for the step currently rendering, e.g. "Ambient occlusion" or "Ambient occlusion (sweep 12/33)". */
	label: string
	/** 1-based position among the requested map kinds - not among all 8 possible kinds. */
	index: number
	total: number
}

/** Everything HairCardBaker needs to bake all cards into one shared texture atlas. */
export interface HairCardBakeInput {
	cards: HairCardBakeCardInput[]
	/** Deterministic seed for atlas-wide AO sampling and ID group assignment. */
	seed: string
	request: HairCardBakeRequest
	/** Called once per requested map kind (and, during the ao step, once per AO sub-sample too) as the bake progresses. */
	onProgress?: (progress: HairCardBakeProgress) => void
	/** Checked between map-kind steps, and inside the AO passes' own inner loops, to interrupt an in-flight bake. */
	signal?: AbortSignal
}

export interface HairCardBakeMapResult {
	kind: BakeMapKind
	blob: Blob
	resolution: number
}

export interface HairCardBakeResult {
	cardCount: number
	maps: HairCardBakeMapResult[]
}

/** One persisted map's storage location and the resolution it was baked at. */
export interface BakedMapEntry {
	url: string
	resolution: number
}

/**
 * `Project.bakedMaps`/the `projects.bakedMaps` DB column's shape - every persisted map kind carries
 * its own resolution because one bake call always applies one resolution across all the kinds it
 * renders (HairCardBakeRequest.resolution), so a partial re-bake done later at a different resolution
 * can leave some kinds mismatched with others - see HairCardBakeMapCheckboxCard's resolutionMismatch
 * warning.
 */
export type BakedMapsRecord = Partial<Record<BakeMapKind, BakedMapEntry>>
