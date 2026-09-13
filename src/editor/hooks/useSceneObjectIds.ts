'use client'

import { Editor } from '@/editor/main/Editor'
import { useSyncExternalStore } from 'react'

/**
 * Re-renders when Project.scene's set of object ids changes (add/remove/undo/redo) - see
 * Editor.addOnProjectChangedListener. Transform-only edits don't change this snapshot, since the
 * set of ids stays the same.
 */
export function useSceneObjectIds(editor: Editor): string {
	const getSnapshot = (): string =>
		editor.project.scene
			.getItems()
			.map((object) => object.id)
			.join(',')

	return useSyncExternalStore(
		(onStoreChange) => {
			const controller = editor.addOnProjectChangedListener(onStoreChange)
			return () => controller.abort()
		},
		getSnapshot,
		getSnapshot
	)
}
