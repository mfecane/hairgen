'use client'

import { EditorTheme } from '@/constants'
import { HairCardBakePreviewRenderer } from '@/lib/hair/bake/HairCardBakePreviewRenderer'
import { HairCardBakeSingleMapPreview } from '@/lib/hair/bake/HairCardBakeMapPreview'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { RefObject, useEffect, useRef } from 'react'

/**
 * Mounts a HairCardBakePreviewRenderer onto the given element for as long as HairCardBakePreviewPanel
 * is rendered - recreated only on mount/theme change, not on every `bakedMaps`/`colors` update (the
 * renderer's own `showPreview` is idempotent and keyed on its inputs, so there's no need to tear the
 * whole GL context down for that). `bakedMaps`/`colors` drive the default preview material
 * (HairCardPreviewMapComposer.composePreview - see HairCardBakePreviewRenderer.showPreview);
 * `singleMapPreview`, when set, overrides it with one raw stored map shown alone.
 */
export function useHairCardBakePreviewRenderer(
	mountRef: RefObject<HTMLDivElement | null>,
	theme: EditorTheme,
	bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
	colors: HairPreviewColors,
	singleMapPreview: HairCardBakeSingleMapPreview | null
): void {
	const rendererRef = useRef<HairCardBakePreviewRenderer | null>(null)

	useEffect(() => {
		if (!mountRef.current) {
			throw new Error('useHairCardBakePreviewRenderer: preview mount element is unavailable')
		}
		const renderer = new HairCardBakePreviewRenderer(mountRef.current, theme)
		rendererRef.current = renderer
		// A fresh renderer starts blank - re-apply whatever this hook's other two effects last
		// applied, since recreating on theme change won't re-trigger effects whose own deps didn't
		// change (see the exhaustive-deps suppressions below).
		if (singleMapPreview) {
			void renderer.showSingleMap(singleMapPreview.url)
		} else {
			void renderer.showPreview(bakedMaps, colors)
		}
		return () => {
			rendererRef.current = null
			renderer.dispose()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only recreates on theme change; current bakedMaps/colors/singleMapPreview are read once at that moment
	}, [mountRef, theme])

	useEffect(() => {
		void rendererRef.current?.showPreview(bakedMaps, colors)
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the composer's own inputs, not the bakedMaps/colors object identities
	}, [
		bakedMaps.alpha?.url,
		bakedMaps.normal?.url,
		bakedMaps.id?.url,
		bakedMaps.roots?.url,
		bakedMaps.tips?.url,
		colors.primary,
		colors.secondary,
		colors.tip,
		colors.root,
	])

	useEffect(() => {
		const renderer = rendererRef.current
		if (!renderer) {
			return
		}
		if (singleMapPreview) {
			void renderer.showSingleMap(singleMapPreview.url)
		} else {
			renderer.exitSingleMap()
		}
	}, [singleMapPreview])
}
