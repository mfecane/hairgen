import { EditorTheme } from '@/constants'
import { EditorCommand } from '@/editor/main/EditorCommand'
import { EditorController } from '@/editor/main/EditorController'
import {
	AddHairCardCommand,
	AddHairCardModifierCommand,
	DeleteObjectsCommand,
	HairCardMoveSnapshot,
	HairCardResizeSnapshot,
	HairCardStrandSettingsSnapshot,
	MoveHairCardCommand,
	RemoveHairCardModifierCommand,
	ReorderHairCardModifierCommand,
	ResizeHairCardCommand,
	SetHairCardModifierCommand,
	SetHairCardStrandSettingsCommand,
} from '@/editor/main/commands/SceneCommands'
import { Project, SceneObjectData } from '@/editor/main/Project'
import { ReactBridge } from '@/editor/main/ReactBridge'
import { Viewport } from '@/editor/main/Viewport'
import { BakedMapsRecord, HairCardBakeProgress, HairCardBakeRequest, HairCardBakeResult } from '@/lib/hair/bake/HairCardBakeTypes'
import { computeHairCardLayoutHash } from '@/lib/hair/bake/HairCardLayoutHash'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import { HairCardModifier, HairCardModifierType } from '@/lib/hair/modifiers/HairCardModifier'

type ProjectChangeListener = () => void

/**
 * Root object - owns Project, controller, ReactBridge, and any number of Viewports. Each Viewport
 * owns its own scene/camera/renderer/controls/interaction system - see Viewport - so nothing 3D is
 * shared between them; Editor's job is to keep every viewport's scene object meshes in sync with
 * Project.scene (see syncScene) and to route commands through the shared HistoryController.
 */
export class Editor {
	public readonly project: Project

	public readonly controller: EditorController

	public readonly reactBridge: ReactBridge = new ReactBridge()

	public readonly viewports: Viewport[] = []

	private readonly projectChangeListeners: Set<ProjectChangeListener> = new Set()

	private animationFrameId: number | null = null

	public constructor(theme: EditorTheme = 'dark') {
		this.project = new Project()
		this.controller = new EditorController()
		this.controller.setTheme(theme)
		this.animate()
	}

	public setTheme(theme: EditorTheme): void {
		this.controller.setTheme(theme)
		this.viewports.forEach((viewport) => viewport.setTheme(theme))
	}

	public createViewport(mountElement: HTMLElement): Viewport {
		const viewport = new Viewport(this, mountElement)
		this.viewports.push(viewport)
		viewport.syncSceneObjects(this.project.scene.toJSON())
		viewport.frameAll()
		return viewport
	}

	public removeViewport(viewport: Viewport): void {
		const index = this.viewports.indexOf(viewport)
		if (index === -1) {
			return
		}
		viewport.dispose()
		this.viewports.splice(index, 1)
	}

	/** Replaces the session's project with a persisted one (see the `projects` table's `scene`/`thickness`/`previewColors`/`bakeOptions`/`bakedMaps`/`bakedMapsSceneHash` columns). `previewColors`/`bakeOptions`/`bakedMaps`/`bakedMapsSceneHash` are optional so a row saved before those features existed still loads, falling back to Project's own defaults. */
	public loadProject(project: {
		id: string
		name: string
		scene: SceneObjectData[]
		thickness: number
		previewColors?: HairPreviewColors
		bakeOptions?: HairCardBakeRequest
		bakedMaps?: BakedMapsRecord
		bakedMapsSceneHash?: string | null
	}): void {
		this.project.id = project.id
		this.project.name = project.name
		this.project.scene.replaceAll(project.scene)
		this.project.thickness = project.thickness
		if (project.previewColors) {
			this.project.previewColors = project.previewColors
		}
		if (project.bakeOptions) {
			this.project.bakeOptions = project.bakeOptions
		}
		if (project.bakedMaps) {
			this.project.bakedMaps = project.bakedMaps
		}
		if (project.bakedMapsSceneHash !== undefined) {
			this.project.bakedMapsSceneHash = project.bakedMapsSceneHash
		}
		this.controller.history.clear()
		this.syncScene()
		this.refreshHairCardStrands()
		this.emitProjectChanged()
	}

	public addOnProjectChangedListener(listener: ProjectChangeListener): AbortController {
		this.projectChangeListeners.add(listener)
		const controller = new AbortController()
		controller.signal.addEventListener('abort', () => this.projectChangeListeners.delete(listener), { once: true })
		return controller
	}

	/** The current project's persistable form - what a PUT to `/api/projects/[projectId]` saves. */
	public serializeProject(): {
		name: string
		scene: SceneObjectData[]
		thickness: number
		previewColors: HairPreviewColors
		bakeOptions: HairCardBakeRequest
	} {
		return {
			name: this.project.name,
			scene: this.project.scene.toJSON(),
			thickness: this.project.thickness,
			previewColors: this.project.previewColors,
			bakeOptions: this.project.bakeOptions,
		}
	}

	/** Adds a hair card to the scene, selecting it and generating its initial strands - see docs/editor/hair-cards-plan.md. */
	public addHairCard(): void {
		const command = new AddHairCardCommand(this.project.scene)
		this.executeCommand(command)
		const cardId = command.getObjectId()
		this.reactBridge.setSelectedObjectId(cardId)
		const card = this.project.scene.get(cardId)
		if (card) {
			this.controller.hairCardStrands.regenerate(card.toJSON(), this.project.thickness)
		}
	}

	/** Pushes one completed hair-card body drag through history - see HairCardMoveInteractionHandler. */
	public commitMoveHairCard(cardId: string, before: HairCardMoveSnapshot, after: HairCardMoveSnapshot): void {
		this.executeCommand(new MoveHairCardCommand(this.project.scene, cardId, before, after))
	}

	/** Pushes one completed hair-card corner-handle drag through history - see HairCardResizeInteractionHandler. */
	public commitResizeHairCard(cardId: string, before: HairCardResizeSnapshot, after: HairCardResizeSnapshot): void {
		this.executeCommand(new ResizeHairCardCommand(this.project.scene, cardId, before, after))
	}

	/** Live-updates a hair card's strand settings (root spread, coverage, height variance, cut variance) without pushing undo history - see HairCardOptionsPanel's onValueChange. Schedules a debounced regenerate, same as a move/resize drag. */
	public setHairCardStrandSettings(cardId: string, settings: HairCardStrandSettingsSnapshot): void {
		const object = this.project.scene.get(cardId)
		if (!object || object.type !== 'hairCard') {
			return
		}
		object.rootSpread = settings.rootSpread
		object.coverage = settings.coverage
		object.heightVariance = settings.heightVariance
		object.cutVariance = settings.cutVariance
		this.scheduleHairCardStrandsRegenerate(cardId)
	}

	/** Pushes one completed hair-card strand-settings edit through history - see HairCardOptionsPanel's onValueCommit. */
	public commitHairCardStrandSettings(
		cardId: string,
		before: HairCardStrandSettingsSnapshot,
		after: HairCardStrandSettingsSnapshot
	): void {
		if (
			before.rootSpread !== after.rootSpread ||
			before.coverage !== after.coverage ||
			before.heightVariance !== after.heightVariance ||
			before.cutVariance !== after.cutVariance
		) {
			this.executeCommand(new SetHairCardStrandSettingsCommand(this.project.scene, cardId, before, after))
			this.scheduleHairCardStrandsRegenerate(cardId)
		}
	}

	/** Adds a modifier of `type` (with its default params) to the end of a hair card's stack - see HairCardModifierStackPanel's "add modifier" menu. Returns its id so the panel can expand it right away. */
	public addHairCardModifier(cardId: string, type: HairCardModifierType): string {
		const command = new AddHairCardModifierCommand(this.project.scene, cardId, type)
		this.executeCommand(command)
		this.scheduleHairCardStrandsRegenerate(cardId)
		return command.getModifierId()
	}

	/** Removes one modifier from a hair card's stack. */
	public removeHairCardModifier(cardId: string, modifierId: string): void {
		this.executeCommand(new RemoveHairCardModifierCommand(this.project.scene, cardId, modifierId))
		this.scheduleHairCardStrandsRegenerate(cardId)
	}

	/** Pushes one completed drag-and-drop reorder of a hair card's modifier stack through history - see HairCardModifierStackPanel. */
	public reorderHairCardModifiers(cardId: string, beforeOrder: string[], afterOrder: string[]): void {
		if (beforeOrder.join() === afterOrder.join()) {
			return
		}
		this.executeCommand(new ReorderHairCardModifierCommand(this.project.scene, cardId, beforeOrder, afterOrder))
		this.scheduleHairCardStrandsRegenerate(cardId)
	}

	/** Live-updates one modifier's params without pushing undo history - see HairCardModifierParamsFields's onValueChange. Schedules a debounced regenerate, same as a strand-settings drag. */
	public setHairCardModifier(cardId: string, modifier: HairCardModifier): void {
		const object = this.project.scene.get(cardId)
		if (!object || object.type !== 'hairCard') {
			return
		}
		object.modifiers = object.modifiers.map((existing) => (existing.id === modifier.id ? modifier : existing))
		this.scheduleHairCardStrandsRegenerate(cardId)
	}

	/** Pushes one completed modifier params edit (or an enabled toggle) through history - see HairCardModifierParamsFields's onValueCommit / HairCardModifierRow's enabled Switch. */
	public commitHairCardModifier(cardId: string, before: HairCardModifier, after: HairCardModifier): void {
		if (before.enabled === after.enabled && JSON.stringify(before.params) === JSON.stringify(after.params)) {
			return
		}
		this.executeCommand(new SetHairCardModifierCommand(this.project.scene, cardId, before, after))
		this.scheduleHairCardStrandsRegenerate(cardId)
	}

	/**
	 * Live-updates the global strand thickness shared by every hair card (see Project.thickness) and
	 * schedules a debounced regenerate for all of them - same reasoning as
	 * scheduleHairCardStrandsRegenerate, just fanned out to every card instead of one. Not undoable:
	 * unlike rootSpread/coverage/heightVariance this isn't scene data, so there's nothing for
	 * History to track.
	 */
	public setGlobalThickness(thickness: number): void {
		this.project.thickness = thickness
		this.project.scene
			.getItems()
			.filter((object) => object.type === 'hairCard')
			.forEach((card) => this.controller.hairCardStrands.scheduleRegenerate(card.toJSON(), thickness))
		this.emitProjectChanged()
	}

	/** Hides a hair card's strand mesh immediately - see HairCardMoveInteractionHandler/HairCardResizeInteractionHandler at MoveStart. */
	public removeHairCardStrands(cardId: string): void {
		this.controller.hairCardStrands.remove(cardId)
	}

	/** Schedules a debounced strand rebuild for one hair card - see HairCardStrandsController.scheduleRegenerate. */
	public scheduleHairCardStrandsRegenerate(cardId: string): void {
		const card = this.project.scene.get(cardId)
		if (card?.type === 'hairCard') {
			this.controller.hairCardStrands.scheduleRegenerate(card.toJSON(), this.project.thickness)
		}
	}

	/**
	 * Renders every hair card into one texture atlas covering the complete shared working area.
	 * `sceneHash` fingerprints the exact card layout just baked (HairCardLayoutHash) - HairCardBakeDialog
	 * sends it along with the maps themselves so the project row can later tell the groom editor
	 * whether a bake is still current for its cards' present positions (see
	 * GroomHairCardLookup.getBakeStatus).
	 */
	public async bakeHairCards(
		request: HairCardBakeRequest,
		options?: { onProgress?: (progress: HairCardBakeProgress) => void; signal?: AbortSignal }
	): Promise<HairCardBakeResult & { sceneHash: string }> {
		const cards = this.project.scene.getItems().filter((object) => object.type === 'hairCard')
		if (cards.length === 0) {
			throw new Error('Editor.bakeHairCards: the project has no hair cards to bake.')
		}

		const result = await this.controller.hairCardBaker.bake({
			cards: cards.map((card) => {
				const geometry = this.controller.hairCardStrands.getGeometry(card.id)
				if (!geometry) {
					throw new Error(
						`Editor.bakeHairCards: hair card "${card.id}" has no generated strand geometry to bake.`
					)
				}
				return { cardId: card.id, geometry, position: { ...card.position } }
			}),
			seed: this.project.id,
			request,
			...options,
		})
		const sceneHash = computeHairCardLayoutHash(
			cards.map((card) => ({ id: card.id, position: card.position, width: card.width, depth: card.depth }))
		)
		// Updated regardless of whether HairCardBakeDialog goes on to upload the result - the render
		// just produced is current for this exact layout either way, so the dirty badge (see
		// isHairCardsBakeDirty) should clear immediately, even in an unsaved /editor scratch session.
		this.project.bakedMapsSceneHash = sceneHash
		this.emitProjectChanged()
		return { ...result, sceneHash }
	}

	/**
	 * True once a hair card has moved/resized/been added or removed since `Project.bakedMapsSceneHash`
	 * was last set by `bakeHairCards` - mirrors `GroomHairCardLookup.getBakeStatus`'s "stale" rule
	 * (a `null` hash, meaning nothing's baked yet this project/session, is never dirty on its own).
	 * Drives the warning badge `HairCardBakeMapCheckboxCard` shows on an already-baked map in
	 * `HairCardBakeDialog`.
	 */
	public isHairCardsBakeDirty(): boolean {
		if (!this.project.bakedMapsSceneHash) {
			return false
		}
		const cards = this.project.scene.getItems().filter((object) => object.type === 'hairCard')
		return (
			computeHairCardLayoutHash(
				cards.map((card) => ({ id: card.id, position: card.position, width: card.width, depth: card.depth }))
			) !== this.project.bakedMapsSceneHash
		)
	}

	/**
	 * Live-updates the project's 4 preview-map colors (HairCardBakeDialog's color pickers) - see
	 * Project.previewColors/HairCardPreviewMapComposer. Not undoable, same reasoning as
	 * setGlobalThickness: a workspace preference, not scene data, so there's nothing for History to
	 * track.
	 */
	public setPreviewColors(previewColors: HairPreviewColors): void {
		this.project.previewColors = previewColors
		this.emitProjectChanged()
	}

	/**
	 * Live-updates the project's bake dialog options (resolution, per-map checkboxes, per-map option
	 * sliders) - see Project.bakeOptions/HairCardBakeDialog. Not undoable, same reasoning as
	 * setPreviewColors: a workspace preference, not scene data.
	 */
	public setBakeOptions(bakeOptions: HairCardBakeRequest): void {
		this.project.bakeOptions = bakeOptions
		this.emitProjectChanged()
	}

	/**
	 * Merges a bake upload's stored maps into the session's own `Project.bakedMaps` mirror - the
	 * same merge-not-overwrite the bake route applies to the DB row, so a partial re-bake doesn't
	 * drop previously-baked kinds from the dialog's "previously baked" preview either.
	 */
	public setBakedMaps(uploaded: BakedMapsRecord): void {
		this.project.bakedMaps = { ...this.project.bakedMaps, ...uploaded }
		this.emitProjectChanged()
	}

	/** Removes every selected object, then clears the UI selection. */
	public deleteSelected(): void {
		const objectIds = [...this.reactBridge.getState().selectedObjectIds]
		if (objectIds.length === 0) {
			return
		}
		this.executeCommand(new DeleteObjectsCommand(this.project.scene, objectIds))
		this.reactBridge.setSelectedObjectId(null)
	}

	public undo(): void {
		const command = this.controller.history.undo()
		if (command?.affectsProject()) {
			this.syncScene()
			this.refreshHairCardStrands()
			this.emitProjectChanged()
		}
	}

	public redo(): void {
		const command = this.controller.history.redo()
		if (command?.affectsProject()) {
			this.syncScene()
			this.refreshHairCardStrands()
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

	/** Hides the currently selected objects. */
	public hideSelected(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		selectedObjectIds.forEach((objectId) => this.reactBridge.setHidden(objectId, true))
	}

	/** Hides every object except the selected ones. */
	public isolateSelected(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		if (selectedObjectIds.size === 0) {
			return
		}
		const hidden = new Set(
			this.project.scene
				.getItems()
				.map((object) => object.id)
				.filter((id) => !selectedObjectIds.has(id))
		)
		this.reactBridge.replaceHiddenIdentifiers(hidden)
	}

	public showAll(): void {
		this.reactBridge.showAll()
	}

	/** Frames the currently selected objects in every viewport. */
	public frameSelected(): void {
		const { selectedObjectIds } = this.reactBridge.getState()
		this.viewports.forEach((viewport) => viewport.frameSelected(selectedObjectIds))
	}

	/** Object click selection, including Shift-toggle for multi-select. */
	public selectObject(objectId: string | null, extend: boolean): void {
		if (!extend) {
			this.reactBridge.setSelectedObjectId(objectId)
			return
		}
		if (!objectId) {
			return
		}
		this.reactBridge.toggleSelectedObjectId(objectId)
	}

	/** Frames the entire scene in every viewport (see View menu). */
	public frameAll(): void {
		this.viewports.forEach((viewport) => viewport.frameAll())
	}

	/** Fans the project's scene out to every viewport - see Viewport.syncSceneObjects. */
	private syncScene(): void {
		const items = this.project.scene.toJSON()
		this.viewports.forEach((viewport) => viewport.syncSceneObjects(items))
		const hairCardIds = new Set(items.filter((item) => item.type === 'hairCard').map((item) => item.id))
		this.controller.hairCardStrands.removeStale(hairCardIds)
	}

	/** Immediately rebuilds every hair card's strand mesh - used after undo/redo/load, where a generic command doesn't say which card's shape (if any) changed, so every one is refreshed rather than tracking that down per command type. */
	private refreshHairCardStrands(): void {
		this.project.scene
			.getItems()
			.filter((object) => object.type === 'hairCard')
			.forEach((card) => this.controller.hairCardStrands.regenerate(card.toJSON(), this.project.thickness))
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
