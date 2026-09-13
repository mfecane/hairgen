'use client'

import { Button, buttonVariants } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { HistoryControls } from '@/editor/components/HistoryControls'
import { ProjectSaveControls } from '@/editor/components/ProjectSaveControls'
import type { SaveState } from '@/editor/hooks/useProjectPersistence'
import { type HistoryHost } from '@/editor/main/HistoryHost'
import { cn } from '@/lib/utils'
import { ArrowLeft, Ellipsis } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

interface WorkspaceHeaderProps {
	editor?: HistoryHost | null
	projectId?: string
	projectName?: string
	loaded?: boolean
	saveState?: SaveState
	saveError?: string | null
	saveAsPending?: boolean
	saveAsError?: string | null
	autosave?: boolean
	onSave?: () => Promise<void>
	onSaveAs?: (name: string) => Promise<void>
	onAutosaveChange?: (autosave: boolean) => void
}

export function WorkspaceHeader({
	editor,
	projectId,
	projectName,
	loaded,
	saveState,
	saveError,
	saveAsPending,
	saveAsError,
	autosave,
	onSave,
	onSaveAs,
	onAutosaveChange,
}: WorkspaceHeaderProps) {
	const pathname = usePathname()
	const { projectId: routeProjectId } = useParams<{ projectId?: string }>()
	const editorHref = routeProjectId ? `/editor/${routeProjectId}` : null
	const groomHref = routeProjectId ? `/editor/${routeProjectId}/groom` : null

	return (
		<header
			data-id="workspace-header"
			className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-3"
		>
			<Link
				href="/projects"
				className={cn(
					buttonVariants({ variant: pathname === '/projects' ? 'secondary' : 'ghost', size: 'sm' })
				)}
			>
				<ArrowLeft />
			</Link>
			<div className="flex items-center gap-2 px-2">
				<h1>Project name</h1>
				<Button variant="secondary" size="icon-sm">
					<Ellipsis className="size-4" />
				</Button>
			</div>
			{editorHref && (
				<Link
					href={editorHref}
					className={cn(
						buttonVariants({ variant: pathname === editorHref ? 'secondary' : 'ghost', size: 'sm' })
					)}
				>
					Editor
				</Link>
			)}
			{groomHref && (
				<Link
					href={groomHref}
					className={cn(
						buttonVariants({ variant: pathname === groomHref ? 'secondary' : 'ghost', size: 'sm' })
					)}
				>
					Groom
				</Link>
			)}
			<div className="ml-auto flex items-center gap-2">
				{editor && (
					<div data-id="workspace-header-actions" className="flex shrink-0 items-center gap-3">
						<HistoryControls editor={editor} />
						{projectId && projectName && onSave && onSaveAs && onAutosaveChange && (
							<ProjectSaveControls
								projectName={projectName}
								disabled={!loaded}
								saveState={saveState!}
								saveError={saveError ?? null}
								saveAsPending={saveAsPending ?? false}
								saveAsError={saveAsError ?? null}
								autosave={autosave ?? false}
								onSave={onSave}
								onSaveAs={onSaveAs}
								onAutosaveChange={onAutosaveChange}
							/>
						)}
					</div>
				)}
				<div data-id="workspace-header-user-menu">
					<UserMenu />
				</div>
			</div>
		</header>
	)
}
