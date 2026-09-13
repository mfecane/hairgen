/** One reversible mutation of an editor source of truth. */
export interface EditorCommand {
	execute(): void

	undo(): void

	/** Project mutations need their disposable viewport projections and save state refreshed. */
	affectsProject(): boolean
}
