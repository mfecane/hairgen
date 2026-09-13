import { HistoryController } from '@/editor/main/HistoryController'

/**
 * Anything that owns an undo/redo history via a `HistoryController` and exposes `undo`/`redo` -
 * `Editor` and `GroomEditor` both satisfy this by construction, so `HistoryControls`/
 * `WorkspaceHeader` can host either editor's undo/redo controls without depending on either
 * editor's concrete class.
 */
export interface HistoryHost {
	controller: { history: HistoryController }
	undo(): void
	redo(): void
}
