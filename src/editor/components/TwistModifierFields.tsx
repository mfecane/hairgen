'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { Editor } from '@/editor/main/Editor'
import { HairCardModifier, TwistModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { useRef, useState } from 'react'

interface TwistModifierFieldsProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier & { type: 'twist' }
}

/** Twist modifier's own params - one slider, mounted fresh per modifier id (see HairCardModifierRow). */
export function TwistModifierFields({ editor, cardId, modifier }: TwistModifierFieldsProps) {
	const [amount, setAmount] = useState(modifier.params.amount)
	const before = useRef(modifier.params)

	function toModifier(params: TwistModifierParams): HairCardModifier {
		return { ...modifier, params }
	}

	function handleAmountChange([percent]: number[]): void {
		const next = percent / 100
		setAmount(next)
		editor.setHairCardModifier(cardId, toModifier({ amount: next }))
	}

	function handleAmountCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(cardId, toModifier(before.current), toModifier({ amount: next }))
		before.current = { amount: next }
	}

	return (
		<div data-id="twist-modifier-fields" className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<Label htmlFor={`modifier-twist-amount-${modifier.id}`}>Amount</Label>
				<span className="text-xs text-muted-foreground">{Math.round(amount * 100)}%</span>
			</div>
			<Slider
				id={`modifier-twist-amount-${modifier.id}`}
				min={HAIR_CARD.MODIFIERS.TWIST.MIN_AMOUNT * 100}
				max={HAIR_CARD.MODIFIERS.TWIST.MAX_AMOUNT * 100}
				step={HAIR_CARD.MODIFIERS.TWIST.AMOUNT_STEP * 100}
				value={[amount * 100]}
				onValueChange={handleAmountChange}
				onValueCommit={handleAmountCommit}
			/>
		</div>
	)
}
