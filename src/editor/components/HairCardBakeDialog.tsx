'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { BAKE } from '@/constants'
import { HairCardBakeMapCheckboxCard } from '@/editor/components/HairCardBakeMapCheckboxCard'
import { HairCardBakeMapGrid } from '@/editor/components/HairCardBakeMapGrid'
import { HairCardBakePreviewComposedCard } from '@/editor/components/HairCardBakePreviewComposedCard'
import { HairCardBakePreviewPanel } from '@/editor/components/HairCardBakePreviewPanel'
import { useBakeMapObjectUrls } from '@/editor/hooks/useBakeMapObjectUrls'
import { useHairCardPreviewComposedCanvas } from '@/editor/hooks/useHairCardPreviewComposedCanvas'
import { useHairCardsBakeDirty } from '@/editor/hooks/useHairCardsBakeDirty'
import { Editor } from '@/editor/main/Editor'
import { BrowserFileDownloader } from '@/lib/browser/BrowserFileDownloader'
import { bakedMapsToPreviewItems, HairCardBakeSingleMapPreview } from '@/lib/hair/bake/HairCardBakeMapPreview'
import {
	BakedMapsRecord,
	BakeMapKind,
	HairCardBakeProgress,
	HairCardBakeRequest,
	HairCardBakeResult,
} from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardBakeUploadClient } from '@/lib/hair/bake/HairCardBakeUploadClient'
import { HairCardBakeZipBuilder } from '@/lib/hair/bake/HairCardBakeZipBuilder'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { Download, ImageDown, Loader2 } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'

interface HairCardBakeDialogProps {
	editor: Editor
	disabled: boolean
	/** Undefined on the parameterless /editor route's unsaved scratch session - see docs/projects-and-auth.md. Storage is skipped in that case; only the zip download is offered. */
	projectId?: string
}

type BakePhase = 'form' | 'baking' | 'uploading' | 'done' | 'error'

/** The 8 bakeable map kinds' own booleans on BakeFormState - distinct from their per-map option fields (rootsScale/tipsScale/idGroupCount), which "Select all" must not touch. */
const MAP_KEYS = ['alpha', 'color', 'normal', 'ao', 'height', 'roots', 'tips', 'id'] as const

interface BakeFormState {
	resolution: number
	alpha: boolean
	color: boolean
	normal: boolean
	ao: boolean
	height: boolean
	roots: boolean
	rootsScale: number
	tips: boolean
	tipsScale: number
	id: boolean
	idGroupCount: number
}

/** Project.bakeOptions (HairCardBakeRequest) -> this dialog's flattened form shape. */
function bakeOptionsToFormState(options: HairCardBakeRequest): BakeFormState {
	return {
		resolution: options.resolution,
		alpha: options.alpha,
		color: options.color,
		normal: options.normal,
		ao: options.ao,
		height: options.height,
		roots: options.roots.enabled,
		rootsScale: options.roots.scale,
		tips: options.tips.enabled,
		tipsScale: options.tips.scale,
		id: options.id.enabled,
		idGroupCount: options.id.groupCount,
	}
}

/** This dialog's flattened form shape -> Project.bakeOptions/editor.bakeHairCards' request shape. */
function formStateToBakeOptions(form: BakeFormState): HairCardBakeRequest {
	return {
		resolution: form.resolution,
		alpha: form.alpha,
		color: form.color,
		normal: form.normal,
		ao: form.ao,
		height: form.height,
		roots: { enabled: form.roots, scale: form.rootsScale },
		tips: { enabled: form.tips, scale: form.tipsScale },
		id: { enabled: form.id, groupCount: form.idGroupCount },
	}
}

/**
 * Project-wide texture bake - renders every card into maps covering the complete working area,
 * stores each map individually in the project's storage, and hands the same maps to the browser
 * as a zip download. Map controls stay visible after completion so the next selection can be
 * changed and baked immediately. State machine: form -> baking -> (uploading) -> done/error.
 */
export function HairCardBakeDialog({ editor, disabled, projectId }: HairCardBakeDialogProps) {
	const [open, setOpen] = useState(false)
	// Read once at mount from the persisted Project.bakeOptions (see the useEffect below that writes
	// every change straight back to it via editor.setBakeOptions) - same "local state mirrors the
	// model, editor is the one source of truth for persistence" shape previewColors already uses.
	const [form, setForm] = useState<BakeFormState>(() => bakeOptionsToFormState(editor.project.bakeOptions))
	const [phase, setPhase] = useState<BakePhase>('form')
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<HairCardBakeResult | null>(null)
	// Populated by editor.bakeHairCards' onProgress callback while phase is 'baking' - null the rest
	// of the time (before the first callback fires, and once the bake settles either way).
	const [progress, setProgress] = useState<HairCardBakeProgress | null>(null)
	// Read once at mount, not re-synced from the editor afterward - this dialog is the only writer
	// (via editor.setPreviewColors below), same "local state mirrors the model, editor is the one
	// source of truth for persistence" shape HairCardOptionsPanel-style live-edit controls use.
	const [previewColors, setPreviewColorsState] = useState<HairPreviewColors>(() => editor.project.previewColors)
	// Which map's checkbox card is being shown alone on the viewport quad, overriding the default
	// preview material - see HairCardBakePreviewRenderer.showSingleMap/exitSingleMap.
	const [previewMapKind, setPreviewMapKind] = useState<BakeMapKind | null>(null)

	// Writes every form edit straight back to the persisted Project.bakeOptions, the same
	// no-separate-commit-step shape updatePreviewColor below already uses - so the resolution
	// select, map checkboxes, and per-map option sliders all reopen (and reload) with the last
	// selection instead of resetting to defaults.
	useEffect(() => {
		editor.setBakeOptions(formStateToBakeOptions(form))
	}, [editor, form])

	const zipBuilderRef = useRef(new HairCardBakeZipBuilder())
	const uploadClientRef = useRef(new HairCardBakeUploadClient())
	const downloaderRef = useRef(new BrowserFileDownloader())
	// Created fresh per submit() call - aborting it is how the footer's Cancel button interrupts an
	// in-flight bake (see the 'baking' branch of the Cancel button's onClick below).
	const abortControllerRef = useRef<AbortController | null>(null)

	const resultItems = useBakeMapObjectUrls(result?.maps ?? null)
	// See Editor.isHairCardsBakeDirty - true once a card's placement has changed since whatever's
	// shown by previewUrlByKind below was baked, regardless of which maps that bake covered.
	const cardsDirty = useHairCardsBakeDirty(editor)
	// What every "preview" surface below (checkbox card thumbnails, the composed "Preview" card, the
	// viewport's default view) actually shows: whatever's already persisted on the project
	// (Editor.loadProject/setBakedMaps), overlaid with this session's own fresh bake (object URLs, via
	// resultItems) for whichever kinds were actually re-baked - a partial re-bake (e.g. only "color"
	// re-checked) must keep showing the still-persisted "alpha"/"normal"/etc. maps rather than losing
	// them from the preview, mirroring the merge-not-overwrite Editor.setBakedMaps/the bake route
	// already apply to the stored project/DB row.
	const previewBakedMaps: BakedMapsRecord = {
		...editor.project.bakedMaps,
		...Object.fromEntries(
			resultItems.map((item) => [item.kind, { url: item.url, resolution: item.resolution ?? form.resolution }])
		),
	}
	// Looked up per kind to attach a preview thumbnail to that map's own checkbox card below.
	const previewUrlByKind = new Map(bakedMapsToPreviewItems(previewBakedMaps).map((item) => [item.kind, item.url]))
	// The composed "Preview" map (HairCardPreviewMapComposer) - alpha/id/roots/tips blended with the
	// 4 color pickers below, recomposed whenever either changes. Its own status card sits beside
	// those pickers; the same composition also drives the viewport's default view (see
	// HairCardBakePreviewPanel/HairCardBakePreviewRenderer.showPreview).
	const composedPreviewDataUrl = useHairCardPreviewComposedCanvas(previewBakedMaps, previewColors)
	const singleMapPreview: HairCardBakeSingleMapPreview | null =
		previewMapKind && previewUrlByKind.has(previewMapKind)
			? { kind: previewMapKind, url: previewUrlByKind.get(previewMapKind)! }
			: null

	const pending = phase === 'baking' || phase === 'uploading'
	const anyMapSelected =
		form.alpha || form.color || form.normal || form.ao || form.height || form.roots || form.tips || form.id
	const checkedMapCount = MAP_KEYS.filter((key) => form[key]).length
	const allMapsChecked = checkedMapCount === MAP_KEYS.length
	const someMapsChecked = checkedMapCount > 0 && !allMapsChecked
	/**
	 * True for a map kind that's persisted at a resolution other than the one currently selected, and
	 * won't be rebaked this submit to fix that (a checked kind will be rebaked at `form.resolution`
	 * regardless, so it can never end up mismatched). Compared against the persisted record, not
	 * `previewBakedMaps`, since a fresh bake from this session is always at `form.resolution` by
	 * construction.
	 */
	function isResolutionMismatch(kind: BakeMapKind): boolean {
		return !form[kind] && editor.project.bakedMaps[kind] !== undefined && editor.project.bakedMaps[kind]!.resolution !== form.resolution
	}

	/** Resets the dialog's own phase state machine on close - deliberately leaves `form` alone, since the resolution/map selection is now a persisted workspace preference (Project.bakeOptions), not throwaway dialog state. */
	function resetForm(): void {
		setPhase('form')
		setError(null)
		setResult(null)
		setPreviewMapKind(null)
	}

	/** Live-updates one preview color, both this dialog's own display and the persisted project (see Editor.setPreviewColors) - no separate "commit" step, same as the map checkboxes' own project-independent form state needs none. */
	function updatePreviewColor(patch: Partial<HairPreviewColors>): void {
		const next = { ...previewColors, ...patch }
		setPreviewColorsState(next)
		editor.setPreviewColors(next)
	}

	function handleOpenChange(next: boolean): void {
		if (pending) {
			return
		}
		setOpen(next)
		if (!next) {
			resetForm()
		}
	}

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (pending || !anyMapSelected) {
			return
		}

		setError(null)
		setPhase('baking')
		setPreviewMapKind(null)
		setProgress(null)
		// Tracked separately from `phase` state - a `catch` below reads this synchronously, but a
		// `setPhase` call earlier in this same function hasn't been applied to the `phase` variable
		// this closure captured yet.
		let stage: 'baking' | 'uploading' = 'baking'
		const controller = new AbortController()
		abortControllerRef.current = controller
		try {
			const bakeResult = await editor.bakeHairCards(formStateToBakeOptions(form), {
				onProgress: setProgress,
				signal: controller.signal,
			})

			if (projectId) {
				stage = 'uploading'
				setPhase('uploading')
				const uploaded = await uploadClientRef.current.upload(
					projectId,
					bakeResult.maps,
					bakeResult.sceneHash,
					form.resolution
				)
				editor.setBakedMaps(uploaded.maps)
			}

			setResult(bakeResult)
			setPhase('done')
		} catch (caught) {
			if ((caught as { name?: string } | null)?.name === 'AbortError') {
				// Cancelled, not failed - back to a live form (or the still-valid previous result, if
				// this was a rebake) rather than through the scary generic error path below.
				setPhase(result ? 'done' : 'form')
				return
			}
			// The UI message alone rarely has enough context to localize a WebGL/three.js failure -
			// the full error (and its `cause` chain, e.g. HairCardBaker.bake naming which map/algorithm
			// was rendering) always goes to the console too, per the hair skill's error-reporting rule.
			console.error(`HairCardBakeDialog.submit: hair texture bake failed during "${stage}"`, caught)
			setError(
				`Hair texture bake failed during ${stage}: ${caught instanceof Error ? caught.message : String(caught)}`
			)
			setPhase('error')
		} finally {
			setProgress(null)
		}
	}

	async function download(): Promise<void> {
		if (!result) {
			return
		}
		const zip = await zipBuilderRef.current.build(result.maps)
		downloaderRef.current.download(zip, 'hair-textures.zip')
	}

	return (
		<>
			<Button
				data-id="hair-card-bake-open-button"
				type="button"
				variant="outline"
				disabled={disabled}
				className="w-full mt-2"
				onClick={() => setOpen(true)}
			>
				<ImageDown />
				Texture maps
			</Button>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent
					data-id="hair-card-bake-dialog"
					className="h-[720px] max-h-[85vh] w-full max-w-[1200px] sm:max-w-[1200px] flex p-0 overflow-hidden gap-0"
				>
					<form
						data-id="hair-card-bake-form"
						onSubmit={submit}
						className="flex min-w-0 flex-col overflow-hidden w-md shrink"
					>
						<DialogHeader className="p-4">
							<DialogTitle className="text-lg">Texture maps</DialogTitle>
						</DialogHeader>

						<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
							{(phase === 'form' || phase === 'error' || phase === 'done') && (
								<div className="flex flex-col gap-4">
									<div className="flex gap-4">
										<Label htmlFor="hair-card-bake-resolution">Resolution</Label>
										<Select
											value={String(form.resolution)}
											onValueChange={(value) =>
												setForm((f) => ({ ...f, resolution: Number(value) }))
											}
										>
											<SelectTrigger
												id="hair-card-bake-resolution"
												data-id="hair-card-bake-resolution"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{BAKE.RESOLUTIONS.map((resolution) => (
													<SelectItem key={resolution} value={String(resolution)}>
														{resolution}px
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<Field orientation="horizontal">
										<Checkbox
											data-id="hair-card-bake-select-all"
											checked={allMapsChecked}
											indeterminate={someMapsChecked}
											onCheckedChange={(next) =>
												setForm((f) => ({
													...f,
													...Object.fromEntries(MAP_KEYS.map((key) => [key, next === true])),
												}))
											}
										/>
										<FieldLabel>Select all</FieldLabel>
									</Field>

									<HairCardBakeMapCheckboxCard
										id="alpha"
										label="Alpha"
										checked={form.alpha}
										previewUrl={previewUrlByKind.get('alpha')}
										isPreviewing={previewMapKind === 'alpha'}
										onPreviewClick={() =>
											setPreviewMapKind((k) => (k === 'alpha' ? null : 'alpha'))
										}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, alpha: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('alpha')}
									/>
									<HairCardBakeMapCheckboxCard
										id="color"
										label="Color"
										checked={form.color}
										previewUrl={previewUrlByKind.get('color')}
										isPreviewing={previewMapKind === 'color'}
										onPreviewClick={() =>
											setPreviewMapKind((k) => (k === 'color' ? null : 'color'))
										}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, color: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('color')}
									/>
									<HairCardBakeMapCheckboxCard
										id="normal"
										label="Normal"
										checked={form.normal}
										previewUrl={previewUrlByKind.get('normal')}
										isPreviewing={previewMapKind === 'normal'}
										onPreviewClick={() =>
											setPreviewMapKind((k) => (k === 'normal' ? null : 'normal'))
										}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, normal: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('normal')}
									/>
									<HairCardBakeMapCheckboxCard
										id="ao"
										label="Ambient occlusion"
										checked={form.ao}
										previewUrl={previewUrlByKind.get('ao')}
										isPreviewing={previewMapKind === 'ao'}
										onPreviewClick={() => setPreviewMapKind((k) => (k === 'ao' ? null : 'ao'))}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, ao: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('ao')}
									/>
									<HairCardBakeMapCheckboxCard
										id="height"
										label="Height"
										checked={form.height}
										previewUrl={previewUrlByKind.get('height')}
										isPreviewing={previewMapKind === 'height'}
										onPreviewClick={() =>
											setPreviewMapKind((k) => (k === 'height' ? null : 'height'))
										}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, height: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('height')}
									/>
									<HairCardBakeMapCheckboxCard
										id="roots"
										label="Roots"
										checked={form.roots}
										previewUrl={previewUrlByKind.get('roots')}
										isPreviewing={previewMapKind === 'roots'}
										onPreviewClick={() =>
											setPreviewMapKind((k) => (k === 'roots' ? null : 'roots'))
										}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, roots: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('roots')}
									>
										<ScaleSlider
											value={form.rootsScale}
											min={BAKE.ROOTS.MIN_SCALE}
											max={BAKE.ROOTS.MAX_SCALE}
											step={BAKE.ROOTS.SCALE_STEP}
											onChange={(scale) => setForm((f) => ({ ...f, rootsScale: scale }))}
										/>
									</HairCardBakeMapCheckboxCard>
									<HairCardBakeMapCheckboxCard
										id="tips"
										label="Tips"
										checked={form.tips}
										previewUrl={previewUrlByKind.get('tips')}
										isPreviewing={previewMapKind === 'tips'}
										onPreviewClick={() => setPreviewMapKind((k) => (k === 'tips' ? null : 'tips'))}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, tips: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('tips')}
									>
										<ScaleSlider
											value={form.tipsScale}
											min={BAKE.TIPS.MIN_SCALE}
											max={BAKE.TIPS.MAX_SCALE}
											step={BAKE.TIPS.SCALE_STEP}
											onChange={(scale) => setForm((f) => ({ ...f, tipsScale: scale }))}
										/>
									</HairCardBakeMapCheckboxCard>
									<HairCardBakeMapCheckboxCard
										id="id"
										label="ID"
										checked={form.id}
										previewUrl={previewUrlByKind.get('id')}
										isPreviewing={previewMapKind === 'id'}
										onPreviewClick={() => setPreviewMapKind((k) => (k === 'id' ? null : 'id'))}
										onCheckedChange={(checked) => setForm((f) => ({ ...f, id: checked }))}
										stale={cardsDirty}
										resolutionMismatch={isResolutionMismatch('id')}
									>
										<div className="flex items-center gap-3 pl-7">
											<Slider
												value={[form.idGroupCount]}
												min={BAKE.ID.MIN_GROUP_COUNT}
												max={BAKE.ID.MAX_GROUP_COUNT}
												step={1}
												onValueChange={([groupCount]) =>
													setForm((f) => ({ ...f, idGroupCount: groupCount }))
												}
											/>
											<span className="w-10 text-right text-xs text-muted-foreground">
												{form.idGroupCount}
											</span>
										</div>
									</HairCardBakeMapCheckboxCard>
									<div className="flex flex-col gap-2 border-t pt-4">
										<p className="text-sm font-medium">Preview map colors</p>
										<p className="text-xs text-muted-foreground">
											Blended with the id/roots/tips maps above into this dialog&apos;s own
											viewport preview and the groom editor&apos;s Textured/Preview view modes.
										</p>
										<HairCardBakePreviewComposedCard dataUrl={composedPreviewDataUrl} />
										<div className="grid grid-cols-2 gap-x-4 gap-y-2">
											<ColorPickerRow
												id="primary"
												label="Primary"
												value={previewColors.primary}
												onChange={(primary) => updatePreviewColor({ primary })}
											/>
											<ColorPickerRow
												id="secondary"
												label="Secondary"
												value={previewColors.secondary}
												onChange={(secondary) => updatePreviewColor({ secondary })}
											/>
											<ColorPickerRow
												id="tip"
												label="Tip"
												value={previewColors.tip}
												onChange={(tip) => updatePreviewColor({ tip })}
											/>
											<ColorPickerRow
												id="root"
												label="Root"
												value={previewColors.root}
												onChange={(root) => updatePreviewColor({ root })}
											/>
										</div>
									</div>
									{!projectId && (
										<p className="text-xs text-muted-foreground">
											This session isn&apos;t saved to a project yet - baked maps will only be
											available as a download.
										</p>
									)}
								</div>
							)}

							{pending && (
								<div data-id="hair-card-bake-progress" className="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="animate-spin" />
									{phase === 'uploading'
										? 'Storing…'
										: progress
											? `${progress.label}… (${progress.index} of ${progress.total})`
											: 'Baking…'}
								</div>
							)}

							{phase === 'done' && result && (
								<div data-id="hair-card-bake-result" className="flex flex-col gap-2">
									<p className="text-sm text-muted-foreground">
										Last bake: {result.maps.length} map{result.maps.length === 1 ? '' : 's'} from{' '}
										{result.cardCount} card
										{result.cardCount === 1 ? '' : 's'}
										{projectId ? ' and stored them in the project.' : '.'}
									</p>
									<HairCardBakeMapGrid items={resultItems} />
								</div>
							)}

						</div>

						{/* Outside the scrollable area above - a long map list otherwise buries this below the
						fold, so a real bake failure could sit unseen unless the user happened to scroll down. */}
						{error && (
							<p data-id="hair-card-bake-error" className="border-t px-4 py-3 text-xs text-destructive">
								{error}
							</p>
						)}

						<DialogFooter className="p-6">
							{phase === 'done' ? (
								<>
									<Button type="button" variant="outline" onClick={() => setOpen(false)}>
										Close
									</Button>
									<Button
										data-id="hair-card-bake-download-button"
										type="button"
										variant="ghost"
										onClick={() => void download()}
									>
										<Download />
										Download
									</Button>
									<Button
										data-id="hair-card-rebake-submit-button"
										type="submit"
										disabled={!anyMapSelected}
									>
										Rebake selected maps
									</Button>
								</>
							) : (
								<>
									<Button
										type="button"
										variant="outline"
										disabled={phase === 'uploading'}
										onClick={() => {
											if (phase === 'baking') {
												// Interrupts editor.bakeHairCards mid-flight (see the AbortError branch
												// in submit's catch) instead of closing the dialog. 'uploading' has no
												// cancellation wired up - aborting a partially-written storage/DB
												// upload has its own semantics this doesn't attempt - so that phase
												// disables this button above instead of reaching this branch.
												abortControllerRef.current?.abort()
											} else {
												setOpen(false)
											}
										}}
									>
										Cancel
									</Button>
									<Button
										data-id="hair-card-bake-submit-button"
										type="submit"
										disabled={pending || !anyMapSelected}
									>
										{pending && <Loader2 className="animate-spin" />}
										{phase === 'baking'
											? 'Baking…'
											: phase === 'uploading'
												? 'Storing…'
												: phase === 'error'
													? 'Retry'
													: 'Bake'}
									</Button>
								</>
							)}
						</DialogFooter>
					</form>
					<div data-id="hair-card-bake-preview" className="min-w-0 border-l flex-1">
						<HairCardBakePreviewPanel
							theme={editor.controller.getTheme()}
							bakedMaps={previewBakedMaps}
							colors={previewColors}
							singleMapPreview={singleMapPreview}
							onExitSingleMapPreview={() => setPreviewMapKind(null)}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

interface ColorPickerRowProps {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
}

/** One HairPreviewColors field - a native color input (no shadcn equivalent exists) plus its label. */
function ColorPickerRow({ id, label, value, onChange }: ColorPickerRowProps) {
	const inputId = `hair-card-bake-preview-color-${id}`
	return (
		<div className="flex items-center gap-2">
			<input
				id={inputId}
				data-id={inputId}
				type="color"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="size-7 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent p-0.5"
			/>
			<Label htmlFor={inputId}>{label}</Label>
		</div>
	)
}

interface ScaleSliderProps {
	value: number
	min: number
	max: number
	step: number
	onChange: (value: number) => void
}

function ScaleSlider({ value, min, max, step, onChange }: ScaleSliderProps) {
	return (
		<div className="flex items-center gap-3 pl-7">
			<Slider value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} />
			<span className="w-10 text-right text-xs text-muted-foreground">{Math.round((value / max) * 100)}%</span>
		</div>
	)
}
