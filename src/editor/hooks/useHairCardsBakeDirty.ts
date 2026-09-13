'use client'

import { Editor } from '@/editor/main/Editor'
import { useSyncExternalStore } from 'react'

/**
 * Re-renders when hair cards move/resize/get added/removed relative to the layout `Project.bakedMapsSceneHash`
 * was last baked from - see Editor.isHairCardsBakeDirty. Drives HairCardBakeMapCheckboxCard's warning
 * badge in HairCardBakeDialog.
 */
export function useHairCardsBakeDirty(editor: Editor): boolean {
	const getSnapshot = (): boolean => editor.isHairCardsBakeDirty()

	return useSyncExternalStore(
		(onStoreChange) => {
			const controller = editor.addOnProjectChangedListener(onStoreChange)
			return () => controller.abort()
		},
		getSnapshot,
		getSnapshot
	)
}
