import { EditorTheme, GROOM } from '@/constants'
import { EditorCommand } from '@/editor/main/EditorCommand'
import { SceneObjectData, Vector3Data } from '@/editor/main/Project'
import {
	AddSplineCommand,
	AddSplineVertexCommand,
	AppendSplineVertexAtCommand,
	CloneSplineCommand,
	DeleteSplineObjectsCommand,
	DeleteSplineVertexCommand,
	InsertSplineVertexCommand,
	SetSplineOptionsCommand,
	SplineOptionsSnapshot,
	SplineVertexTransformEntry,
	SplineVertexTransformSnapshot,
	TransformSplineVertexCommand,
	TransformSplineVerticesCommand,
} from '@/editor/groom/main/commands/GroomCommands'
import { GroomEditorController } from '@/editor/groom/main/GroomEditorController'
import { GroomHairCardLookup } from '@/editor/groom/main/GroomHairCardLookup'
import { GroomProject, SplineObjectData } from '@/editor/groom/main/GroomProject'
import { GroomActiveTool, GroomReactBridge, GroomViewMode } from '@/editor/groom/main/GroomReactBridge'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'

type ProjectChangeListener = () => void

/**
 * Root object for the groom editor - owns GroomProject, controller, GroomReactBridge, and any
 * number of GroomViewports. Mirrors Editor.ts (see its class doc) but scoped to the `groom`
 * persisted field only - see the groom editor plan's "full separation" decision. Nothing here is
 * shared with the object editor's Editor/Project/EditorController/ReactBridge/Viewport.
 */
export class GroomEditor {
	public readonly project: GroomProject = new GroomProject()

	public readonly controller: GroomEditorController = new GroomEditorController()

	public readonly reactBridge: GroomReactBridge = new GroomReactBridge()

	/** Cross-project hair-card width/baked-texture lookup - see GroomHairCardLookup, loadProject. */
	public readonly hairCardLookup: GroomHairCardLookup = new GroomHairCardLookup()

	public readonly viewports: GroomViewport[] = []

	private readonly projectChangeListeners: Set<ProjectChangeListener> = new Set()

	/** See beginAddVertexToSelectedSpline/getAddVertexAnchorPosition - cleared whenever setActiveTool leaves 'addVertex'. */
	private addVertexAnchorPosition: Vector3Data | null = null

	private animationFrameId: number | null = null

	public constructor(theme: EditorTheme = 'dark') {
		this.controller.setTheme(theme)
		this.animate()
	}

	public setTheme(theme: EditorTheme): void {
		this.controller.setTheme(theme)
		this.viewports.forEach((viewport) => viewport.setTheme(theme))
	}

	public createViewport(mountElement: HTMLElement): GroomViewport {
		const viewport = new GroomViewport(this, mountElement)
		this.viewports.push(viewport)
		console.log('[debug] createViewport, total viewports:', this.viewports.length)
		viewport.syncSplineObjects(this.project.scene.toJSON())
		viewport.frameAll()
		return viewport
	}

	public removeViewport(viewport: GroomViewport): void {
		const index = this.viewports.indexOf(viewport)
		if (index === -1) {
			console.log('[debug] removeViewport: not found (already removed?)')
			return
		}
		viewport.dispose()
		this.viewports.splice(index, 1)
		console.log('[debug] removeViewport, total viewports:', this.viewports.length)
	}

	/**
	 * Replaces the session's groom scene with a persisted one (see the `projects.groom` column).
	 * `bakedMaps`/`bakedMapsSceneHash`/`previewColors`/`scene` are the SAME row's object-editor
	 * fields, passed through unedited by useGroomProjectPersistence (which already fetches the whole
	 * row) - see GroomHairCardLookup for why the groom runtime needs them (the project's latest baked
	 * texture maps for "textured" view mode, each hair card's own atlas placement for
	 * confining a card strip's UVs to its referenced card, and the bake-staleness/preview-color data
	 * GroomStatusBar's warning and the "textured" view mode itself read). All optional so a row saved
	 * before this (or an earlier) feature existed still loads.
	 */
	public loadProject(project: {
		groom: SplineObjectData[]
		bakedMaps?: Partial<Record<BakeMapKind, { url: string }>>
		bakedMapsSceneHash?: string | null
		previewColors?: HairPreviewColors
		scene?: SceneObjectData[]
		groomViewMode?: GroomViewMode
	}): void {
		this.hairCardLookup.setFromProject(
			project.bakedMaps,
			project.scene,
			project.bakedMapsSceneHash,
			project.previewColors
		)
		this.project.scene.replaceAll(project.groom)
		this.controller.history.clear()
		this.reactBridge.setBakeStatus(this.hairCardLookup.getBakeStatus())
		this.reactBridge.setViewMode(project.groomViewMode ?? GROOM.DEFAULT_VIEW_MODE)
		this.syncScene()
		this.emitProjectChanged()
	}

	/** The current groom scene's persistable form - what a PUT to `/api/projects/[projectId]` saves. */
	public serializeProject(): { groom: SplineObjectData[]; groomViewMode: GroomViewMode } {
		return { groom: this.project.scene.toJSON(), groomViewMode: this.reactBridge.getState().viewMode }
	}

	public addOnProjectChangedListener(listener: ProjectChangeListener): AbortController {
		this.projectChangeListeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.projectChangeListeners.delete(listener), { once: true })
		return controller
	}

	/**
	 * Places a new straight 2-point spline at `position` (see GroomScene.addSpline), selects it, and
	 * returns to the select tool. `normal` - the scalp surface normal at the placement point, when
	 * the click landed on the scalp proxy - orients the spline normal to the scalp instead of
	 * GROOM.SPLINE.DEFAULT_DIRECTION; see PlaceSplineInteractionHandler.
	 */
	public addSplineAt(position: Vector3Data, normal: Vector3Data | null = null): void {
		const command = new AddSplineCommand(this.project.scene, position, normal)
		this.executeCommand(command)
		this.reactBridge.setSelectedObjectId(command.getObjectId())
		// A freshly placed spline's gizmo shows on its first vertex right away, same as selectSpline.
		this.reactBridge.setActiveVertexIndex(0)
		this.setActiveTool('select')
	}

	/**
	 * Appends one new vertex to the (single) selected spline's end - extrapolated
	 * GROOM.SPLINE.NEW_VERTEX_OFFSET past its current last vertex along the existing line's direction
	 * (see GroomScene.addVertexToSpline) - and activates it right away, same as addSplineAt does for
	 * a freshly placed spline's vertex 0. A no-op while zero or multiple splines are selected -
	 * extrapolation is only well-defined for one spline's own end.
	 */
	public addVertexToSelectedSpline(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		if (selectedObjectIds.size !== 1) {
			return
		}
		const splineId = [...selectedObjectIds][0]
		const command = new AddSplineVertexCommand(this.project.scene, splineId)
		this.executeCommand(command)
		this.reactBridge.setActiveVertexIndex(command.getVertexIndex())
	}

	/**
	 * Arms "add point" mode (AddPointButton's click) - the next click in the viewport commits a new
	 * vertex at the clicked point (see AddSplineVertexInteractionHandler/commitAddVertexAt) and
	 * returns to the select tool, same two-click shape as PlaceSplineTool. A no-op while zero or
	 * multiple splines are selected, same guard as addVertexToSelectedSpline. Captures the spline's
	 * current extrapolated next-vertex position (the same point AddPointButton itself sits on) as
	 * addVertexAnchorPosition - the commit raycast anchors to a plane through this point rather than
	 * the scalp/ground, so the placed point lands at the depth the user is looking at, not wherever a
	 * sphere/ground raycast happens to hit.
	 */
	public beginAddVertexToSelectedSpline(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		if (selectedObjectIds.size !== 1) {
			return
		}
		const splineId = [...selectedObjectIds][0]
		const anchorPosition = this.project.scene.get(splineId)?.getNextVertexPosition() ?? null
		if (!anchorPosition) {
			return
		}
		this.addVertexAnchorPosition = anchorPosition
		this.setActiveTool('addVertex')
	}

	/** beginAddVertexToSelectedSpline's captured anchor point - read by AddSplineVertexInteractionHandler, null outside "add point" mode. */
	public getAddVertexAnchorPosition(): Vector3Data | null {
		return this.addVertexAnchorPosition
	}

	/** Leaves "add point" mode without committing a vertex - see beginAddVertexToSelectedSpline. Used by AddSplineVertexInteractionHandler when its click can't resolve to a point, and by GroomViewport when a click lands outside the viewport entirely. A no-op once the gesture already committed (or was never armed), since that already returns to 'select'. */
	public cancelAddVertexToSelectedSpline(): void {
		if (this.reactBridge.getState().activeTool !== 'addVertex') {
			return
		}
		this.setActiveTool('select')
		// Commit resyncs every viewport from the persisted model anyway (executeCommand's
		// affectsProject() branch) - a cancel never touches the model, so it must do that resync
		// itself, to clear whatever temporary vertex AddSplineVertexPreviewInteractionHandler's Hover
		// preview last appended to the live mesh.
		this.syncScene()
	}

	/**
	 * Commits "add point" mode's placed vertex - appends it to `splineId`'s end at `position` (unlike
	 * addVertexToSelectedSpline's fixed extrapolated offset, this is wherever the second click landed
	 * - see AddSplineVertexInteractionHandler), activates its gizmo, and returns to the select tool.
	 */
	public commitAddVertexAt(splineId: string, position: Vector3Data): void {
		const command = new AppendSplineVertexAtCommand(this.project.scene, splineId, position)
		this.executeCommand(command)
		this.reactBridge.setActiveVertexIndex(command.getVertexIndex())
		this.setActiveTool('select')
	}

	/**
	 * Splits `splineId`'s curve at the point nearest `point` (see GroomScene.insertVertexNearPoint),
	 * inserting a new vertex there and activating its gizmo right away - see
	 * SplineSelectionInteractionHandler's click-on-the-already-selected-curve-body gesture.
	 */
	public insertVertexAtPoint(splineId: string, point: Vector3Data): void {
		const command = new InsertSplineVertexCommand(this.project.scene, splineId, point)
		this.executeCommand(command)
		this.reactBridge.setActiveVertexIndex(command.getVertexIndex())
	}

	public setActiveTool(tool: GroomActiveTool): void {
		if (tool !== 'addVertex') {
			this.addVertexAnchorPosition = null
		}
		// reactBridge is updated first - controller.setActiveTool synchronously notifies
		// GroomViewport's tool-changed listener (which restores the cursor by reading
		// reactBridge.getState().activeTool), so that read must already see the new value.
		this.reactBridge.setActiveTool(tool)
		this.controller.setActiveTool(tool)
	}

	/**
	 * Spline click selection, including Shift-toggle for multi-select - mirrors Editor.selectObject.
	 * A single new selection defaults its gizmo to vertex 0 (immediately visible/discoverable);
	 * extending a multi-select (or deselecting) clears the active vertex, since the gizmo only ever
	 * shows while exactly one spline is selected (see SplineVertexGizmo.update).
	 */
	public selectSpline(objectId: string | null, extend: boolean): void {
		if (!extend) {
			this.reactBridge.setSelectedObjectId(objectId)
			this.reactBridge.setActiveVertexIndex(objectId ? 0 : null)
			return
		}
		if (!objectId) {
			return
		}
		this.reactBridge.toggleSelectedObjectId(objectId)
		this.reactBridge.setActiveVertexIndex(null)
	}

	/**
	 * Activates one vertex of the currently selected spline - shows its rotate/scale gizmo (see
	 * SplineVertexGizmo). Ephemeral UI state, not undoable. Callers (the position/rotate/scale
	 * handlers' MoveStart, and a plain click on any vertex handle - see SplineSelectionInteractionHandler)
	 * only ever call this for the already-selected spline's own vertices.
	 */
	public setActiveSplineVertex(vertexIndex: number): void {
		this.reactBridge.setActiveVertexIndex(vertexIndex)
	}

	/**
	 * Pushes one completed position/rotate/scale drag of a spline vertex through history - see
	 * SplineVertexDragInteractionHandler, SplineVertexRotateInteractionHandler,
	 * SplineVertexScaleInteractionHandler.
	 */
	public commitTransformSplineVertex(
		splineId: string,
		vertexIndex: number,
		before: SplineVertexTransformSnapshot,
		after: SplineVertexTransformSnapshot
	): void {
		this.executeCommand(new TransformSplineVertexCommand(this.project.scene, splineId, vertexIndex, before, after))
	}

	/** Live-updates a spline's option bundle without pushing undo history - see SplineOptionsPanel's/SplineSmoothModifyPanel's live controls. Resyncs the scene immediately so the curve/card-strip visual reflects the new value as it's edited. */
	public setSplineOptions(splineId: string, options: SplineOptionsSnapshot): void {
		const spline = this.project.scene.get(splineId)
		if (!spline) {
			return
		}
		spline.hairCardId = options.hairCardId
		spline.resolution = options.resolution
		spline.cardWidth = options.cardWidth
		spline.cardStartOffset = options.cardStartOffset
		spline.smoothModifyEnabled = options.smoothModifyEnabled
		spline.influence = options.influence
		this.syncScene()
		this.emitProjectChanged()
	}

	/** Pushes one completed spline-options edit through history - see SplineOptionsPanel and SplineSmoothModifyPanel. */
	public commitSplineOptions(splineId: string, before: SplineOptionsSnapshot, after: SplineOptionsSnapshot): void {
		if (
			before.hairCardId === after.hairCardId &&
			before.resolution === after.resolution &&
			before.cardWidth === after.cardWidth &&
			before.cardStartOffset === after.cardStartOffset &&
			before.smoothModifyEnabled === after.smoothModifyEnabled &&
			before.influence === after.influence
		) {
			return
		}
		this.executeCommand(new SetSplineOptionsCommand(this.project.scene, splineId, before, after))
	}

	/**
	 * Pushes one completed multi-vertex move/rotate/scale-with-falloff drag through history - see
	 * SplineVertexDragInteractionHandler/SplineVertexRotateInteractionHandler/
	 * SplineVertexScaleInteractionHandler's MoveEnd when `smoothModifyEnabled` is on. A sibling to
	 * commitTransformSplineVertex, not a replacement for it - see TransformSplineVerticesCommand.
	 */
	public commitTransformSplineVertices(splineId: string, entries: readonly SplineVertexTransformEntry[]): void {
		if (entries.length === 0) {
			return
		}
		this.executeCommand(new TransformSplineVerticesCommand(this.project.scene, splineId, entries))
	}

	/**
	 * Duplicates the (single) selected spline - see GroomScene.cloneSpline - and selects the clone,
	 * same "select what you just made" shape as addSplineAt. A no-op while zero or multiple splines
	 * are selected, same guard as addVertexToSelectedSpline.
	 */
	public cloneSelectedSpline(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		if (selectedObjectIds.size !== 1) {
			return
		}
		const splineId = [...selectedObjectIds][0]
		const command = new CloneSplineCommand(this.project.scene, splineId)
		this.executeCommand(command)
		this.reactBridge.setSelectedObjectId(command.getObjectId())
		this.reactBridge.setActiveVertexIndex(0)
	}

	/** Removes every selected spline, then clears the UI selection. */
	public deleteSelected(): void {
		const objectIds = [...this.reactBridge.getState().selectedObjectIds]
		if (objectIds.length === 0) {
			return
		}
		this.executeCommand(new DeleteSplineObjectsCommand(this.project.scene, objectIds))
		this.reactBridge.setSelectedObjectId(null)
		this.reactBridge.setActiveVertexIndex(null)
	}

	/**
	 * Removes the (single) selected spline's active vertex - see GroomToolbar's "Delete point"
	 * button. A no-op while zero/multiple splines are
	 * selected, no vertex is active, or the spline is already at GROOM.SPLINE.MIN_VERTEX_COUNT (a
	 * spline needs at least 2 vertices to remain a meaningful curve). Clamps the active vertex back
	 * into range afterward rather than clearing it, so the gizmo stays visible on a neighboring
	 * vertex instead of disappearing.
	 */
	public deleteActiveSplineVertex(): void {
		const { selectedObjectIds, activeVertexIndex } = this.reactBridge.getState()
		if (selectedObjectIds.size !== 1 || activeVertexIndex === null) {
			return
		}
		const splineId = [...selectedObjectIds][0]
		const spline = this.project.scene.get(splineId)
		if (!spline || spline.vertices.length <= GROOM.SPLINE.MIN_VERTEX_COUNT) {
			return
		}
		this.executeCommand(new DeleteSplineVertexCommand(this.project.scene, splineId, activeVertexIndex))
		this.reactBridge.setActiveVertexIndex(Math.min(activeVertexIndex, spline.vertices.length - 1))
	}

	/**
	 * Switches the viewport's render style - see GroomReactBridge.setViewMode/GroomViewport.render.
	 * Not undoable (like activeTool), but persisted to `projects.groomViewMode` (see
	 * serializeProject/loadProject) - emits a project-changed notification so
	 * useGroomProjectPersistence's dirty tracking/autosave picks it up like any other edit.
	 */
	public setViewMode(viewMode: GroomViewMode): void {
		if (viewMode === this.reactBridge.getState().viewMode) {
			return
		}
		this.reactBridge.setViewMode(viewMode)
		this.emitProjectChanged()
	}

	public undo(): void {
		const command = this.controller.history.undo()
		if (command?.affectsProject()) {
			this.syncScene()
			this.emitProjectChanged()
		}
	}

	public redo(): void {
		const command = this.controller.history.redo()
		if (command?.affectsProject()) {
			this.syncScene()
			this.emitProjectChanged()
		}
	}

	public dispose(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId)
		}
		this.viewports.forEach((viewport) => viewport.dispose())
		this.viewports.length = 0
		this.controller.dispose()
	}

	/** Frames the entire groom scene in every viewport. */
	public frameAll(): void {
		this.viewports.forEach((viewport) => viewport.frameAll())
	}

	/** Fans the groom scene out to every viewport - see GroomEditor.syncScene's object-editor equivalent, Editor.syncScene. */
	private syncScene(): void {
		const items = this.project.scene.toJSON()
		this.viewports.forEach((viewport) => viewport.syncSplineObjects(items))
	}

	private executeCommand(command: EditorCommand): void {
		this.controller.history.execute(command)
		if (command.affectsProject()) {
			this.syncScene()
			this.emitProjectChanged()
		}
	}

	private emitProjectChanged(): void {
		this.projectChangeListeners.forEach((listener) => listener())
	}

	private readonly animate = (): void => {
		this.animationFrameId = requestAnimationFrame(this.animate)
		this.viewports.forEach((viewport) => viewport.render())
	}
}
