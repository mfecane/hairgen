'use client'

import { Loader } from '@/components/ui/loader'
import { WorkspaceHeader } from '@/components/WorkspaceHeader'
import { HairCardOptionsPanel } from '@/editor/components/HairCardOptionsPanel'
import { HairCardsPanel } from '@/editor/components/HairCardsPanel'
import { StatusBar } from '@/editor/components/StatusBar'
import { Toolbar } from '@/editor/components/Toolbar'
import { useEditor } from '@/editor/hooks/useEditor'
import { useProjectPersistence } from '@/editor/hooks/useProjectPersistence'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

interface EditorProps {
	/** When set, the session's scene is loaded from and saved to this persisted project. */
	projectId?: string
}

export function Editor({ projectId }: EditorProps) {
	const mountRef = useRef<HTMLDivElement>(null)
	const { resolvedTheme } = useTheme()
	const theme = resolvedTheme === 'light' ? 'light' : 'dark'
	const { editor, loading, loadingError } = useEditor(mountRef, theme)
	const { loaded, loadError, saveState, saveError, saveAsPending, saveAsError, autosave, setAutosave, save, saveAs } =
		useProjectPersistence(editor, projectId)
	const router = useRouter()

	async function saveProjectAs(name: string): Promise<void> {
		const copiedProjectId = await saveAs(name)
		if (copiedProjectId) {
			router.push(`/editor/${copiedProjectId}`)
		}
	}

	if (loadingError || loadError) {
		return (
			<div data-id="editor-error" className="flex h-screen items-center justify-center bg-surface">
				<div className="flex flex-col items-center gap-4">
					<div className="text-destructive">{loadingError ?? loadError}</div>
				</div>
			</div>
		)
	}

	return (
		<div data-id="editor" className="h-screen w-full flex flex-col bg-surface">
			<WorkspaceHeader
				editor={editor}
				projectId={projectId}
				projectName={editor?.project.name}
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
					{editor && <HairCardsPanel editor={editor} projectId={projectId} />}
					{editor && <HairCardOptionsPanel editor={editor} />}
					{editor && <Toolbar editor={editor} />}
				</div>

				<div ref={mountRef} data-id="editor-viewport" className="absolute inset-0 bg-background">
					{(loading || (projectId && !loaded)) && !loadingError && !loadError && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Loader />
						</div>
					)}
				</div>
			</div>
			<StatusBar />
		</div>
	)
}
