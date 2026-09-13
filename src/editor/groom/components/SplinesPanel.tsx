'use client'

import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { useSplineObjectIds } from '@/editor/groom/hooks/useSplineObjectIds'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { cn } from '@/lib/utils'
import { Eye, Spline, SquareStack } from 'lucide-react'

interface SplinesPanelProps {
	editor: GroomEditor
}

/**
 * Docked left sidebar listing every spline in the groom scene. Selecting a row selects that spline
 * the same way clicking it in the viewport would (same GroomReactBridge selection state), which
 * shows its vertex gizmo and enables the toolbar's delete action on it. Mirrors HairCardsPanel.tsx.
 */
export function SplinesPanel({ editor }: SplinesPanelProps) {
	useSplineObjectIds(editor)
	const splines = editor.project.scene.getItems()

	return (
		<div
			data-id="splines-panel"
			className={cn(
				'relative z-15 h-full w-64 space-y-2 border-r border-border',
				'bg-background p-4 shadow-md pointer-events-auto'
			)}
		>
			<h2 className="flex items-center gap-2">
				<SquareStack className="size-4" />
				Splines
			</h2>
			{splines.length === 0 ? (
				<p className="px-2 py-1 text-xs text-muted-foreground">No splines yet</p>
			) : (
				<ItemGroup className="gap-2">
					{splines.map((spline, index) => (
						<Item
							data-id={`spline-item-${spline.id}`}
							variant="muted"
							onClick={(event) => editor.selectSpline(spline.id, event.shiftKey)}
							key={spline.id}
							className="p-2 py-1"
						>
							<ItemMedia variant="icon">
								<Spline className="size-4" />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>Spline {index + 1}</ItemTitle>
							</ItemContent>
							<ItemActions>
								<Button size="icon-sm" variant="secondary">
									<Eye className="size-4" />
								</Button>
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}
		</div>
	)
}
