'use client'

import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed'

/**
 * Loads a persisted project's groom scene into the groom editor session, and exposes a save action
 * for it. Mirrors useProjectPersistence.ts, but reads/writes only the `groom`/`groomViewMode` fields
 * of the project row - the object editor's `scene`/`thickness` are untouched by either editor's own
 * save cycle (see the groom editor plan's "full separation" decision). `projectName` is read once
 * from the loaded row purely for display (WorkspaceHeader/ProjectSaveControls) - GroomProject
 * doesn't own a name of its own.
 */
export function useGroomProjectPersistence(editor: GroomEditor | null, projectId: string | undefined) {
	const [loaded, setLoaded] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [projectName, setProjectName] = useState<string | undefined>(undefined)
	const [saveState, setSaveState] = useState<SaveState>('clean')
	const [saveError, setSaveError] = useState<string | null>(null)
	const [saveAsPending, setSaveAsPending] = useState(false)
	const [saveAsError, setSaveAsError] = useState<string | null>(null)
	const [autosave, setAutosave] = useState(true)
	const savedSnapshot = useRef<string | null>(null)
	const autosaveRef = useRef(autosave)
	const saveRef = useRef<() => Promise<void>>(async () => {})

	useEffect(() => {
		autosaveRef.current = autosave
	}, [autosave])

	useEffect(() => {
		if (!editor) {
			return
		}
		const controller = editor.addOnProjectChangedListener(() => {
			if (!savedSnapshot.current) {
				return
			}
			const isDirty = JSON.stringify(editor.serializeProject()) !== savedSnapshot.current
			setSaveState(isDirty ? 'dirty' : 'clean')
			if (isDirty && autosaveRef.current) {
				void saveRef.current()
			}
		})
		return () => controller.abort()
	}, [editor])

	useEffect(() => {
		if (!editor || !projectId) {
			return
		}
		let cancelled = false
		savedSnapshot.current = null

		fetch(`/api/projects/${projectId}`)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(
						`useGroomProjectPersistence: failed to load project "${projectId}" (${response.status})`
					)
				}
				const { project } = await response.json()
				if (!cancelled) {
					editor.loadProject(project)
					setProjectName(project.name)
					savedSnapshot.current = JSON.stringify(editor.serializeProject())
					setLoaded(true)
				}
			})
			.catch((cause: unknown) => {
				if (!cancelled) {
					setLoadError(cause instanceof Error ? cause.message : String(cause))
				}
			})

		return () => {
			cancelled = true
		}
	}, [editor, projectId])

	const save = useCallback(async (): Promise<void> => {
		if (!editor || !projectId) {
			throw new Error('useGroomProjectPersistence.save: no project is loaded')
		}
		if (saveState === 'saving' || saveAsPending) {
			return
		}
		const snapshot = JSON.stringify(editor.serializeProject())
		setSaveState('saving')
		setSaveError(null)
		try {
			const response = await fetch(`/api/projects/${projectId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: snapshot,
			})
			if (!response.ok) {
				throw new Error(
					`useGroomProjectPersistence.save: failed to save project "${projectId}" (${response.status})`
				)
			}
			savedSnapshot.current = snapshot
			setSaveState(JSON.stringify(editor.serializeProject()) === snapshot ? 'saved' : 'dirty')
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause)
			setSaveError(message)
			setSaveState('failed')
		}
	}, [editor, projectId, saveAsPending, saveState])

	const saveAs = useCallback(
		async (name: string): Promise<string | null> => {
			if (!editor) {
				throw new Error('useGroomProjectPersistence.saveAs: no editor is available')
			}
			if (saveState === 'saving' || saveAsPending) {
				return null
			}
			setSaveAsPending(true)
			setSaveAsError(null)
			try {
				const response = await fetch('/api/projects', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...editor.serializeProject(), name }),
				})
				if (!response.ok) {
					throw new Error(
						`useGroomProjectPersistence.saveAs: failed to create project copy (${response.status})`
					)
				}
				const { project } = await response.json()
				return project.id
			} catch (cause) {
				setSaveAsError(cause instanceof Error ? cause.message : String(cause))
				return null
			} finally {
				setSaveAsPending(false)
			}
		},
		[editor, saveAsPending, saveState]
	)

	useEffect(() => {
		saveRef.current = save
	}, [save])

	const setAutosaveEnabled = useCallback(
		(enabled: boolean): void => {
			setAutosave(enabled)
			if (enabled && saveState === 'dirty') {
				void save()
			}
		},
		[save, saveState]
	)

	return {
		loaded,
		loadError,
		projectName,
		saveState,
		saveError,
		saveAsPending,
		saveAsError,
		autosave,
		setAutosave: setAutosaveEnabled,
		save,
		saveAs,
	}
}
