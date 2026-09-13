import { BakedMapsRecord, BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'

/**
 * One baked map ready to preview - either a freshly baked blob (resolution/sizeBytes known) or a
 * persisted storage URL reloaded from the project row (`Project.bakedMaps` - resolution is known
 * there too via `BakedMapsRecord`, but `sizeBytes` isn't persisted, so that one stays undefined
 * without an extra fetch). `HairCardBakeMapThumbnail` renders either shape the same way, showing the
 * size/resolution line only when present.
 */
export interface BakeMapPreviewItem {
	kind: BakeMapKind
	url: string
	resolution?: number
	sizeBytes?: number
}

/** Stable display order for a bake's maps, shared by every preview grid. */
export const BAKE_MAP_KIND_ORDER: readonly BakeMapKind[] = [
	'alpha',
	'color',
	'normal',
	'ao',
	'height',
	'roots',
	'tips',
	'id',
]

/**
 * Which raw stored map is being shown alone on the dialog's viewport quad, overriding the default
 * preview material - entered by clicking that map's own checkbox card
 * (HairCardBakeMapCheckboxCard), loaded straight from its storage URL. There's no "composed" variant
 * of this any more - the composed preview material is the viewport's default view, not something
 * entered via a single-map override (see HairCardBakePreviewRenderer.showPreview).
 */
export interface HairCardBakeSingleMapPreview {
	kind: BakeMapKind
	url: string
}

/** Turns the project row's persisted `bakedMaps` column into preview items, in display order. */
export function bakedMapsToPreviewItems(bakedMaps: BakedMapsRecord): readonly BakeMapPreviewItem[] {
	return BAKE_MAP_KIND_ORDER.filter((kind) => bakedMaps[kind]).map((kind) => ({
		kind,
		url: bakedMaps[kind]!.url,
		resolution: bakedMaps[kind]!.resolution,
	}))
}
