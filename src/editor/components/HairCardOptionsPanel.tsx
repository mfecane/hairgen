'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { HairCardModifierStackPanel } from '@/editor/components/HairCardModifierStackPanel'
import { useReactBridge } from '@/editor/hooks/useReactBridge'
import { Editor } from '@/editor/main/Editor'
import { HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { Trash, X } from 'lucide-react'
import { useRef, useState } from 'react'

interface HairCardOptionsPanelProps {
	editor: Editor
}

interface HairCardOptionsFieldsProps {
	editor: Editor
	cardId: string
	name: string
	initialRootSpread: number
	initialCoverage: number
	initialHeightVariance: number
	initialCutVariance: number
	initialModifiers: HairCardModifier[]
}

/**
 * Floating inspector shown while exactly one hair card is selected - its strand settings (see
 * SceneObjectData.rootSpread/coverage/heightVariance/cutVariance, HairCardStrandsGenerator). Keyed by the
 * card's id in the parent below so switching the selection remounts it with a fresh initial value
 * instead of dragging along the previous card's in-progress slider state. Anchored left (rather
 * than right) so it sits right beside HairCardsPanel's docked sidebar instead of floating on the
 * opposite side of the viewport from the card list it's contextual to.
 */
export function HairCardOptionsPanel({ editor }: HairCardOptionsPanelProps) {
	const { selectedObjectId, selectedObjectIds } = useReactBridge()
	if (selectedObjectIds.size !== 1 || !selectedObjectId) {
		return null
	}
	const card = editor.project.scene.get(selectedObjectId)
	if (!card || card.type !== 'hairCard') {
		return null
	}
	// Same numbering as HairCardsPanel's list, so a card's name matches its row there.
	const hairCards = editor.project.scene.getItems().filter((object) => object.type === 'hairCard')
	const index = hairCards.findIndex((hairCard) => hairCard.id === card.id)

	return (
		<HairCardOptionsFields
			key={card.id}
			editor={editor}
			cardId={card.id}
			name={`Hair card ${index + 1}`}
			initialRootSpread={card.rootSpread}
			initialCoverage={card.coverage}
			initialHeightVariance={card.heightVariance}
			initialCutVariance={card.cutVariance}
			initialModifiers={card.modifiers}
		/>
	)
}

function HairCardOptionsFields({
	editor,
	cardId,
	name,
	initialRootSpread,
	initialCoverage,
	initialHeightVariance,
	initialCutVariance,
	initialModifiers,
}: HairCardOptionsFieldsProps) {
	const [rootSpread, setRootSpread] = useState(initialRootSpread)
	const [coverage, setCoverage] = useState(initialCoverage)
	const [heightVariance, setHeightVariance] = useState(initialHeightVariance)
	const [cutVariance, setCutVariance] = useState(initialCutVariance)
	// The settings snapshot at the start of the current drag - captured once per commit rather than
	// re-read from the (already-live-mutated) SceneObject, so history gets the value the drag
	// actually started from.
	const before = useRef({
		rootSpread: initialRootSpread,
		coverage: initialCoverage,
		heightVariance: initialHeightVariance,
		cutVariance: initialCutVariance,
	})

	function handleRootSpreadChange([percent]: number[]): void {
		const next = percent / 100
		setRootSpread(next)
		editor.setHairCardStrandSettings(cardId, { rootSpread: next, coverage, heightVariance, cutVariance })
	}

	function handleRootSpreadCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardStrandSettings(cardId, before.current, {
			rootSpread: next,
			coverage,
			heightVariance,
			cutVariance,
		})
		before.current = { rootSpread: next, coverage, heightVariance, cutVariance }
	}

	function handleCoverageChange([count]: number[]): void {
		setCoverage(count)
		editor.setHairCardStrandSettings(cardId, { rootSpread, coverage: count, heightVariance, cutVariance })
	}

	function handleCoverageCommit([count]: number[]): void {
		editor.commitHairCardStrandSettings(cardId, before.current, {
			rootSpread,
			coverage: count,
			heightVariance,
			cutVariance,
		})
		before.current = { rootSpread, coverage: count, heightVariance, cutVariance }
	}

	function handleHeightVarianceChange([percent]: number[]): void {
		const next = percent / 100
		setHeightVariance(next)
		editor.setHairCardStrandSettings(cardId, { rootSpread, coverage, heightVariance: next, cutVariance })
	}

	function handleHeightVarianceCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardStrandSettings(cardId, before.current, {
			rootSpread,
			coverage,
			heightVariance: next,
			cutVariance,
		})
		before.current = { rootSpread, coverage, heightVariance: next, cutVariance }
	}

	function handleCutVarianceChange([percent]: number[]): void {
		const next = percent / 100
		setCutVariance(next)
		editor.setHairCardStrandSettings(cardId, { rootSpread, coverage, heightVariance, cutVariance: next })
	}

	function handleCutVarianceCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardStrandSettings(cardId, before.current, {
			rootSpread,
			coverage,
			heightVariance,
			cutVariance: next,
		})
		before.current = { rootSpread, coverage, heightVariance, cutVariance: next }
	}

	return (
		<div
			data-id="hair-card-options-panel"
			className="relative h-full flex flex-col w-64 gap-4 p-4 shadow-md pointer-events-auto bg-background border-r border-border animate-in slide-in-from-left duration-300"
		>
			<Button
				data-id="hair-card-options-deselect"
				variant="secondary"
				size="icon-sm"
				aria-label="Deselect"
				onClick={() => editor.selectObject(null, false)}
				className="absolute top-2 right-2"
			>
				<X className="size-4" />
			</Button>

			<h2 data-id="hair-card-options-name">{name}</h2>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="hair-card-root-spread">Root spread</Label>
					<span className="text-xs text-muted-foreground">{Math.round(rootSpread * 100)}%</span>
				</div>
				<Slider
					data-id="hair-card-root-spread"
					id="hair-card-root-spread"
					min={HAIR_CARD.MIN_ROOT_SPREAD * 100}
					max={HAIR_CARD.MAX_ROOT_SPREAD * 100}
					step={HAIR_CARD.ROOT_SPREAD_STEP * 100}
					value={[rootSpread * 100]}
					onValueChange={handleRootSpreadChange}
					onValueCommit={handleRootSpreadCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="hair-card-coverage">Coverage</Label>
					<span className="text-xs text-muted-foreground">{coverage}</span>
				</div>
				<Slider
					data-id="hair-card-coverage"
					id="hair-card-coverage"
					min={HAIR_CARD.MIN_COVERAGE}
					max={HAIR_CARD.MAX_COVERAGE}
					step={1}
					value={[coverage]}
					onValueChange={handleCoverageChange}
					onValueCommit={handleCoverageCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="hair-card-height-variance">Height variance</Label>
					<span className="text-xs text-muted-foreground">{Math.round(heightVariance * 100)}%</span>
				</div>
				<Slider
					data-id="hair-card-height-variance"
					id="hair-card-height-variance"
					min={HAIR_CARD.MIN_HEIGHT_VARIANCE * 100}
					max={HAIR_CARD.MAX_HEIGHT_VARIANCE * 100}
					step={HAIR_CARD.HEIGHT_VARIANCE_STEP * 100}
					value={[heightVariance * 100]}
					onValueChange={handleHeightVarianceChange}
					onValueCommit={handleHeightVarianceCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor="hair-card-cut-variance">Cut variance</Label>
					<span className="text-xs text-muted-foreground">{Math.round(cutVariance * 100)}%</span>
				</div>
				<Slider
					data-id="hair-card-cut-variance"
					id="hair-card-cut-variance"
					min={HAIR_CARD.MIN_CUT_VARIANCE * 100}
					max={HAIR_CARD.MAX_CUT_VARIANCE * 100}
					step={HAIR_CARD.CUT_VARIANCE_STEP * 100}
					value={[cutVariance * 100]}
					onValueChange={handleCutVarianceChange}
					onValueCommit={handleCutVarianceCommit}
				/>
			</div>
			<HairCardModifierStackPanel editor={editor} cardId={cardId} initialModifiers={initialModifiers} />
			<Button
				data-id="hair-card-options-delete"
				variant="destructive"
				className="mt-4"
				onClick={() => editor.deleteSelected()}
			>
				<Trash className="size-4" />
				Delete
			</Button>
		</div>
	)
}
