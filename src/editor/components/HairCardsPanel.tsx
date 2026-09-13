'use client'

import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { HAIR_CARD } from '@/constants'
import { HairCardBakeDialog } from '@/editor/components/HairCardBakeDialog'
import { useGlobalThickness } from '@/editor/hooks/useGlobalThickness'
import { useReactBridge } from '@/editor/hooks/useReactBridge'
import { useSceneObjectIds } from '@/editor/hooks/useSceneObjectIds'
import { Editor } from '@/editor/main/Editor'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, PlusCircle, RectangleVertical, SquareStack } from 'lucide-react'

interface HairCardsPanelProps {
	editor: Editor
	projectId?: string
}

/**
 * Docked left sidebar (shadcn Sidebar - see SidebarProvider/SidebarInset in Editor.tsx) listing
 * every hair card in the scene. Selecting a row selects that card the same way clicking it in the
 * viewport would (same ReactBridge selection state), which shows its gizmo and enables the
 * Translate/Rotate/Scale tools and Toolbar's delete action on it - see docs/editor/hair-cards-plan.md
 * for the card options panel and dedicated rectangle gizmo planned on top of this.
 */
export function HairCardsPanel({ editor, projectId }: HairCardsPanelProps) {
	useSceneObjectIds(editor)
	const { hiddenIdentifiers } = useReactBridge()
	const hairCards = editor.project.scene.getItems().filter((object) => object.type === 'hairCard')
	// Not part of useReactBridge's state - project.thickness is a workspace preference, not scene
	// data (see Project.thickness) - so it needs its own subscription to stay in sync with loads.
	const thickness = useGlobalThickness(editor)

	function handleThicknessChange([value]: number[]): void {
		editor.setGlobalThickness(value)
	}

	function toggleVisibility(cardId: string): void {
		editor.reactBridge.setHidden(cardId, !hiddenIdentifiers.has(cardId))
	}

	return (
		<div
			data-id="hair-cards-panel"
			className={cn(
				'relative z-15 h-full w-64 space-y-2 border-r border-border',
				'bg-background p-4 shadow-md pointer-events-auto'
			)}
		>
			<div className="space-y-2 mb-4">
				<div className="flex items-center justify-between">
					<Label htmlFor="global-thickness">Thickness</Label>
					<span className="text-xs text-muted-foreground">{thickness.toFixed(3)}</span>
				</div>
				<Slider
					data-id="global-thickness"
					id="global-thickness"
					min={HAIR_CARD.STRAND.MIN_THICKNESS}
					max={HAIR_CARD.STRAND.MAX_THICKNESS}
					step={HAIR_CARD.STRAND.THICKNESS_STEP}
					value={[thickness]}
					onValueChange={handleThicknessChange}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex justify-between items-center pl-1">
					<h2 className="flex justify-between items-center gap-2">
						<SquareStack className="size-4" />
						Hair cards
					</h2>
					<Button
						data-id="add-hair-card"
						variant="ghost"
						size="icon-sm"
						aria-label="Add hair card"
						onClick={() => editor.addHairCard()}
					>
						<PlusCircle className="size-4" />
					</Button>
				</div>
				{hairCards.length === 0 ? (
					<p className="px-2 py-1 text-xs text-muted-foreground">No hair cards yet</p>
				) : (
					<ItemGroup className="gap-2">
						{hairCards.map((card, index) => {
							const hidden = hiddenIdentifiers.has(card.id)
							return (
								<Item
									variant="muted"
									key={card.id}
									onClick={(event) => editor.selectObject(card.id, event.shiftKey)}
									className="p-2 py-1"
								>
									<ItemMedia variant="icon">
										<RectangleVertical className="size-4" />
									</ItemMedia>
									<ItemContent>
										<ItemTitle>Hair card {index + 1}</ItemTitle>
									</ItemContent>
									<ItemActions>
										<Button
											data-id={`hair-card-visibility-${card.id}`}
											variant="ghost"
											size="icon-sm"
											aria-label={hidden ? 'Show hair card' : 'Hide hair card'}
											onClick={() => toggleVisibility(card.id)}
										>
											{hidden ? <EyeOff /> : <Eye />}
										</Button>
									</ItemActions>
								</Item>
							)
						})}
					</ItemGroup>
				)}
			</div>
			<HairCardBakeDialog editor={editor} projectId={projectId} disabled={hairCards.length === 0} />
		</div>
	)
}
