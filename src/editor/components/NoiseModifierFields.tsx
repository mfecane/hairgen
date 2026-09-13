'use client'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { Editor } from '@/editor/main/Editor'
import { HairCardModifier, NoiseModifierParams } from '@/lib/hair/modifiers/HairCardModifier'
import { useRef, useState } from 'react'

interface NoiseModifierFieldsProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier & { type: 'noise' }
}

/** Noise modifier's own params - amount and scale, mounted fresh per modifier id (see HairCardModifierRow). */
export function NoiseModifierFields({ editor, cardId, modifier }: NoiseModifierFieldsProps) {
	const [amount, setAmount] = useState(modifier.params.amount)
	const [scale, setScale] = useState(modifier.params.scale)
	const before = useRef(modifier.params)

	function toModifier(params: NoiseModifierParams): HairCardModifier {
		return { ...modifier, params }
	}

	function handleAmountChange([percent]: number[]): void {
		const next = percent / 100
		setAmount(next)
		editor.setHairCardModifier(cardId, toModifier({ amount: next, scale }))
	}

	function handleAmountCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(cardId, toModifier(before.current), toModifier({ amount: next, scale }))
		before.current = { amount: next, scale }
	}

	function handleScaleChange([percent]: number[]): void {
		const next = percent / 100
		setScale(next)
		editor.setHairCardModifier(cardId, toModifier({ amount, scale: next }))
	}

	function handleScaleCommit([percent]: number[]): void {
		const next = percent / 100
		editor.commitHairCardModifier(cardId, toModifier(before.current), toModifier({ amount, scale: next }))
		before.current = { amount, scale: next }
	}

	return (
		<div data-id="noise-modifier-fields" className="flex flex-col gap-2">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-noise-amount-${modifier.id}`}>Amount</Label>
					<span className="text-xs text-muted-foreground">{Math.round(amount * 100)}%</span>
				</div>
				<Slider
					id={`modifier-noise-amount-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.NOISE.MIN_AMOUNT * 100}
					max={HAIR_CARD.MODIFIERS.NOISE.MAX_AMOUNT * 100}
					step={HAIR_CARD.MODIFIERS.NOISE.AMOUNT_STEP * 100}
					value={[amount * 100]}
					onValueChange={handleAmountChange}
					onValueCommit={handleAmountCommit}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label htmlFor={`modifier-noise-scale-${modifier.id}`}>Scale</Label>
					<span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
				</div>
				<Slider
					id={`modifier-noise-scale-${modifier.id}`}
					min={HAIR_CARD.MODIFIERS.NOISE.MIN_SCALE * 100}
					max={HAIR_CARD.MODIFIERS.NOISE.MAX_SCALE * 100}
					step={HAIR_CARD.MODIFIERS.NOISE.SCALE_STEP * 100}
					value={[scale * 100]}
					onValueChange={handleScaleChange}
					onValueCommit={handleScaleCommit}
				/>
			</div>
		</div>
	)
}
