'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { Editor } from '@/editor/main/Editor'
import { BraidModifierParams, HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { useRef, useState } from 'react'

interface BraidModifierFieldsProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier & { type: 'braid' }
}

/** Braid modifier's own params - group size, strength, period - mounted fresh per modifier id (see HairCardModifierRow). */
export function BraidModifierFields({ editor, cardId, modifier }: BraidModifierFieldsProps) {
	const [groupSize, setGroupSize] = useState(modifier.params.groupSize)
	const [strength, setStrength] = useState(modifier.params.strength)
	const [period, setPeriod] = useState(modifier.params.period)
	const before = useRef(modifier.params)

	function toModifier(params: BraidModifierParams): HairCardModifier {
		return { ...modifier, params }
	}

	function handleGroupSizeChange([count]: number[]): void {
		setGroupSize(count)
		editor.setHairCardModifier(cardId, toModifier({ groupSize: count, strength, period }))
	}

	function handleGroupSizeCommit([count]: number[]): void {
		editor.commitHairCardModifier(cardId, toModifier(before.current), toModifier({ groupSize: count, strength, period }))
		before.current = { groupSize: count, strength, period }
	}

	function handleStrengthChange([percent]: number[]): void {
		const next = percent / 100
		setStrength(next)
		editor.setHairCardModifier(cardId, toModifier({ groupSize, strength: next, period }))
	}

	function handleStrengthCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(
			cardId,
			toModifier(before.current),
			toModifier({ groupSize, strength: next, period })
		)
		before.current = { groupSize, strength: next, period }
	}

	function handlePeriodChange([count]: number[]): void {
		setPeriod(count)
		editor.setHairCardModifier(cardId, toModifier({ groupSize, strength, period: count }))
	}

	function handlePeriodCommit([count]: number[]): void {
		editor.commitHairCardModifier(cardId, toModifier(before.current), toModifier({ groupSize, strength, period: count }))
		before.current = { groupSize, strength, period: count }
	}

	return (
		<div data-id="braid-modifier-fields" className="flex flex-col gap-2">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-braid-group-size-${modifier.id}`}>Group size</Label>
					<span className="text-xs text-muted-foreground">{groupSize}</span>
				</div>
				<Slider
					id={`modifier-braid-group-size-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.BRAID.MIN_GROUP_SIZE}
					max={HAIR_CARD.MODIFIERS.BRAID.MAX_GROUP_SIZE}
					step={1}
					value={[groupSize]}
					onValueChange={handleGroupSizeChange}
					onValueCommit={handleGroupSizeCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-braid-strength-${modifier.id}`}>Strength</Label>
					<span className="text-xs text-muted-foreground">{Math.round(strength * 100)}%</span>
				</div>
				<Slider
					id={`modifier-braid-strength-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.BRAID.MIN_STRENGTH * 100}
					max={HAIR_CARD.MODIFIERS.BRAID.MAX_STRENGTH * 100}
					step={HAIR_CARD.MODIFIERS.BRAID.STRENGTH_STEP * 100}
					value={[strength * 100]}
					onValueChange={handleStrengthChange}
					onValueCommit={handleStrengthCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-braid-period-${modifier.id}`}>Period</Label>
					<span className="text-xs text-muted-foreground">{period}</span>
				</div>
				<Slider
					id={`modifier-braid-period-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.BRAID.MIN_PERIOD}
					max={HAIR_CARD.MODIFIERS.BRAID.MAX_PERIOD}
					step={HAIR_CARD.MODIFIERS.BRAID.PERIOD_STEP}
					value={[period]}
					onValueChange={handlePeriodChange}
					onValueCommit={handlePeriodCommit}
				/>
			</div>
		</div>
	)
}
