'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ImageOff, TriangleAlert } from 'lucide-react'
import { ReactNode } from 'react'

interface HairCardBakeMapCheckboxCardProps {
	id: string
	label: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	/** The project's persisted map of this kind (`Project.bakedMaps`), if one's been baked before - clicking it previews that map on the dialog's viewport quad. Undefined shows a placeholder instead. */
	previewUrl?: string
	/** Whether this card's map is the one currently shown in the viewport's single-map preview. */
	isPreviewing?: boolean
	onPreviewClick?: () => void
	/**
	 * See Editor.isHairCardsBakeDirty - the hair-card layout has changed since this map's own preview
	 * was baked. Only rendered when `previewUrl` is also set - a map that's never been baked has
	 * nothing to go stale.
	 */
	stale?: boolean
	/**
	 * True when this map is persisted at a resolution other than the one currently selected in the
	 * form, and isn't checked (so it won't be rebaked to match this submit) - see
	 * HairCardBakeDialog.isResolutionMismatch. Only rendered when `previewUrl` is also set, same as
	 * `stale`.
	 */
	resolutionMismatch?: boolean
	/** Per-map options (roots/tips scale, id group count) - always shown, not just while `checked`. */
	children?: ReactNode
}

/**
 * One bakeable map's checkbox, as a small card: a thumbnail of the project's last bake of that kind
 * on the left (or a placeholder if it's never been baked), clicking it opens that map alone in the
 * dialog's preview viewport (HairCardBakePreviewPanel/HairCardBakePreviewRenderer.showSingleMap) -
 * the checkbox/label sit to its right, and any per-map options render below.
 */
export function HairCardBakeMapCheckboxCard({
	id,
	label,
	checked,
	onCheckedChange,
	previewUrl,
	isPreviewing = false,
	onPreviewClick,
	stale = false,
	resolutionMismatch = false,
	children,
}: HairCardBakeMapCheckboxCardProps) {
	const inputId = `hair-card-bake-${id}`
	const showStaleBadge = stale && !!previewUrl
	const showResolutionMismatchBadge = resolutionMismatch && !!previewUrl

	return (
		<div
			data-id={`hair-card-bake-map-card-${id}`}
			className={cn(
				'flex flex-col gap-1.5 rounded-md border p-2',
				checked && 'bg-muted/30',
				isPreviewing && 'border-primary ring-1 ring-primary'
			)}
		>
			<div className="flex items-center gap-2.5 justify-between">
				<div className="flex gap-2 items-center">
					<Checkbox
						id={inputId}
						data-id={inputId}
						checked={checked}
						onCheckedChange={(next) => onCheckedChange(next === true)}
					/>
					<Label htmlFor={inputId}>{label}</Label>
					{showStaleBadge && (
						<Tooltip>
							<TooltipTrigger
								type="button"
								data-id={`hair-card-bake-map-card-${id}-stale`}
								className="flex items-center"
							>
								<TriangleAlert className="size-3.5 text-destructive" />
							</TooltipTrigger>
							<TooltipContent>Hair cards moved since this map was last baked - rebake to update it.</TooltipContent>
						</Tooltip>
					)}
					{showResolutionMismatchBadge && (
						<Tooltip>
							<TooltipTrigger
								type="button"
								data-id={`hair-card-bake-map-card-${id}-resolution-mismatch`}
								className="flex items-center"
							>
								<TriangleAlert className="size-3.5 text-destructive" />
							</TooltipTrigger>
							<TooltipContent>
								Baked at a different resolution than the one selected below - rebake to match.
							</TooltipContent>
						</Tooltip>
					)}
				</div>
				{previewUrl ? (
					<button
						type="button"
						data-id={`hair-card-bake-map-card-${id}-preview`}
						onClick={onPreviewClick}
						className="shrink-0 cursor-pointer rounded-sm"
					>
						<img
							src={previewUrl}
							alt={`${label} map preview`}
							className="size-10 rounded-sm bg-muted object-cover"
						/>
					</button>
				) : (
					<div
						data-id={`hair-card-bake-map-card-${id}-preview-placeholder`}
						className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-dashed bg-muted/30"
					>
						<ImageOff className="size-4 text-muted-foreground" />
					</div>
				)}
			</div>
			{children}
		</div>
	)
}
