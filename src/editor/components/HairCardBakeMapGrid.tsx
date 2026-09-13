'use client'

import { HairCardBakeMapThumbnail } from '@/editor/components/HairCardBakeMapThumbnail'
import { BakeMapPreviewItem } from '@/lib/hair/bake/HairCardBakeMapPreview'
import { TooltipProvider } from '@/components/ui/tooltip'

interface HairCardBakeMapGridProps {
	items: readonly BakeMapPreviewItem[]
}

/** Thumbnail grid for a bake's maps - freshly baked or reloaded from the project - each expanding to a larger preview on hover. */
export function HairCardBakeMapGrid({ items }: HairCardBakeMapGridProps) {
	return (
		<TooltipProvider>
			<div data-id="hair-card-bake-map-grid" className="flex flex-wrap gap-2">
				{items.map((item) => (
					<HairCardBakeMapThumbnail key={item.kind} item={item} />
				))}
			</div>
		</TooltipProvider>
	)
}
