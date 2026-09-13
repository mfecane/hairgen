'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { GROOM } from '@/constants'
import { useGroomReactBridge } from '@/editor/groom/hooks/useGroomReactBridge'
import { SplineOptionsSnapshot } from '@/editor/groom/main/commands/GroomCommands'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { useRef, useState } from 'react'

interface SplineSmoothModifyPanelProps {
	editor: GroomEditor
}

interface SplineSmoothModifyFieldsProps {
	editor: GroomEditor
	splineId: string
	initialEnabled: boolean
	initialInfluence: number
}

/** Compact spline-level soft-selection controls shown directly below GroomToolbar. */
export function SplineSmoothModifyPanel({ editor }: SplineSmoothModifyPanelProps) {
	const { selectedObjectId, selectedObjectIds } = useGroomReactBridge()
	if (selectedObjectIds.size !== 1 || !selectedObjectId) {
		return null
	}
	const spline = editor.project.scene.get(selectedObjectId)
	if (!spline) {
		return null
	}

	return (
		<SplineSmoothModifyFields
			key={spline.id}
			editor={editor}
			splineId={spline.id}
			initialEnabled={spline.smoothModifyEnabled}
			initialInfluence={spline.influence}
		/>
	)
}

function SplineSmoothModifyFields({
	editor,
	splineId,
	initialEnabled,
	initialInfluence,
}: SplineSmoothModifyFieldsProps) {
	const [enabled, setEnabled] = useState(initialEnabled)
	const [influence, setInfluence] = useState(initialInfluence)
	const influenceBefore = useRef(initialInfluence)

	function createSnapshot(smoothModifyEnabled: boolean, nextInfluence: number): SplineOptionsSnapshot {
		const spline = editor.project.scene.get(splineId)
		if (!spline) {
			throw new Error(`SplineSmoothModifyPanel: no spline "${splineId}" exists`)
		}
		return {
			hairCardId: spline.hairCardId,
			resolution: spline.resolution,
			cardWidth: spline.cardWidth,
			cardStartOffset: spline.cardStartOffset,
			smoothModifyEnabled,
			influence: nextInfluence,
		}
	}

	function handleEnabledChange(checked: boolean): void {
		const before = createSnapshot(enabled, influence)
		setEnabled(checked)
		editor.commitSplineOptions(splineId, before, createSnapshot(checked, influence))
	}

	function handleInfluenceChange([next]: number[]): void {
		setInfluence(next)
		editor.setSplineOptions(splineId, createSnapshot(enabled, next))
	}

	function handleInfluenceCommit([next]: number[]): void {
		const before = createSnapshot(enabled, influenceBefore.current)
		setInfluence(next)
		editor.commitSplineOptions(splineId, before, createSnapshot(enabled, next))
		influenceBefore.current = next
	}

	return (
		<div
			data-id="spline-smooth-modify-panel"
			className="w-56 space-y-3 rounded-md border border-border bg-background/95 p-3 shadow-sm pointer-events-auto"
		>
			<div className="flex items-center justify-between gap-4">
				<Label htmlFor="spline-smooth-modify">Soft selection</Label>
				<Switch
					data-id="spline-smooth-modify"
					id="spline-smooth-modify"
					checked={enabled}
					onCheckedChange={handleEnabledChange}
				/>
			</div>
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="spline-influence">Influence</Label>
					<span className="text-xs tabular-nums text-muted-foreground">{influence.toFixed(2)}</span>
				</div>
				<Slider
					data-id="spline-influence"
					id="spline-influence"
					disabled={!enabled}
					min={GROOM.SPLINE.SMOOTH_MODIFY.MIN_INFLUENCE}
					max={GROOM.SPLINE.SMOOTH_MODIFY.MAX_INFLUENCE}
					step={0.01}
					value={[influence]}
					onValueChange={handleInfluenceChange}
					onValueCommit={handleInfluenceCommit}
				/>
			</div>
		</div>
	)
}
