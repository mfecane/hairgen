type Listener = () => void

/** Ephemeral, UI-only state - not persisted, not part of Project. Read via useReactBridge. */
export interface ReactBridgeState {
	/** Stable id (see SceneObjectRef) of the selected object, if any. */
	selectedObjectId: string | null
	/** All selections. selectedObjectId is the active/last-selected member. */
	selectedObjectIds: ReadonlySet<string>
	/** Ids of objects currently hidden - consulted by Viewport.render. */
	hiddenIdentifiers: ReadonlySet<string>
}

export class ReactBridge {
	private state: ReactBridgeState = {
		selectedObjectId: null,
		selectedObjectIds: new Set(),
		hiddenIdentifiers: new Set(),
	}

	private readonly listeners: Set<Listener> = new Set()

	public getState(): ReactBridgeState {
		return this.state
	}

	public subscribe(listener: Listener): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	public setSelectedObjectId(selectedObjectId: string | null): void {
		this.state = {
			...this.state,
			selectedObjectId,
			selectedObjectIds: selectedObjectId ? new Set([selectedObjectId]) : new Set(),
		}
		this.emit()
	}

	public setSelectedObjectIds(selectedObjectIds: ReadonlySet<string>, selectedObjectId: string | null): void {
		if (selectedObjectId && !selectedObjectIds.has(selectedObjectId)) {
			throw new Error(
				`ReactBridge.setSelectedObjectIds: active object "${selectedObjectId}" is not in the selection`
			)
		}
		this.state = {
			...this.state,
			selectedObjectId,
			selectedObjectIds: new Set(selectedObjectIds),
		}
		this.emit()
	}

	public toggleSelectedObjectId(objectId: string): void {
		const selectedObjectIds = new Set(this.state.selectedObjectIds)
		if (selectedObjectIds.has(objectId)) {
			selectedObjectIds.delete(objectId)
			const selectedObjectId =
				this.state.selectedObjectId === objectId
					? [...selectedObjectIds].at(-1) ?? null
					: this.state.selectedObjectId
			this.setSelectedObjectIds(selectedObjectIds, selectedObjectId)
			return
		}
		selectedObjectIds.add(objectId)
		this.setSelectedObjectIds(selectedObjectIds, objectId)
	}

	public setHidden(identifier: string, hidden: boolean): void {
		const hiddenIdentifiers = new Set(this.state.hiddenIdentifiers)
		if (hidden) {
			hiddenIdentifiers.add(identifier)
		} else {
			hiddenIdentifiers.delete(identifier)
		}
		this.state = { ...this.state, hiddenIdentifiers }
		this.emit()
	}

	public replaceHiddenIdentifiers(hiddenIdentifiers: Set<string>): void {
		this.state = { ...this.state, hiddenIdentifiers }
		this.emit()
	}

	public showAll(): void {
		this.replaceHiddenIdentifiers(new Set())
	}

	private emit(): void {
		this.listeners.forEach((listener) => listener())
	}
}
