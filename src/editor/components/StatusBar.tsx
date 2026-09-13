'use client'

import { useReactBridge } from '@/editor/hooks/useReactBridge'

export function StatusBar() {
	const { selectedObjectIds } = useReactBridge()
	const selectionLabel =
		selectedObjectIds.size > 1
			? `Selected: ${selectedObjectIds.size} objects`
			: selectedObjectIds.size === 1
				? 'Selected: 1 object'
				: 'No selection'

	return (
		<div
			data-id="status-bar"
			className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-4 border-t border-border bg-background/80 px-4 py-1.5 backdrop-blur-sm"
		>
			<span className="text-xs text-muted-foreground">
				{selectionLabel}
			</span>
		</div>
	)
}
