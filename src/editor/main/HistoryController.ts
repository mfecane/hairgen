import { EditorCommand } from '@/editor/main/EditorCommand'

type HistoryListener = () => void

/** Owns the editor's linear command history. Commands are the sole mutation path for undoable state. */
export class HistoryController {
	private readonly undoStack: EditorCommand[] = []

	private readonly redoStack: EditorCommand[] = []

	private readonly listeners: Set<HistoryListener> = new Set()

	public execute(command: EditorCommand): void {
		command.execute()
		this.undoStack.push(command)
		this.redoStack.length = 0
		this.emit()
	}

	public undo(): EditorCommand | null {
		const command = this.undoStack.pop()
		if (!command) {
			return null
		}
		command.undo()
		this.redoStack.push(command)
		this.emit()
		return command
	}

	public redo(): EditorCommand | null {
		const command = this.redoStack.pop()
		if (!command) {
			return null
		}
		command.execute()
		this.undoStack.push(command)
		this.emit()
		return command
	}

	public clear(): void {
		this.undoStack.length = 0
		this.redoStack.length = 0
		this.emit()
	}

	public canUndo(): boolean {
		return this.undoStack.length > 0
	}

	public canRedo(): boolean {
		return this.redoStack.length > 0
	}

	public addOnChangeListener(listener: HistoryListener): AbortController {
		this.listeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.listeners.delete(listener), { once: true })
		return controller
	}

	private emit(): void {
		this.listeners.forEach((listener) => listener())
	}
}
