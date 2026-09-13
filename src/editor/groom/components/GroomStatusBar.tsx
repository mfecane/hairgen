'use client'

import { useGroomReactBridge } from '@/editor/groom/hooks/useGroomReactBridge'
import { TriangleAlert } from 'lucide-react'

/** Mirrors StatusBar.tsx - StatusBar itself reads useReactBridge(), hard-wired to the object editor's singleton, so this is its groom-editor twin rather than a reusable shared component. */
export function GroomStatusBar() {
	const { selectedObjectIds, viewMode, bakeStatus } = useGroomReactBridge()
	const selectionLabel =
		selectedObjectIds.size > 1
			? `Selected: ${selectedObjectIds.size} splines`
			: selectedObjectIds.size === 1
				? 'Selected: 1 spline'
				: 'No selection'

	// Only relevant to the view mode that actually consumes baked maps - see
	// GroomHairCardLookup.getBakeStatus/GroomViewport.applyViewModeAndGhosting.
	const bakeWarning =
		viewMode === 'textured' && bakeStatus !== 'fresh'
			? bakeStatus === 'missing'
				? "Hair card color/alpha maps aren't baked yet - open Bake textures in the hair card editor."
				: 'Hair cards moved since the last bake - rebake to update this view.'
			: null

	return (
		<div
			data-id="groom-status-bar"
			className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-4 border-t border-border bg-background/80 px-4 py-1.5 backdrop-blur-sm"
		>
			<span className="text-xs text-muted-foreground">{selectionLabel}</span>
			{bakeWarning && (
				<span data-id="groom-bake-warning" className="flex items-center gap-1.5 text-xs text-destructive">
					<TriangleAlert className="size-3.5" />
					{bakeWarning}
				</span>
			)}
		</div>
	)
}
