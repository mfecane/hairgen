'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { Editor } from '@/editor/main/Editor'
import { ClumpModifierParams, HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { useRef, useState } from 'react'

interface ClumpModifierFieldsProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier & { type: 'clump' }
}

/** Clump modifier's own params - region count, strength, stray fraction - mounted fresh per modifier id (see HairCardModifierRow). */
export function ClumpModifierFields({ editor, cardId, modifier }: ClumpModifierFieldsProps) {
	const [regionCount, setRegionCount] = useState(modifier.params.regionCount)
	const [strength, setStrength] = useState(modifier.params.strength)
	const [strayFraction, setStrayFraction] = useState(modifier.params.strayFraction)
	const before = useRef(modifier.params)

	function toModifier(params: ClumpModifierParams): HairCardModifier {
		return { ...modifier, params }
	}

	function handleRegionCountChange([count]: number[]): void {
		setRegionCount(count)
		editor.setHairCardModifier(cardId, toModifier({ regionCount: count, strength, strayFraction }))
	}

	function handleRegionCountCommit([count]: number[]): void {
		editor.commitHairCardModifier(
			cardId,
			toModifier(before.current),
			toModifier({ regionCount: count, strength, strayFraction })
		)
		before.current = { regionCount: count, strength, strayFraction }
	}

	function handleStrengthChange([percent]: number[]): void {
		const next = percent / 100
		setStrength(next)
		editor.setHairCardModifier(cardId, toModifier({ regionCount, strength: next, strayFraction }))
	}

	function handleStrengthCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(
			cardId,
			toModifier(before.current),
			toModifier({ regionCount, strength: next, strayFraction })
		)
		before.current = { regionCount, strength: next, strayFraction }
	}

	function handleStrayFractionChange([percent]: number[]): void {
		const next = percent / 100
		setStrayFraction(next)
		editor.setHairCardModifier(cardId, toModifier({ regionCount, strength, strayFraction: next }))
	}

	function handleStrayFractionCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(
			cardId,
			toModifier(before.current),
			toModifier({ regionCount, strength, strayFraction: next })
		)
		before.current = { regionCount, strength, strayFraction: next }
	}

	return (
		<div data-id="clump-modifier-fields" className="flex flex-col gap-2">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-clump-region-count-${modifier.id}`}>Regions</Label>
					<span className="text-xs text-muted-foreground">{regionCount}</span>
				</div>
				<Slider
					id={`modifier-clump-region-count-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.CLUMP.MIN_REGION_COUNT}
					max={HAIR_CARD.MODIFIERS.CLUMP.MAX_REGION_COUNT}
					step={1}
					value={[regionCount]}
					onValueChange={handleRegionCountChange}
					onValueCommit={handleRegionCountCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-clump-strength-${modifier.id}`}>Strength</Label>
					<span className="text-xs text-muted-foreground">{Math.round(strength * 100)}%</span>
				</div>
				<Slider
					id={`modifier-clump-strength-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.CLUMP.MIN_STRENGTH * 100}
					max={HAIR_CARD.MODIFIERS.CLUMP.MAX_STRENGTH * 100}
					step={HAIR_CARD.MODIFIERS.CLUMP.STRENGTH_STEP * 100}
					value={[strength * 100]}
					onValueChange={handleStrengthChange}
					onValueCommit={handleStrengthCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-clump-stray-fraction-${modifier.id}`}>Strays</Label>
					<span className="text-xs text-muted-foreground">{Math.round(strayFraction * 100)}%</span>
				</div>
				<Slider
					id={`modifier-clump-stray-fraction-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.CLUMP.MIN_STRAY_FRACTION * 100}
					max={HAIR_CARD.MODIFIERS.CLUMP.MAX_STRAY_FRACTION * 100}
					step={HAIR_CARD.MODIFIERS.CLUMP.STRAY_FRACTION_STEP * 100}
					value={[strayFraction * 100]}
					onValueChange={handleStrayFractionChange}
					onValueCommit={handleStrayFractionCommit}
				/>
			</div>
		</div>
	)
}
