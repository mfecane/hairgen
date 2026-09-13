'use client'

import { NumericInput } from '@/components/NumericInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { GROOM } from '@/constants'
import { useGroomReactBridge } from '@/editor/groom/hooks/useGroomReactBridge'
import { useHairCardOptions } from '@/editor/groom/hooks/useHairCardOptions'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { Copy, Trash, X } from 'lucide-react'
import { useRef, useState } from 'react'

interface SplineOptionsPanelProps {
	editor: GroomEditor
	projectId?: string
}

interface SplineOptionsFieldsProps {
	editor: GroomEditor
	projectId?: string
	splineId: string
	initialHairCardId: string | null
	initialResolution: number
	initialCardWidth: number
	initialCardStartOffset: number
}

/** Radix Select can't take an empty-string item value - this stands in for "no hair card chosen." */
const NONE_VALUE = 'none'

/**
 * Floating inspector shown while exactly one spline is selected: which hair card to instantiate
 * along it, the quad-chain resolution (subdivisions per world unit - the actual subdivision count
 * is inferred from spline length * resolution, see SplineObject.getSubdivisionCountForResolution),
 * and the card strip's own width. The hair-card pick only ever changes the strip's texture/UVs
 * (SplineCardStripGeometryGenerator/GroomHairCardLookup) - it never resizes the mesh, so "Card
 * width" is a separate, independently edited field (SplineObject.cardWidth). Keyed by the spline's
 * id in the parent below so switching the selection remounts it with a fresh initial value. Mirrors
 * HairCardOptionsPanel.tsx's outer/inner + live/commit pattern - the hair-card pick is a discrete
 * choice committed immediately (one undo entry per pick, like addHairCard); card width/start offset
 * use Slider's onValueChange (live)/onValueCommit (one undo entry) split, same as
 * SplineSmoothModifyPanel's influence slider; resolution uses NumericInput, which debounces its own
 * typing/dragging internally and only ever calls back once settled, so its handler commits directly.
 */
export function SplineOptionsPanel({ editor, projectId }: SplineOptionsPanelProps) {
	const { selectedObjectId, selectedObjectIds } = useGroomReactBridge()
	if (selectedObjectIds.size !== 1 || !selectedObjectId) {
		return null
	}
	const spline = editor.project.scene.get(selectedObjectId)
	if (!spline) {
		return null
	}

	return (
		<SplineOptionsFields
			key={spline.id}
			editor={editor}
			projectId={projectId}
			splineId={spline.id}
			initialHairCardId={spline.hairCardId}
			initialResolution={spline.resolution}
			initialCardWidth={spline.cardWidth}
			initialCardStartOffset={spline.cardStartOffset}
		/>
	)
}

/**
 * Reads a spline's smooth-modify fields fresh off the live model, since this component doesn't own
 * them - SplineSmoothModifyPanel does (see SetSplineOptionsCommand's class doc for why every
 * co-editor of the option bundle must do this rather than keep a stale local mirror).
 */
function readSmoothModifyFields(
	editor: GroomEditor,
	splineId: string
): { smoothModifyEnabled: boolean; influence: number } {
	const spline = editor.project.scene.get(splineId)
	return {
		smoothModifyEnabled: spline?.smoothModifyEnabled ?? GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_ENABLED,
		influence: spline?.influence ?? GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_INFLUENCE,
	}
}

function SplineOptionsFields({
	editor,
	projectId,
	splineId,
	initialHairCardId,
	initialResolution,
	initialCardWidth,
	initialCardStartOffset,
}: SplineOptionsFieldsProps) {
	const [hairCardId, setHairCardId] = useState(initialHairCardId)
	const [resolution, setResolution] = useState(initialResolution)
	const [cardWidth, setCardWidth] = useState(initialCardWidth)
	const [cardStartOffset, setCardStartOffset] = useState(initialCardStartOffset)
	// The options snapshot at the start of the current edit - see HairCardOptionsPanel's identical
	// reasoning.
	const before = useRef({
		hairCardId: initialHairCardId,
		resolution: initialResolution,
		cardWidth: initialCardWidth,
		cardStartOffset: initialCardStartOffset,
	})
	const { hairCards, loading } = useHairCardOptions(projectId)
	const spline = editor.project.scene.get(splineId)
	const subdivisionCount = spline?.getSubdivisionCountForResolution(resolution) ?? 0
	const maxCardStartOffset = Math.max(0, (spline?.getLength() ?? 0) - GROOM.SPLINE.CARD_STRIP.MIN_REMAINING_LENGTH)

	function handleHairCardChange(value: string): void {
		const nextId = value === NONE_VALUE ? null : value
		setHairCardId(nextId)
		editor.commitSplineOptions(
			splineId,
			{ ...before.current, ...readSmoothModifyFields(editor, splineId) },
			{
				hairCardId: nextId,
				resolution,
				cardWidth,
				cardStartOffset,
				...readSmoothModifyFields(editor, splineId),
			}
		)
		before.current = { hairCardId: nextId, resolution, cardWidth, cardStartOffset }
	}

	function handleResolutionChange(next: number): void {
		setResolution(next)
		editor.commitSplineOptions(
			splineId,
			{ ...before.current, ...readSmoothModifyFields(editor, splineId) },
			{
				hairCardId,
				resolution: next,
				cardWidth,
				cardStartOffset,
				...readSmoothModifyFields(editor, splineId),
			}
		)
		before.current = { hairCardId, resolution: next, cardWidth, cardStartOffset }
	}

	function handleCardWidthChange([next]: number[]): void {
		setCardWidth(next)
		editor.setSplineOptions(splineId, {
			hairCardId,
			resolution,
			cardWidth: next,
			cardStartOffset,
			...readSmoothModifyFields(editor, splineId),
		})
	}

	function handleCardWidthCommit([next]: number[]): void {
		setCardWidth(next)
		editor.commitSplineOptions(
			splineId,
			{ ...before.current, ...readSmoothModifyFields(editor, splineId) },
			{
				hairCardId,
				resolution,
				cardWidth: next,
				cardStartOffset,
				...readSmoothModifyFields(editor, splineId),
			}
		)
		before.current = { hairCardId, resolution, cardWidth: next, cardStartOffset }
	}

	function handleCardStartOffsetChange([next]: number[]): void {
		setCardStartOffset(next)
		editor.setSplineOptions(splineId, {
			hairCardId,
			resolution,
			cardWidth,
			cardStartOffset: next,
			...readSmoothModifyFields(editor, splineId),
		})
	}

	function handleCardStartOffsetCommit([next]: number[]): void {
		setCardStartOffset(next)
		editor.commitSplineOptions(
			splineId,
			{ ...before.current, ...readSmoothModifyFields(editor, splineId) },
			{
				hairCardId,
				resolution,
				cardWidth,
				cardStartOffset: next,
				...readSmoothModifyFields(editor, splineId),
			}
		)
		before.current = { hairCardId, resolution, cardWidth, cardStartOffset: next }
	}

	return (
		<div
			data-id="spline-options-panel"
			className="relative h-full flex flex-col w-64 gap-4 p-4 shadow-md pointer-events-auto bg-background border-r border-border animate-in slide-in-from-left duration-300"
		>
			<Button
				variant="secondary"
				size="icon-sm"
				className="absolute top-2 right-2 z-10"
				onClick={() => editor.selectSpline(null, false)}
			>
				<X className="size-4" />
			</Button>
			<h2>Spline name</h2>
			<div className="flex flex-col gap-2">
				<Label htmlFor="spline-hair-card-select">Hair card</Label>
				<Select
					value={hairCardId ?? NONE_VALUE}
					onValueChange={handleHairCardChange}
					disabled={loading || hairCards.length === 0}
				>
					<SelectTrigger data-id="spline-hair-card-select" id="spline-hair-card-select">
						<SelectValue placeholder="None" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE_VALUE}>None</SelectItem>
						{hairCards.map((card) => (
							<SelectItem key={card.id} value={card.id}>
								{card.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{!loading && hairCards.length === 0 && (
					<p className="text-xs text-muted-foreground">No hair cards in this project yet.</p>
				)}
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex gap-2 justify-between">
					<Label htmlFor="spline-resolution">Resolution</Label>
					<NumericInput
						data-id="spline-resolution"
						id="spline-resolution"
						round
						value={resolution}
						onValueChange={handleResolutionChange}
						min={GROOM.SPLINE.MIN_RESOLUTION}
						max={GROOM.SPLINE.MAX_RESOLUTION}
						dragStep={GROOM.SPLINE.RESOLUTION_STEP}
					/>
				</div>
				<p data-id="spline-subdivision-count" className="text-xs text-muted-foreground">
					{subdivisionCount} quads
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="spline-card-width">Card width</Label>
					<span className="text-xs tabular-nums text-muted-foreground">{cardWidth.toFixed(2)}</span>
				</div>
				<Slider
					data-id="spline-card-width"
					id="spline-card-width"
					min={GROOM.SPLINE.CARD_STRIP.MIN_WIDTH}
					max={GROOM.SPLINE.CARD_STRIP.MAX_WIDTH}
					step={GROOM.SPLINE.CARD_STRIP.WIDTH_STEP}
					value={[cardWidth]}
					onValueChange={handleCardWidthChange}
					onValueCommit={handleCardWidthCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="spline-card-start-offset">Card start offset</Label>
					<span className="text-xs tabular-nums text-muted-foreground">{cardStartOffset.toFixed(2)}</span>
				</div>
				<Slider
					data-id="spline-card-start-offset"
					id="spline-card-start-offset"
					min={0}
					max={maxCardStartOffset}
					step={GROOM.SPLINE.CARD_STRIP.START_OFFSET_STEP}
					value={[cardStartOffset]}
					onValueChange={handleCardStartOffsetChange}
					onValueCommit={handleCardStartOffsetCommit}
				/>
			</div>

			<div className="mt-4 flex flex-wrap">
				{/* TODO: clon spline */}
				<Button data-id="hair-card-options-delete" variant="secondary" className="w-1/2">
					<Copy className="size-4" />
					Clone
				</Button>
				{/* TODO: delete spline */}
				<Button data-id="hair-card-options-delete" variant="destructive" className="w-1/2">
					<Trash className="size-4" />
					Delete
				</Button>
			</div>
		</div>
	)
}
