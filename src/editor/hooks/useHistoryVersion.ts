'use client'

import { HistoryHost } from '@/editor/main/HistoryHost'
import { useSyncExternalStore } from 'react'

/** Re-renders command controls when the history's undo/redo availability changes. */
export function useHistoryVersion(editor: HistoryHost): number {
	const getSnapshot = (): number =>
		(editor.controller.history.canUndo() ? 1 : 0) + (editor.controller.history.canRedo() ? 2 : 0)

	return useSyncExternalStore(
		(onStoreChange) => {
			const subscription = editor.controller.history.addOnChangeListener(onStoreChange)
			return () => subscription.abort()
		},
		getSnapshot,
		getSnapshot
	)
}
