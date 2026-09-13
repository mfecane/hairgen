import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { create } from 'zustand'

/** Groom editor reference + lifecycle flags only - everything else lives in GroomReactBridge. Mirrors useEditorStore.ts. */
interface GroomEditorStoreState {
	editor: GroomEditor | null
	setEditor: (editor: GroomEditor | null) => void

	loading: boolean
	setLoading: (loading: boolean) => void

	loadingError: string | null
	setLoadingError: (loadingError: string | null) => void
}

export const useGroomEditorStore = create<GroomEditorStoreState>((set) => ({
	editor: null,
	setEditor: (editor) => set({ editor }),

	loading: true,
	setLoading: (loading) => set({ loading }),

	loadingError: null,
	setLoadingError: (loadingError) => set({ loadingError }),
}))
