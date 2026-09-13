'use client'

import { useGroomEditorStore } from '@/editor/groom/hooks/useGroomEditorStore'
import { GroomReactBridgeState } from '@/editor/groom/main/GroomReactBridge'
import { useSyncExternalStore } from 'react'

const EMPTY_STATE: GroomReactBridgeState = {
	selectedObjectId: null,
	selectedObjectIds: new Set(),
	activeTool: 'select',
	activeVertexIndex: null,
	viewMode: 'shaded',
	bakeStatus: 'missing',
}

/** Subscribes the calling component to the current GroomEditor's GroomReactBridge state. Mirrors useReactBridge.ts. */
export function useGroomReactBridge(): GroomReactBridgeState {
	const editor = useGroomEditorStore((state) => state.editor)

	return useSyncExternalStore(
		(onStoreChange) => (editor ? editor.reactBridge.subscribe(onStoreChange) : () => {}),
		() => editor?.reactBridge.getState() ?? EMPTY_STATE,
		() => EMPTY_STATE
	)
}
