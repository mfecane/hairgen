'use client'

import { EditorTheme } from '@/constants'
import { useGroomEditorStore } from '@/editor/groom/hooks/useGroomEditorStore'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { getGroomEditorSession } from '@/editor/groom/main/GroomEditorSession'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Attaches the application's single runtime-only groom editor to this view. Mirrors useEditor.ts. */
export function useGroomEditor(
	mountRef: RefObject<HTMLDivElement | null>,
	theme: EditorTheme,
	getSession: () => GroomEditor = getGroomEditorSession
) {
	const editor = useGroomEditorStore((state) => state.editor)
	const setEditor = useGroomEditorStore((state) => state.setEditor)
	const loading = useGroomEditorStore((state) => state.loading)
	const setLoading = useGroomEditorStore((state) => state.setLoading)
	const loadingError = useGroomEditorStore((state) => state.loadingError)
	const setLoadingError = useGroomEditorStore((state) => state.setLoadingError)
	// Not in useGroomEditorStore (which only holds editor lifetime flags) - this is a plain instance
	// pointer a component needs (AddPointButton, to subscribe to its per-frame screen position; see
	// GroomViewport.subscribeAddPointScreenPosition), not shared app state.
	const [viewport, setViewport] = useState<GroomViewport | null>(null)

	// debug: identify this component instance and which effect dep changed identity between runs
	const instanceId = useRef(Math.random().toString(36).slice(2, 8)).current
	const prevDeps = useRef<unknown[] | null>(null)
	const deps = [getSession, mountRef, setEditor, setLoading, setLoadingError, theme]
	const depNames = ['getSession', 'mountRef', 'setEditor', 'setLoading', 'setLoadingError', 'theme']
	if (prevDeps.current) {
		depNames.forEach((name, i) => {
			if (!Object.is(prevDeps.current![i], deps[i])) {
				console.log('[debug] dep changed:', name, 'instance:', instanceId)
			}
		})
	}
	prevDeps.current = deps
	console.log('[debug] getSession === default import:', Object.is(getSession, getGroomEditorSession))

	useEffect(() => {
		console.log('[debug] useGroomEditor effect run, theme:', theme, 'instance:', instanceId)
		if (!mountRef.current) {
			throw new Error('useGroomEditor: editor viewport mount element is unavailable')
		}
		const editor = getSession()
		editor.setTheme(theme)
		const viewport = editor.createViewport(mountRef.current)
		setLoadingError(null)
		setEditor(editor)
		setViewport(viewport)
		setLoading(false)

		return () => {
			console.log('[debug] useGroomEditor effect cleanup, theme:', theme, 'instance:', instanceId)
			editor.removeViewport(viewport)
			setEditor(null)
			setViewport(null)
		}
	}, [getSession, mountRef, setEditor, setLoading, setLoadingError, theme])

	return { editor, viewport, loading, loadingError }
}
