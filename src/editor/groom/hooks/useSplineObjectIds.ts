'use client'

import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { useSyncExternalStore } from 'react'

/**
 * Re-renders when GroomProject.scene's set of spline ids changes (add/remove/undo/redo) - see
 * GroomEditor.addOnProjectChangedListener. Mirrors useSceneObjectIds.ts.
 */
export function useSplineObjectIds(editor: GroomEditor): string {
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
