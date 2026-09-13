import { BAKE, HAIR_CARD } from '@/constants'
import { BakedMapsRecord, HairCardBakeRequest } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardModifier } from '@/lib/hair/modifiers/HairCardModifier'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'

export interface Vector3Data {
	x: number
	y: number
	z: number
}

/**
 * The jsonb shape a `SceneObject` is persisted as - see `SceneObject.toJSON`. Every scene object is
 * a hair card (see docs/editor/hair-cards-plan.md); `width`/`depth` size its rectangle, and cards
 * always lie flat in the z = 0 plane, so there's no rotation/scale to persist.
 */
export interface SceneObjectData {
	id: string
	type: 'hairCard'
	position: Vector3Data
	width: number
	depth: number
	/** Fraction in [0, 1] of the card's depth, from its "top" edge, that root positions are sampled within. */
	rootSpread: number
	/** How many individual strands the card generates - i.e. how covered it looks. */
	coverage: number
	/** Fraction in [0, 1] - see HairCardStrandsInput.heightVariance. */
	heightVariance: number
	/** Fraction in [0, 1] - see HairCardStrandsInput.cutVariance. */
	cutVariance: number
	/** Shape modifier stack (twist/noise/clump/braid), in apply order - see HairCardModifierStack. */
	modifiers: HairCardModifier[]
}

// A hair card lies flat in the vertical z = 0 plane itself - see EditorController.hairCardGeometry,
// which already lies in that plane (PlaneGeometry's default orientation) and so needs no rotation to
// match. Centered at (0.5, 0.5) rather than the origin so a default HAIR_CARD.DEFAULT_WIDTH x
// DEFAULT_DEPTH card exactly fills the 0-1 working area (see WorkingAreaGrid) instead of straddling
// its edge.
const DEFAULT_HAIR_CARD_POSITION: Vector3Data = { x: 0.5, y: 0.5, z: 0 }

/**
 * A persistable scene object - the editor model layer's source of truth for a hair card.
 * Deliberately has no reference to any Three.js object; every viewport's meshes and widgets are
 * rebuilt from this data (see Viewport.syncSceneObjects, HairCardWidget.update) rather than the
 * other way around.
 */
export class SceneObject {
	public readonly id: string

	public readonly type: 'hairCard' = 'hairCard'

	public position: Vector3Data

	public width: number

	public depth: number

	public rootSpread: number

	public coverage: number

	public heightVariance: number

	public cutVariance: number

	public modifiers: HairCardModifier[]

	public constructor(
		id: string = crypto.randomUUID(),
		position: Vector3Data = DEFAULT_HAIR_CARD_POSITION,
		width: number = HAIR_CARD.DEFAULT_WIDTH,
		depth: number = HAIR_CARD.DEFAULT_DEPTH,
		rootSpread: number = HAIR_CARD.DEFAULT_ROOT_SPREAD,
		coverage: number = HAIR_CARD.DEFAULT_COVERAGE,
		heightVariance: number = HAIR_CARD.DEFAULT_HEIGHT_VARIANCE,
		cutVariance: number = HAIR_CARD.DEFAULT_CUT_VARIANCE,
		modifiers: HairCardModifier[] = []
	) {
		this.id = id
		this.position = { ...position }
		this.width = width
		this.depth = depth
		this.rootSpread = rootSpread
		this.coverage = coverage
		this.heightVariance = heightVariance
		this.cutVariance = cutVariance
		this.modifiers = modifiers
	}

	public toJSON(): SceneObjectData {
		return {
			id: this.id,
			type: this.type,
			position: { ...this.position },
			width: this.width,
			depth: this.depth,
			rootSpread: this.rootSpread,
			coverage: this.coverage,
			heightVariance: this.heightVariance,
			cutVariance: this.cutVariance,
			modifiers: [...this.modifiers],
		}
	}
}

/** The authoritative scene model: a flat set of objects, each with a stable id. */
export class ProjectScene {
	private readonly objectsById = new Map<string, SceneObject>()

	/** Its rectangle is HAIR_CARD.DEFAULT_WIDTH x HAIR_CARD.DEFAULT_DEPTH, centered on its position - see docs/editor/hair-cards-plan.md. */
	public addHairCard(): SceneObject {
		const object = new SceneObject()
		this.objectsById.set(object.id, object)
		return object
	}

	/** Restores one previously serialized object while preserving its stable id for redo/undo. */
	public restore(data: SceneObjectData): SceneObject {
		if (this.objectsById.has(data.id)) {
			throw new Error(`ProjectScene.restore: object "${data.id}" already exists`)
		}
		const object = new SceneObject(
			data.id,
			data.position,
			data.width,
			data.depth,
			data.rootSpread,
			data.coverage,
			data.heightVariance,
			data.cutVariance,
			data.modifiers
		)
		this.objectsById.set(object.id, object)
		return object
	}

	public remove(objectId: string): void {
		if (!this.objectsById.delete(objectId)) {
			throw new Error(`ProjectScene.remove: no object "${objectId}" exists`)
		}
	}

	public get(objectId: string): SceneObject | null {
		return this.objectsById.get(objectId) ?? null
	}

	public getItems(): readonly SceneObject[] {
		return [...this.objectsById.values()]
	}

	/** The jsonb-persisted form of the scene - see the `projects.scene` column. */
	public toJSON(): SceneObjectData[] {
		return this.getItems().map((object) => object.toJSON())
	}

	/** Replaces the entire scene with previously persisted objects, preserving their ids. */
	public replaceAll(items: readonly SceneObjectData[]): void {
		this.objectsById.clear()
		items.forEach((item) => this.restore(item))
	}
}

/** Runtime-only state for the editor session. Persisted as one row in the `projects` table. */
export class Project {
	public id = 'session'

	public name = 'Untitled'

	public readonly scene = new ProjectScene()

	/**
	 * Global strand thickness shared by every hair card (see HairCardStrandsGenerator,
	 * Editor.setGlobalThickness) - unlike rootSpread/coverage/heightVariance, not a per-card
	 * SceneObjectData field. Persisted alongside id/name by serializeProject/loadProject, like any
	 * other workspace preference.
	 */
	public thickness: number = HAIR_CARD.STRAND.DEFAULT_THICKNESS

	/**
	 * HairCardBakeDialog's 4 color pickers (primary/secondary/tip/root) - see
	 * HairCardPreviewMapComposer for how they're blended with the alpha/id/roots/tips bakes into the
	 * groom editor's "Preview" view mode texture. A workspace preference like `thickness` above, not
	 * scene data, but still persisted per-project (Editor.setPreviewColors/serializeProject/loadProject)
	 * rather than resetting every session - the groom editor reads the same values back from the same
	 * project row (see GroomHairCardLookup).
	 */
	public previewColors: HairPreviewColors = {
		primary: BAKE.PREVIEW_COLORS.DEFAULT_PRIMARY,
		secondary: BAKE.PREVIEW_COLORS.DEFAULT_SECONDARY,
		tip: BAKE.PREVIEW_COLORS.DEFAULT_TIP,
		root: BAKE.PREVIEW_COLORS.DEFAULT_ROOT,
	}

	/**
	 * HairCardBakeDialog's resolution select, per-map checkboxes, and per-map option sliders
	 * (roots/tips scale, id group count) - the same shape `Editor.bakeHairCards` takes as its request.
	 * A workspace preference like `previewColors` above, persisted per-project
	 * (Editor.setBakeOptions/serializeProject/loadProject) so the dialog reopens with the last
	 * selection instead of resetting to defaults every session.
	 */
	public bakeOptions: HairCardBakeRequest = {
		resolution: BAKE.DEFAULT_RESOLUTION,
		alpha: true,
		color: true,
		normal: true,
		ao: false,
		height: false,
		roots: { enabled: false, scale: BAKE.ROOTS.DEFAULT_SCALE },
		tips: { enabled: false, scale: BAKE.TIPS.DEFAULT_SCALE },
		id: { enabled: false, groupCount: BAKE.ID.DEFAULT_GROUP_COUNT },
	}

	/**
	 * The project's latest baked hair-card texture atlas maps (see the `projects.bakedMaps` column) -
	 * read-only from this editor's point of view: written only by `Editor.bakeHairCards`'s upload
	 * (via `Editor.setBakedMaps`) and by `loadProject`, never client-settable through
	 * `serializeProject`/PUT like `previewColors` is. Lets `HairCardBakeDialog` show the last bake's
	 * maps again after a reload, before any new bake happens this session.
	 */
	public bakedMaps: BakedMapsRecord = {}

	/**
	 * Fingerprint (see computeHairCardLayoutHash) of the hair-card layout `bakedMaps` was last baked
	 * from - read-only here too, written by `Editor.bakeHairCards` (every bake, whether or not it's
	 * uploaded) and by `loadProject` from the `projects.bakedMapsSceneHash` column. Compared against
	 * the scene's current layout hash to tell `HairCardBakeMapCheckboxCard` a map has gone stale since
	 * the cards last moved - see `Editor.isHairCardsBakeDirty`. `null` means nothing's been baked yet
	 * this project/session, which is never "dirty" on its own.
	 */
	public bakedMapsSceneHash: string | null = null
}
