'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BAKE_MAP_LABELS } from '@/lib/hair/bake/HairCardBakeMapLabels'
import { BakeMapPreviewItem } from '@/lib/hair/bake/HairCardBakeMapPreview'
import { cn } from '@/lib/utils'

interface HairCardBakeMapThumbnailProps {
	item: BakeMapPreviewItem
}

const FILE_SIZE_UNITS = ['B', 'KB', 'MB'] as const

function formatFileSize(bytes: number): string {
	let value = bytes
	let unitIndex = 0
	while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
		value /= 1024
		unitIndex += 1
	}
	return `${unitIndex === 0 ? value : value.toFixed(1)}${FILE_SIZE_UNITS[unitIndex]}`
}

/**
 * One baked map: a small thumbnail plus label/size, hovering opens a large preview via
 * TooltipContent. `resolution`/`sizeBytes` are only known for a map baked this session (see
 * `useBakeMapObjectUrls`) - a persisted map reloaded from the project shows just its label.
 */
export function HairCardBakeMapThumbnail({ item }: HairCardBakeMapThumbnailProps) {
	const label = BAKE_MAP_LABELS[item.kind]
	const detail =
		item.resolution !== undefined && item.sizeBytes !== undefined
			? `${item.resolution}px - ${formatFileSize(item.sizeBytes)}`
			: null

	return (
		<Tooltip>
			<TooltipTrigger
				type="button"
				data-id={`hair-card-bake-map-thumbnail-${item.kind}`}
				className={cn(
					'flex flex-col items-center gap-1.5 rounded-md border p-2',
					'bg-muted/30 hover:bg-muted/60'
				)}
			>
				<img
					src={item.url}
					alt={`${label} map preview`}
					className="size-16 rounded-sm bg-muted object-cover"
				/>
				<span className="text-xs font-medium">{label}</span>
				{detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
			</TooltipTrigger>
			<TooltipContent
				data-id={`hair-card-bake-map-tooltip-${item.kind}`}
				side="right"
				className="max-w-none gap-2 p-2"
			>
				<div className="flex flex-col items-center gap-1.5">
					<img
						src={item.url}
						alt={`${label} map, larger preview`}
						className="size-64 rounded-sm bg-muted object-cover"
					/>
					<span className="text-xs">{detail ? `${label} - ${detail}` : label}</span>
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
