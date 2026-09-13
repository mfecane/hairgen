'use client'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { HairCardModifierRow } from '@/editor/components/HairCardModifierRow'
import { Editor } from '@/editor/main/Editor'
import { HAIR_CARD_MODIFIER_LABELS, HAIR_CARD_MODIFIER_TYPES, HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { closestCenter, DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useState } from 'react'

interface HairCardModifierStackPanelProps {
	editor: Editor
	cardId: string
	initialModifiers: HairCardModifier[]
}

/**
 * The selected hair card's modifier stack - add/remove/toggle/reorder. Rendered inside
 * HairCardOptionsPanel, keyed by card id there, so this remounts (and re-seeds its local list from
 * the card's persisted modifiers) whenever the selection changes - same reasoning as
 * HairCardOptionsFields. Reordering is real drag-and-drop (@dnd-kit) rather than up/down buttons.
 */
export function HairCardModifierStackPanel({ editor, cardId, initialModifiers }: HairCardModifierStackPanelProps) {
	const [modifiers, setModifiers] = useState(initialModifiers)
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

	function handleAdd(type: (typeof HAIR_CARD_MODIFIER_TYPES)[number]): void {
		editor.addHairCardModifier(cardId, type)
		const card = editor.project.scene.get(cardId)
		if (card) {
			setModifiers(card.modifiers)
		}
	}

	function handleRemove(modifierId: string): void {
		editor.removeHairCardModifier(cardId, modifierId)
		setModifiers((current) => current.filter((modifier) => modifier.id !== modifierId))
	}

	function handleDragEnd({ active, over }: DragEndEvent): void {
		if (!over || active.id === over.id) {
			return
		}
		const oldIndex = modifiers.findIndex((modifier) => modifier.id === active.id)
		const newIndex = modifiers.findIndex((modifier) => modifier.id === over.id)
		const reordered = arrayMove(modifiers, oldIndex, newIndex)
		setModifiers(reordered)
		editor.reorderHairCardModifiers(
			cardId,
			modifiers.map((modifier) => modifier.id),
			reordered.map((modifier) => modifier.id)
		)
	}

	return (
		<div data-id="hair-card-modifier-stack-panel" className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<Label>Modifiers</Label>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button variant="ghost" size="icon" className="size-6" aria-label="Add modifier">
								<Plus className="size-4" />
							</Button>
						}
					/>
					<DropdownMenuContent>
						{HAIR_CARD_MODIFIER_TYPES.map((type) => (
							<DropdownMenuItem key={type} onClick={() => handleAdd(type)}>
								{HAIR_CARD_MODIFIER_LABELS[type]}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={modifiers.map((modifier) => modifier.id)} strategy={verticalListSortingStrategy}>
					<div className="flex flex-col gap-2">
						{modifiers.map((modifier) => (
							<HairCardModifierRow
								key={modifier.id}
								editor={editor}
								cardId={cardId}
								modifier={modifier}
								onRemove={handleRemove}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>
		</div>
	)
}
