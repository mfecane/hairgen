'use client'

import { Button } from '@/components/ui/button'
import { useHistoryVersion } from '@/editor/hooks/useHistoryVersion'
import { HistoryHost } from '@/editor/main/HistoryHost'
import { Redo2, Undo2 } from 'lucide-react'
import { useEffect } from 'react'

interface HistoryControlsProps {
	editor: HistoryHost
}

/** Undo/redo controls and standard keyboard shortcuts for the editor command history. */
export function HistoryControls({ editor }: HistoryControlsProps) {
	useHistoryVersion(editor)
	const canUndo = editor.controller.history.canUndo()
	const canRedo = editor.controller.history.canRedo()

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent): void {
			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
			) {
				return
			}

			// Handle undo/redo with Ctrl/Cmd+Z
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
				if (event.shiftKey) {
					if (editor.controller.history.canRedo()) {
						event.preventDefault()
						editor.redo()
					}
					return
				}
				if (editor.controller.history.canUndo()) {
					event.preventDefault()
					editor.undo()
				}
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [editor])

	return (
		<div data-id="editor-history-controls" className="flex items-center gap-1">
			<Button
				data-id="editor-undo"
				variant="ghost"
				size="icon-sm"
				aria-label="Undo"
				disabled={!canUndo}
				onClick={() => editor.undo()}
			>
				<Undo2 />
			</Button>
			<Button
				data-id="editor-redo"
				variant="ghost"
				size="icon-sm"
				aria-label="Redo"
				disabled={!canRedo}
				onClick={() => editor.redo()}
			>
				<Redo2 />
			</Button>
		</div>
	)
}
