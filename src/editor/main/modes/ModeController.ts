import { EditorMode, EditorModeId, ModeContext } from '@/editor/main/modes/EditorMode'

type ModeChangeListener = (mode: EditorMode) => void

/**
 * Owned by EditorController - registers EditorModes by id and tracks the single mode active across
 * the whole editor. Viewport listens via addOnModeChangedListener to rebuild its own interaction
 * handler list (getInteractionHandlers(this)) whenever the active mode changes.
 */
export class ModeController {
	private readonly modes: Map<EditorModeId, EditorMode> = new Map()

	private activeMode: EditorMode | null = null

	private readonly listeners: Set<ModeChangeListener> = new Set()

	public constructor(private readonly context: ModeContext) {}

	public registerMode(mode: EditorMode): void {
		this.modes.set(mode.id, mode)
	}

	public getActiveMode(): EditorMode {
		if (!this.activeMode) {
			throw new Error('ModeController: no active mode - call activateMode before use')
		}
		return this.activeMode
	}

	public activateMode(id: EditorModeId): void {
		const mode = this.modes.get(id)
		if (!mode) {
			throw new Error(`ModeController: unknown mode "${id}"`)
		}
		this.activeMode?.deactivate()
		this.activeMode = mode
		mode.activate(this.context)
		this.listeners.forEach((listener) => listener(mode))
	}

	public addOnModeChangedListener(listener: ModeChangeListener): void {
		this.listeners.add(listener)
	}

	public removeOnModeChangedListener(listener: ModeChangeListener): void {
		this.listeners.delete(listener)
	}
}
