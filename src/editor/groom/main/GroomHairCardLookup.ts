import { BAKE } from '@/constants'
import { SceneObjectData } from '@/editor/main/Project'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { computeHairCardLayoutHash } from '@/lib/hair/bake/HairCardLayoutHash'
import { HairCardBakeStatus, HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'

const DEFAULT_PREVIEW_COLORS: HairPreviewColors = {
	primary: BAKE.PREVIEW_COLORS.DEFAULT_PRIMARY,
	secondary: BAKE.PREVIEW_COLORS.DEFAULT_SECONDARY,
	tip: BAKE.PREVIEW_COLORS.DEFAULT_TIP,
	root: BAKE.PREVIEW_COLORS.DEFAULT_ROOT,
}

/**
 * A hair card's own sub-rectangle within the shared 0-1 atlas working area (see
 * HairCardBakeOrthographicCamera) - `xMin`/`xMax` from the card's width axis (world/atlas X),
 * `yMin`/`yMax` from its depth axis (world/atlas Y). The working area's camera is a symmetric ortho
 * projection of the exact 0-1 square onto the full 0-1 image, so a card's world X/Y bounds ARE its
 * atlas UV bounds directly, no extra transform needed.
 */
export interface HairCardUvRect {
	xMin: number
	xMax: number
	yMin: number
	yMax: number
}

/** Fallback rect for a spline with no `hairCardId` (or one referencing a deleted/unknown card) - the whole atlas image, same as this lookup's pre-per-card behavior. */
const FULL_UV_RECT: HairCardUvRect = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }

/**
 * The cross-project hair-card data the groom editor's 3D runtime needs at render time: the
 * object-editor project's latest baked texture atlas maps (for "textured" view mode), and each hair
 * card's own placement rect within that shared atlas (so a spline's card strip samples only the
 * portion of the atlas its referenced card occupies, not the whole image) - see GroomEditor.loadProject.
 * Deliberately excludes hair-card `width` from driving the STRIP's physical size - a card strip's
 * size is the spline's own `cardWidth` field (SplineObject.cardWidth), never derived from whichever
 * hair card `hairCardId` references; picking a card only ever changes the strip's UVs/texture, see
 * SplineCardStripGeometryGenerator/SplineBodyGeometry. Deliberately separate from
 * useHairCardOptions.ts, which is the React-layer equivalent used only to populate
 * SplineOptionsPanel's dropdown (label/id pairs) - this class is consumed by
 * GroomViewport/SplineBodyGeometry, plain TypeScript with no React dependency.
 */
export class GroomHairCardLookup {
	private bakedMaps: Partial<Record<BakeMapKind, { url: string }>> = {}

	private uvRectsById: Map<string, HairCardUvRect> = new Map()

	private bakedMapsSceneHash: string | null = null

	private currentSceneHash: string | null = null

	private previewColors: HairPreviewColors = DEFAULT_PREVIEW_COLORS

	/**
	 * Replaces the lookup's contents from a freshly loaded project payload - see
	 * GroomEditor.loadProject. `bakedMaps` is the OTHER (object editor) project's latest baked maps
	 * (see the `projects.bakedMaps` column) - optional since a groom project row predating this
	 * feature (or one whose object editor half has never been touched) may not have it. `scene` is
	 * that same project's object scene (`projects.scene`) - each `hairCard` item's `position`/`width`/
	 * `depth` is exactly what HairCardBaker placed it at in the shared atlas (see Editor.bakeHairCards),
	 * so its UV rect is derived the same way here, never baked/persisted separately. `bakedMapsSceneHash`/
	 * `previewColors` are the same row's `bakedMapsSceneHash`/`previewColors` columns - see
	 * getBakeStatus/getPreviewColors.
	 */
	public setFromProject(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>> | undefined,
		scene: readonly SceneObjectData[] | undefined,
		bakedMapsSceneHash: string | null | undefined,
		previewColors: HairPreviewColors | undefined
	): void {
		this.bakedMaps = bakedMaps ?? {}
		const hairCards = (scene ?? []).filter((object) => object.type === 'hairCard')
		this.uvRectsById = new Map(
			hairCards.map((card) => [
				card.id,
				{
					xMin: card.position.x - card.width / 2,
					xMax: card.position.x + card.width / 2,
					yMin: card.position.y - card.depth / 2,
					yMax: card.position.y + card.depth / 2,
				},
			])
		)
		this.bakedMapsSceneHash = bakedMapsSceneHash ?? null
		this.currentSceneHash = computeHairCardLayoutHash(hairCards)
		this.previewColors = previewColors ?? DEFAULT_PREVIEW_COLORS
	}

	public getBakedMaps(): Partial<Record<BakeMapKind, { url: string }>> {
		return this.bakedMaps
	}

	/** HairCardBakeDialog's 4 color pickers, from the same project row - see HairCardPreviewMapComposer. */
	public getPreviewColors(): HairPreviewColors {
		return this.previewColors
	}

	/**
	 * 'missing' when `alpha` hasn't been baked (see HairCardPreviewMapComposer's own gate - matches
	 * it exactly, so "can compose a preview" and "isn't missing" are the same check; `color` isn't
	 * required, same as the composer - "Textured" and "Preview" are now the same merged view mode,
	 * both driven by the composed preview material, see GroomEditorController.ensureCardStripPreviewMap);
	 * 'stale' when it has, but the hair-card layout has since changed (a null `bakedMapsSceneHash` -
	 * a bake predating this feature - is never treated as stale, only a concrete mismatch is);
	 * 'fresh' otherwise. Drives GroomStatusBar's warning.
	 */
	public getBakeStatus(): HairCardBakeStatus {
		if (!this.bakedMaps.alpha?.url) {
			return 'missing'
		}
		if (this.bakedMapsSceneHash && this.bakedMapsSceneHash !== this.currentSceneHash) {
			return 'stale'
		}
		return 'fresh'
	}

	/** A spline's referenced card's atlas rect, or the whole image for no/unknown `hairCardId` - see SplineCardStripGeometryGenerator. */
	public getCardUvRect(hairCardId: string | null): HairCardUvRect {
		if (!hairCardId) {
			return FULL_UV_RECT
		}
		return this.uvRectsById.get(hairCardId) ?? FULL_UV_RECT
	}
}
