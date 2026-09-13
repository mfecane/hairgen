'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { SaveState } from '@/editor/hooks/useProjectPersistence'
import { Check, ChevronDown, Copy, Loader2, Save } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

interface ProjectSaveControlsProps {
	projectName: string
	disabled: boolean
	saveState: SaveState
	saveError: string | null
	saveAsPending: boolean
	saveAsError: string | null
	autosave: boolean
	onSave: () => Promise<void>
	onSaveAs: (name: string) => Promise<void>
	onAutosaveChange: (autosave: boolean) => void
}

/** Persisted-project save action, including keyboard access and project-copy creation. */
export function ProjectSaveControls({
	projectName,
	disabled,
	saveState,
	saveError,
	saveAsPending,
	saveAsError,
	autosave,
	onSave,
	onSaveAs,
	onAutosaveChange,
}: ProjectSaveControlsProps) {
	const [saveMenuOpen, setSaveMenuOpen] = useState(false)
	const [saveAsOpen, setSaveAsOpen] = useState(false)
	const [saveAsName, setSaveAsName] = useState(`${projectName} copy`)
	const isSaving = disabled || saveState === 'saving' || saveAsPending

	useEffect(() => {
		function handleSaveShortcut(event: KeyboardEvent): void {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				event.preventDefault()
				if (!isSaving) {
					void onSave()
				}
			}
		}
		window.addEventListener('keydown', handleSaveShortcut)
		return () => window.removeEventListener('keydown', handleSaveShortcut)
	}, [isSaving, onSave])

	function openSaveAs(): void {
		setSaveAsName(`${projectName} copy`)
		setSaveMenuOpen(false)
		setSaveAsOpen(true)
	}

	function submitSaveAs(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault()
		const name = saveAsName.trim()
		if (!name || isSaving) {
			return
		}
		void onSaveAs(name)
	}

	return (
		<>
			<div data-id="project-save-controls" className="flex items-center gap-2">
				{saveState === 'dirty' && (
					<Badge data-id="project-unsaved-indicator" className="bg-muted text-muted-foreground">
						Unsaved
					</Badge>
				)}
				<div className="flex items-center">
					<Button
						data-id="project-save-button"
						type="button"
						size="sm"
						className="rounded-r-none"
						disabled={isSaving}
						aria-keyshortcuts="Control+S Meta+S"
						title="Save now (Ctrl/Cmd+S)"
						onClick={() => void onSave()}
					>
						{saveState === 'saving' ? <Loader2 className="animate-spin" /> : saveState === 'saved' ? <Check /> : <Save />}
						{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Retry' : 'Save'}
					</Button>
					<Popover open={saveMenuOpen} onOpenChange={setSaveMenuOpen}>
						<PopoverTrigger
							render={
								<Button
									data-id="project-save-menu-button"
									type="button"
									size="icon-sm"
									className="rounded-l-none border-l-border"
									disabled={isSaving}
									aria-label="Open save menu"
									aria-haspopup="menu"
								/>
							}
						>
							<ChevronDown className="size-3.5" />
						</PopoverTrigger>
						<PopoverContent data-id="project-save-menu" align="end" className="w-48 p-1">
							<div role="menu" aria-label="Project save actions">
								<Button
									data-id="project-save-as-menu-item"
									type="button"
									variant="ghost"
									className="h-9 w-full justify-start px-2 font-normal"
									role="menuitem"
									onClick={openSaveAs}
								>
									<Copy />
									Save as…
								</Button>
								<div
									data-id="project-autosave-setting"
									className="flex h-9 items-center justify-between gap-3 px-2"
									role="menuitem"
								>
									<label htmlFor="project-autosave-switch" className="text-sm">
										Autosave
									</label>
									<Switch
										id="project-autosave-switch"
										data-id="project-autosave-switch"
										checked={autosave}
										disabled={isSaving}
										onCheckedChange={onAutosaveChange}
									/>
								</div>
							</div>
						</PopoverContent>
					</Popover>
				</div>
				{saveState === 'failed' && saveError && (
					<details data-id="project-save-error-details" className="text-xs">
						<summary className="cursor-pointer text-destructive underline underline-offset-2">
							Save error details
						</summary>
						<pre className="absolute right-3 top-12 z-20 max-w-md whitespace-pre-wrap rounded-md border border-destructive/40 bg-background p-3 text-foreground shadow-lg">
							{saveError}
						</pre>
					</details>
				)}
			</div>
			<Dialog open={saveAsOpen} onOpenChange={(open) => !saveAsPending && setSaveAsOpen(open)}>
				<DialogContent data-id="save-project-as-dialog" className="sm:max-w-md">
					<form data-id="save-project-as-form" onSubmit={submitSaveAs}>
						<DialogHeader>
							<DialogTitle>Save project as</DialogTitle>
							<DialogDescription>Create a copy of “{projectName}” with its current scene.</DialogDescription>
						</DialogHeader>
						<Input
							data-id="save-project-as-name-input"
							value={saveAsName}
							maxLength={120}
							aria-label="Copied project name"
							className="mt-4"
							disabled={saveAsPending}
							onChange={(event) => setSaveAsName(event.target.value)}
							onFocus={(event) => event.currentTarget.select()}
							autoFocus
						/>
						{saveAsError && <p data-id="save-project-as-error" className="mt-3 text-xs text-destructive">{saveAsError}</p>}
						<DialogFooter className="mt-6">
							<Button type="button" variant="outline" disabled={saveAsPending} onClick={() => setSaveAsOpen(false)}>
								Cancel
							</Button>
							<Button data-id="confirm-save-project-as-button" type="submit" disabled={!saveAsName.trim() || saveAsPending}>
								{saveAsPending ? <Loader2 className="animate-spin" /> : <Copy />}
								{saveAsPending ? 'Creating copy…' : 'Create copy'}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	)
}
