'use client'

import { BraidModifierFields } from '@/editor/components/BraidModifierFields'
import { ClumpModifierFields } from '@/editor/components/ClumpModifierFields'
import { NoiseModifierFields } from '@/editor/components/NoiseModifierFields'
import { TwistModifierFields } from '@/editor/components/TwistModifierFields'
import { Editor } from '@/editor/main/Editor'
import { HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'

interface HairCardModifierParamsFieldsProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier
}

/** Dispatches to the right modifier type's own param sliders - see HairCardModifierRow. */
export function HairCardModifierParamsFields({ editor, cardId, modifier }: HairCardModifierParamsFieldsProps) {
	switch (modifier.type) {
		case 'twist':
			return <TwistModifierFields editor={editor} cardId={cardId} modifier={modifier} />
		case 'noise':
			return <NoiseModifierFields editor={editor} cardId={cardId} modifier={modifier} />
		case 'clump':
			return <ClumpModifierFields editor={editor} cardId={cardId} modifier={modifier} />
		case 'braid':
			return <BraidModifierFields editor={editor} cardId={cardId} modifier={modifier} />
	}
}
