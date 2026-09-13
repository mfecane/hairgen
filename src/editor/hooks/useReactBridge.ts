'use client'

import { useEditorStore } from '@/editor/hooks/useEditorStore'
import { ReactBridgeState } from '@/editor/main/ReactBridge'
import { useSyncExternalStore } from 'react'

const EMPTY_STATE: ReactBridgeState = {
	selectedObjectId: null,
	selectedObjectIds: new Set(),
	hiddenIdentifiers: new Set(),
}

/** Subscribes the calling component to the current Editor's ReactBridge state. */
export function useReactBridge(): ReactBridgeState {
	const editor = useEditorStore((state) => state.editor)

	return useSyncExternalStore(
		(onStoreChange) => (editor ? editor.reactBridge.subscribe(onStoreChange) : () => {}),
		() => editor?.reactBridge.getState() ?? EMPTY_STATE,
		() => EMPTY_STATE
	)
}
