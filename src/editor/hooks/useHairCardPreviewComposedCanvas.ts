'use client'

import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardPreviewMapComposer } from '@/lib/hair/compose/HairCardPreviewMapComposer'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { useEffect, useRef, useState } from 'react'

/**
 * Owns one HairCardPreviewMapComposer for as long as HairCardBakeDialog is mounted, recomposing the
 * project's "preview material" diffuse+alpha blend (HairCardPreviewMapComposer.composeToCanvas)
 * whenever the baked map URLs or `HairCardBakeDialog`'s color pickers change, as a data URL for
 * `HairCardBakePreviewComposedCard`'s thumbnail. Null while `bakedMaps` has no `alpha` yet - the only
 * map the composer requires. The full "preview material" (this blend plus the baked normal map) is a
 * separate, three.js-only path - see HairCardBakePreviewRenderer.showPreview/
 * GroomEditorController.ensureCardStripPreviewMap - since a thumbnail only ever needs the flat image.
 */
export function useHairCardPreviewComposedCanvas(
	bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
	colors: HairPreviewColors
): string | null {
	const composerRef = useRef<HairCardPreviewMapComposer | null>(null)
	const [dataUrl, setDataUrl] = useState<string | null>(null)

	useEffect(() => {
		const composer = new HairCardPreviewMapComposer()
		composerRef.current = composer
		return () => {
			composerRef.current = null
			composer.dispose()
		}
	}, [])

	useEffect(() => {
		let cancelled = false
		void composerRef.current?.composeToCanvas(bakedMaps, colors).then((canvas) => {
			if (!cancelled) {
				setDataUrl(canvas?.toDataURL('image/png') ?? null)
			}
		})
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the composer's own inputs, not the bakedMaps/colors object identities
	}, [
		// `color`'s URL is deliberately not a dependency - the composer never reads it (see its own
		// doc), so a color-only (re)bake shouldn't trigger a recompose here.
		bakedMaps.alpha?.url,
		bakedMaps.id?.url,
		bakedMaps.roots?.url,
		bakedMaps.tips?.url,
		colors.primary,
		colors.secondary,
		colors.tip,
		colors.root,
	])

	return dataUrl
}
