'use client'

import { useEditorStore } from '@/editor/hooks/useEditorStore'
import { getEditorSession } from '@/editor/main/EditorSession'
import { EditorTheme } from '@/constants'
import { Editor } from '@/editor/main/Editor'
import { useEffect, type RefObject } from 'react'

/** Attaches the application's single runtime-only editor to this view. */
export function useEditor(
	mountRef: RefObject<HTMLDivElement | null>,
	theme: EditorTheme,
	getSession: () => Editor = getEditorSession
) {
	const editor = useEditorStore((state) => state.editor)
	const setEditor = useEditorStore((state) => state.setEditor)
	const loading = useEditorStore((state) => state.loading)
	const setLoading = useEditorStore((state) => state.setLoading)
	const loadingError = useEditorStore((state) => state.loadingError)
	const setLoadingError = useEditorStore((state) => state.setLoadingError)

	useEffect(() => {
		if (!mountRef.current) {
			throw new Error('useEditor: editor viewport mount element is unavailable')
		}
		const editor = getSession()
		editor.setTheme(theme)
		const viewport = editor.createViewport(mountRef.current)
		setLoadingError(null)
		setEditor(editor)
		setLoading(false)

		return () => {
			editor.removeViewport(viewport)
			setEditor(null)
		}
	}, [getSession, mountRef, setEditor, setLoading, setLoadingError, theme])

	return { editor, loading, loadingError }
}
