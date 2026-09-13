import { Editor } from '@/editor/main/Editor'
import { create } from 'zustand'

/** Editor reference + lifecycle flags only - everything else lives in ReactBridge. */
interface EditorStoreState {
	editor: Editor | null
	setEditor: (editor: Editor | null) => void

	loading: boolean
	setLoading: (loading: boolean) => void

	loadingError: string | null
	setLoadingError: (loadingError: string | null) => void
}

export const useEditorStore = create<EditorStoreState>((set) => ({
	editor: null,
	setEditor: (editor) => set({ editor }),

	loading: true,
	setLoading: (loading) => set({ loading }),

	loadingError: null,
	setLoadingError: (loadingError) => set({ loadingError }),
}))
