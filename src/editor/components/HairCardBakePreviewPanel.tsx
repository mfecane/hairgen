'use client'

import { Button } from '@/components/ui/button'
import { EditorTheme } from '@/constants'
import { useHairCardBakePreviewRenderer } from '@/editor/hooks/useHairCardBakePreviewRenderer'
import { BAKE_MAP_LABELS } from '@/lib/hair/bake/HairCardBakeMapLabels'
import { HairCardBakeSingleMapPreview } from '@/lib/hair/bake/HairCardBakeMapPreview'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'

interface HairCardBakePreviewPanelProps {
	theme: EditorTheme
	bakedMaps: Partial<Record<BakeMapKind, { url: string }>>
	colors: HairPreviewColors
	/** Set while one map's checkbox card (HairCardBakeMapCheckboxCard) is being previewed - shows that raw map alone on the quad instead of the default preview material. */
	singleMapPreview: HairCardBakeSingleMapPreview | null
	onExitSingleMapPreview: () => void
}

/**
 * Right-hand pane of HairCardBakeDialog: a plain card until a bake completes, then by default the
 * same card rendered with the "preview material" (HairCardPreviewMapComposer.composePreview -
 * composed alpha/id/roots/tips + colors, plus the baked normal map if any) - HairCardBakePreviewRenderer
 * owns the actual three.js scene. While `singleMapPreview` is set, one raw stored map is shown alone
 * instead, with a back arrow overlay to leave that mode. `alpha` is the preview material's one
 * required map (see HairCardPreviewMapComposer) - missing it after a bake shows a warning instead of
 * a stale/empty quad.
 */
export function HairCardBakePreviewPanel({
	theme,
	bakedMaps,
	colors,
	singleMapPreview,
	onExitSingleMapPreview,
}: HairCardBakePreviewPanelProps) {
	const mountRef = useRef<HTMLDivElement>(null)
	useHairCardBakePreviewRenderer(mountRef, theme, bakedMaps, colors, singleMapPreview)

	const hasAnyMap = Object.keys(bakedMaps).length > 0
	const hasAlpha = Boolean(bakedMaps.alpha?.url)

	return (
		<div data-id="hair-card-bake-preview-panel" className="relative h-full w-full">
			<div ref={mountRef} className="absolute inset-0" />
			{!hasAnyMap && !singleMapPreview && (
				<p
					data-id="hair-card-bake-preview-empty"
					className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
				>
					Bake textures to preview the card
				</p>
			)}
			{hasAnyMap && !hasAlpha && !singleMapPreview && (
				<div
					data-id="hair-card-bake-preview-warning"
					className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center"
				>
					<span className="flex items-center gap-1.5 text-sm text-destructive">
						<TriangleAlert className="size-4" />
						Preview not available - bake alpha to see it
					</span>
				</div>
			)}
			{singleMapPreview && (
				<div data-id="hair-card-bake-single-map-preview-bar" className="absolute left-3 top-3 flex items-center gap-2">
					<Button
						data-id="hair-card-bake-single-map-preview-exit"
						type="button"
						variant="secondary"
						size="icon"
						onClick={onExitSingleMapPreview}
					>
						<ArrowLeft />
					</Button>
					<span className="rounded-md bg-background/80 px-2 py-1 text-xs font-medium">
						{BAKE_MAP_LABELS[singleMapPreview.kind]}
					</span>
				</div>
			)}
		</div>
	)
}
