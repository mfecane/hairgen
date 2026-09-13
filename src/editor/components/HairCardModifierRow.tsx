'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { HairCardModifierParamsFields } from '@/editor/components/HairCardModifierParamsFields'
import { Editor } from '@/editor/main/Editor'
import { HAIR_CARD_MODIFIER_LABELS, HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Trash } from 'lucide-react'
import { useRef, useState } from 'react'

interface HairCardModifierRowProps {
	editor: Editor
	cardId: string
	modifier: HairCardModifier
	onRemove: (modifierId: string) => void
}

/** One row of a hair card's modifier stack - drag handle, enabled switch, type label, delete, and its own expandable params. */
export function HairCardModifierRow({ editor, cardId, modifier, onRemove }: HairCardModifierRowProps) {
	const [expanded, setExpanded] = useState(true)
	const [enabled, setEnabled] = useState(modifier.enabled)
	const before = useRef(modifier)
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: modifier.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}

	function handleEnabledChange(next: boolean): void {
		setEnabled(next)
		const after = { ...before.current, enabled: next }
		editor.commitHairCardModifier(cardId, before.current, after)
		before.current = after
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			data-id="hair-card-modifier-row"
			className="flex flex-col gap-2 rounded-md border border-border p-2"
		>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="cursor-grab text-muted-foreground touch-none"
					aria-label="Reorder modifier"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
				<Button variant="ghost" size="icon" className="size-6" onClick={() => setExpanded(!expanded)}>
					{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
				</Button>
				<Label className="flex-1">{HAIR_CARD_MODIFIER_LABELS[modifier.type]}</Label>
				<Switch checked={enabled} onCheckedChange={handleEnabledChange} />
				<Button variant="ghost" size="icon" className="size-6" onClick={() => onRemove(modifier.id)}>
					<Trash className="size-4" />
				</Button>
			</div>
			{expanded && <HairCardModifierParamsFields editor={editor} cardId={cardId} modifier={modifier} />}
		</div>
	)
}
