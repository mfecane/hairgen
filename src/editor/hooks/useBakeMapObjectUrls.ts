'use client'

import { BAKE_MAP_KIND_ORDER, BakeMapPreviewItem } from '@/lib/hair/bake/HairCardBakeMapPreview'
import { HairCardBakeMapResult } from '@/lib/hair/bake/HairCardBakeTypes'
import { useEffect, useMemo } from 'react'

/**
 * Turns a finished bake's map blobs into object-URL preview items (`BakeMapPreviewItem`, in
 * `BAKE_MAP_KIND_ORDER`), revoking the previous batch whenever `maps` changes or the dialog
 * unmounts - object URLs otherwise leak for the page's lifetime.
 */
export function useBakeMapObjectUrls(maps: readonly HairCardBakeMapResult[] | null): readonly BakeMapPreviewItem[] {
	const items = useMemo<readonly BakeMapPreviewItem[]>(() => {
		const byKind = new Map(maps?.map((map) => [map.kind, map]))
		return BAKE_MAP_KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => {
			const map = byKind.get(kind)!
			return { kind, resolution: map.resolution, sizeBytes: map.blob.size, url: URL.createObjectURL(map.blob) }
		})
	}, [maps])

	useEffect(() => {
		return () => {
			for (const item of items) {
				URL.revokeObjectURL(item.url)
			}
		}
	}, [items])

	return items
}
