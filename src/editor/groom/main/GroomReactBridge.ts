import { HairCardBakeStatus } from '@/lib/hair/compose/HairCardPreviewMapTypes'

type Listener = () => void

/**
 * `'addVertex'` is a momentary mode, not a toolbar toggle like the other two - see
 * GroomEditor.beginAddVertexToSelectedSpline/AddPointButton. Armed by a click on the "add point"
 * overlay button, it reverts to `'select'` as soon as the next viewport click commits (or fails to
 * resolve to a point), so it never appears as a persistent GroomToolbar selection.
 */
export type GroomActiveTool = 'select' | 'placeSpline' | 'addVertex'

/**
 * GroomToolbar's view-mode dropdown - see GroomViewport.render for how each mode renders a spline's
 * card strip. `'textured'` shows GroomEditorController.cardStripPreviewMaterial - the composed
 * primary/secondary/tip/root map (HairCardPreviewMapComposer) - falling back to plain shaded when
 * `bakeStatus === 'missing'` (see GroomViewport.applyViewModeAndGhosting).
 */
export type GroomViewMode = 'wireframe' | 'wireframeOnShaded' | 'shaded' | 'textured'

/** Every valid GroomViewMode value - see isValidGroomViewMode, the `projects.groomViewMode` column's shape check. */
export const GROOM_VIEW_MODES: readonly GroomViewMode[] = ['wireframe', 'wireframeOnShaded', 'shaded', 'textured']

/** Shallow shape check for a client-submitted `groomViewMode` body field - shared by both project routes that accept it (PUT /api/projects/[projectId], POST /api/projects), same reasoning as isValidPreviewColors. */
export function isValidGroomViewMode(value: unknown): value is GroomViewMode {
	return typeof value === 'string' && (GROOM_VIEW_MODES as readonly string[]).includes(value)
}

/** UI state for the groom editor - not part of GroomProject. Mirrors ReactBridge.ts. Read via useGroomReactBridge. Everything here is ephemeral/session-only except `viewMode`, which GroomEditor.serializeProject/loadProject persist to the `projects.groomViewMode` column. */
export interface GroomReactBridgeState {
	/** Stable id (see SceneObjectRef) of the selected spline, if any. */
	selectedObjectId: string | null
	/** All selections. selectedObjectId is the active/last-selected member. */
	selectedObjectIds: ReadonlySet<string>
	/** Which tool the toolbar has active - see GroomEditorController.setActiveTool. */
	activeTool: GroomActiveTool
	/**
	 * Which vertex of the selected spline shows the rotate/scale gizmo (SplineVertexGizmo) - null
	 * while nothing/multiple things are selected. Reset rules live in GroomEditor (selectSpline/
	 * addSplineAt default to 0, multi-select/deselect/delete reset to null, any vertex-handle click
	 * or drag activates that vertex) - see GroomEditor.setActiveSplineVertex.
	 */
	activeVertexIndex: number | null
	/**
	 * The viewport's render style (GroomToolbar's dropdown) - read by GroomViewport.render() every
	 * frame exactly like selectedObjectIds/activeVertexIndex already are. Lives here rather than on
	 * GroomEditorController: unlike activeTool, it has no effect on which InteractionHandlers are
	 * active. The one field on this state persisted to the DB (`projects.groomViewMode`) - see
	 * GroomEditor.serializeProject/loadProject.
	 */
	viewMode: GroomViewMode
	/**
	 * GroomHairCardLookup.getBakeStatus(), refreshed on every GroomEditor.loadProject - drives
	 * GroomStatusBar's "maps aren't baked"/"cards moved since the last bake" warning. Lives here
	 * (rather than being read live off hairCardLookup, like getBakedMaps/getCardUvRect) so React
	 * components re-render on it the same way they already do for viewMode/selection.
	 */
	bakeStatus: HairCardBakeStatus
}

export class GroomReactBridge {
	private state: GroomReactBridgeState = {
		selectedObjectId: null,
		selectedObjectIds: new Set(),
		activeTool: 'select',
		activeVertexIndex: null,
		viewMode: 'shaded',
		bakeStatus: 'missing',
	}

	private readonly listeners: Set<Listener> = new Set()

	public getState(): GroomReactBridgeState {
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
				`GroomReactBridge.setSelectedObjectIds: active object "${selectedObjectId}" is not in the selection`
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
					? ([...selectedObjectIds].at(-1) ?? null)
					: this.state.selectedObjectId
			this.setSelectedObjectIds(selectedObjectIds, selectedObjectId)
			return
		}
		selectedObjectIds.add(objectId)
		this.setSelectedObjectIds(selectedObjectIds, objectId)
	}

	public setActiveTool(activeTool: GroomActiveTool): void {
		this.state = { ...this.state, activeTool }
		this.emit()
	}

	public setActiveVertexIndex(activeVertexIndex: number | null): void {
		if (activeVertexIndex === this.state.activeVertexIndex) {
			return
		}
		this.state = { ...this.state, activeVertexIndex }
		this.emit()
	}

	public setViewMode(viewMode: GroomViewMode): void {
		if (viewMode === this.state.viewMode) {
			return
		}
		this.state = { ...this.state, viewMode }
		this.emit()
	}

	/** Set once per GroomEditor.loadProject - see GroomReactBridgeState.bakeStatus. */
	public setBakeStatus(bakeStatus: HairCardBakeStatus): void {
		if (bakeStatus === this.state.bakeStatus) {
			return
		}
		this.state = { ...this.state, bakeStatus }
		this.emit()
	}

	private emit(): void {
		this.listeners.forEach((listener) => listener())
	}
}
