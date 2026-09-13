'use client'

import { Editor } from '@/editor/main/Editor'
import { useSyncExternalStore } from 'react'

/**
 * Re-renders when Project.thickness changes - see Editor.addOnProjectChangedListener,
 * Editor.setGlobalThickness, Editor.loadProject. Needed so the slider reflects the value
 * loaded from a persisted project instead of getting stuck at whatever it read on mount.
 */
export function useGlobalThickness(editor: Editor): number {
	const getSnapshot = (): number => editor.project.thickness

	return useSyncExternalStore(
		(onStoreChange) => {
			const controller = editor.addOnProjectChangedListener(onStoreChange)
			return () => controller.abort()
		},
		getSnapshot,
		getSnapshot
	)
}
