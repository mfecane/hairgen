'use client'

import { Button } from '@/components/ui/button'
import { useReactBridge } from '@/editor/hooks/useReactBridge'
import { Editor } from '@/editor/main/Editor'
import { RectangleHorizontal } from 'lucide-react'

interface ToolbarProps {
	editor: Editor
}

/** Scene-object actions: add a hair card, delete the selection. */
export function Toolbar({ editor }: ToolbarProps) {
	const { selectedObjectIds } = useReactBridge()

	return (
		<div
			data-id="editor-toolbar"
			className="m-4 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm pointer-events-auto"
		>
			<Button
				data-id="add-hair-card"
				variant="ghost"
				size="icon"
				aria-label="Add hair card"
				onClick={() => editor.addHairCard()}
			>
				<RectangleHorizontal className="size-4" />
			</Button>
		</div>
	)
}
