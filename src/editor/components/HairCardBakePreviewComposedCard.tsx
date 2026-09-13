'use client'

import { ImageOff, TriangleAlert } from 'lucide-react'

interface HairCardBakePreviewComposedCardProps {
	dataUrl: string | null
}

/**
 * The "Preview" map's own readonly status card, next to HairCardBakeDialog's 4 color pickers - not a
 * bakeable/checkable map like HairCardBakeMapCheckboxCard's (see HairCardPreviewMapComposer), just a
 * live thumbnail of the alpha/id/roots/tips bakes blended with those colors
 * (useHairCardPreviewComposedCanvas), recomposed automatically whenever either changes - no separate
 * "compose" action, and no click-to-preview either: this composed material is already the dialog's
 * viewport default view (HairCardBakePreviewRenderer.showPreview), so there's nothing an isolated
 * preview of it here would add. `alpha` is the only map the composer requires (id/roots/tips are
 * optional, `color` isn't sampled at all - see HairCardPreviewMapComposer); a placeholder plus
 * warning replaces the thumbnail while it's missing.
 */
export function HairCardBakePreviewComposedCard({ dataUrl }: HairCardBakePreviewComposedCardProps) {
	return (
		<div data-id="hair-card-bake-preview-composed-card" className="flex items-center gap-2.5 rounded-md border p-2">
			{dataUrl ? (
				<img
					data-id="hair-card-bake-preview-composed-card-preview"
					src={dataUrl}
					alt="Preview map"
					className="size-10 shrink-0 rounded-sm bg-muted object-cover"
				/>
			) : (
				<div
					data-id="hair-card-bake-preview-composed-card-placeholder"
					className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-dashed bg-muted/30"
				>
					<ImageOff className="size-4 text-muted-foreground" />
				</div>
			)}
			<div className="flex flex-col">
				<span className="text-sm font-medium">Preview</span>
				{dataUrl ? (
					<span className="text-[10px] text-muted-foreground">
						Composed from alpha/id/roots/tips + these colors
					</span>
				) : (
					<span
						data-id="hair-card-bake-preview-composed-card-warning"
						className="flex items-center gap-1 text-[10px] text-destructive"
					>
						<TriangleAlert className="size-3" />
						Not available - bake alpha first
					</span>
				)}
			</div>
		</div>
	)
}
