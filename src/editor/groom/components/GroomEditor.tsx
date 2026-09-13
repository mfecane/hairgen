'use client'

import { Loader } from '@/components/ui/loader'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import { AddPointButton } from '@/editor/groom/components/AddPointButton'
import { GroomStatusBar } from '@/editor/groom/components/GroomStatusBar'
import { GroomToolbar } from '@/editor/groom/components/GroomToolbar'
import { SplineCurveInsertHint } from '@/editor/groom/components/SplineCurveInsertHint'
import { SplineOptionsPanel } from '@/editor/groom/components/SplineOptionsPanel'
import { SplineSmoothModifyPanel } from '@/editor/groom/components/SplineSmoothModifyPanel'
import { SplinesPanel } from '@/editor/groom/components/SplinesPanel'
import { useGroomEditor } from '@/editor/groom/hooks/useGroomEditor'
import { useGroomProjectPersistence } from '@/editor/groom/hooks/useGroomProjectPersistence'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

interface GroomEditorProps {
	/** When set, the session's groom scene is loaded from and saved to this persisted project. */
	projectId?: string
}

/** Top-level composition for the groom editor page - mirrors editor/components/Editor.tsx. */
export function GroomEditor({ projectId }: GroomEditorProps) {
	const mountRef = useRef<HTMLDivElement>(null)
	const { resolvedTheme } = useTheme()
	const theme = resolvedTheme === 'light' ? 'light' : 'dark'
	const { editor, viewport, loading, loadingError } = useGroomEditor(mountRef, theme)
	const {
		loaded,
		loadError,
		projectName,
		saveState,
		saveError,
		saveAsPending,
		saveAsError,
		autosave,
		setAutosave,
		save,
		saveAs,
	} = useGroomProjectPersistence(editor, projectId)
	const router = useRouter()

	async function saveProjectAs(name: string): Promise<void> {
		const copiedProjectId = await saveAs(name)
		if (copiedProjectId) {
			router.push(`/editor/${copiedProjectId}/groom`)
		}
	}

	if (loadingError || loadError) {
		return (
			<div data-id="groom-editor-error" className="flex h-screen items-center justify-center bg-surface">
				<div className="flex flex-col items-center gap-4">
					<div className="text-destructive">{loadingError ?? loadError}</div>
				</div>
			</div>
		)
	}

	return (
		<div data-id="groom-editor" className="h-screen w-full flex flex-col bg-surface">
			<WorkspaceHeader
				editor={editor}
				projectId={projectId}
				projectName={projectName}
				loaded={loaded}
				saveState={saveState}
				saveError={saveError}
				saveAsPending={saveAsPending}
				saveAsError={saveAsError}
				autosave={autosave}
				onSave={save}
				onSaveAs={saveProjectAs}
				onAutosaveChange={setAutosave}
			/>
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<div className="absolute z-10 top-0 left-0 bottom-0 items-start flex w-full pointer-events-none">
					{editor && <SplinesPanel editor={editor} />}
					{editor && <SplineOptionsPanel editor={editor} projectId={projectId} />}
					{editor && (
						<div data-id="groom-toolbar-stack" className="m-4 flex flex-col items-start gap-2">
							<GroomToolbar editor={editor} />
							<SplineSmoothModifyPanel editor={editor} />
						</div>
					)}
				</div>

				<div ref={mountRef} data-id="groom-editor-viewport" className="absolute inset-0 bg-background">
					{(loading || (projectId && !loaded)) && !loadingError && !loadError && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Loader />
						</div>
					)}
					{editor && <AddPointButton editor={editor} viewport={viewport} />}
					{editor && <SplineCurveInsertHint viewport={viewport} />}
				</div>
			</div>
			<GroomStatusBar />
		</div>
	)
}
