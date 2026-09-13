import { EDITOR_SCENE_COLORS, EditorTheme, HAIR_CARD } from '@/constants'
import { HairCardStrandsController } from '@/editor/main/HairCardStrandsController'
import { HairCardBaker } from '@/lib/hair/bake/HairCardBaker'
import { HistoryController } from '@/editor/main/HistoryController'
import { ModeController } from '@/editor/main/modes/ModeController'
import { ObjectMode } from '@/editor/main/modes/ObjectMode'
import {
	BufferGeometry,
	DoubleSide,
	Float32BufferAttribute,
	LineBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
} from 'three'

// A hair's-width in front of z = 0, same reasoning as WorkingAreaGrid's own offset - avoids
// z-fighting the outline against GridHelper/WorkingAreaGrid's own lines at the same depth.
const HAIR_CARD_OUTLINE_Z_OFFSET = 0.0015

/** Runtime entry point for editor modes and the shared hair-card primitives. Not scene-aware: each Viewport owns its own scene and builds its own meshes from Project.scene data. */
export class EditorController {
	/** The single history owner for all persistent editor-runtime mutations. */
	public readonly history: HistoryController = new HistoryController()

	public readonly modeController: ModeController

	public readonly objectMode: ObjectMode = new ObjectMode()

	// Shared across every viewport's hair card meshes - a single material keeps every card in sync,
	// so setTheme recolors every card everywhere at once. Lies naturally in the z = 0 plane -
	// PlaneGeometry's default orientation (normal +Z, width along X, depth along Y) already matches,
	// so no rotation is needed (cards aren't rotatable) - see docs/editor/hair-cards-plan.md. Double-sided since it's
	// only ever a zero-thickness plane. This mesh doubles as the card's selection collider (see
	// SelectionInteractionHandler, HairCardMoveInteractionHandler) - fully invisible
	// (HAIR_CARD.COLLIDER_OPACITY) since it's a pick target only; the card's visible unselected-state
	// rectangle is hairCardOutlineGeometry/Material below instead.
	public readonly hairCardGeometry: PlaneGeometry = new PlaneGeometry(1, 1)

	public readonly hairCardMaterial: MeshStandardMaterial = new MeshStandardMaterial({
		name: 'hairCardMaterial',
		side: DoubleSide,
		transparent: true,
		opacity: HAIR_CARD.COLLIDER_OPACITY,
	})

	// A card's always-on unselected-state visual: a muted rectangle-frame outline (see Viewport's
	// createHairCardMesh), rather than a filled plane, so the card reads as a footprint rather than a
	// solid surface. Defined directly in the card's local XY plane (edges at +/-0.5, matching
	// hairCardGeometry's own footprint), since it's parented under the card mesh and so shares its
	// already-flat local space - no rotation of its own needed. A single closed loop (five points,
	// first repeated last), same convention as WorkingAreaGrid.
	public readonly hairCardOutlineGeometry: BufferGeometry = new BufferGeometry().setAttribute(
		'position',
		new Float32BufferAttribute(
			[
				-0.5, -0.5, HAIR_CARD_OUTLINE_Z_OFFSET, 0.5, -0.5, HAIR_CARD_OUTLINE_Z_OFFSET, 0.5, 0.5,
				HAIR_CARD_OUTLINE_Z_OFFSET, -0.5, 0.5, HAIR_CARD_OUTLINE_Z_OFFSET, -0.5, -0.5,
				HAIR_CARD_OUTLINE_Z_OFFSET,
			],
			3
		)
	)

	public readonly hairCardOutlineMaterial: LineBasicMaterial = new LineBasicMaterial({
		name: 'hairCardOutlineMaterial',
	})

	/** Owns every hair card's generated strand geometry - see the class doc. Shared across viewports, same as hairCardGeometry above. */
	public readonly hairCardStrands: HairCardStrandsController = new HairCardStrandsController()

	/** Renders every card's current strands into shared atlas maps - see Editor.bakeHairCards. Owns a WebGLRenderer, expensive to construct, so it's built once here rather than per bake. */
	public readonly hairCardBaker: HairCardBaker = new HairCardBaker()

	// Shared across every viewport's hair card strand meshes. A fixed hair color rather than
	// EDITOR_SCENE_COLORS.object, since generated hair shouldn't flip color with the editor's
	// light/dark theme. Double-sided for the same reason as hairCardGeometry: thin
	// tube geometry read from a low grazing angle should still shade both ways.
	public readonly hairCardStrandMaterial: MeshStandardMaterial = new MeshStandardMaterial({
		name: 'hairCardStrandMaterial',
		color: HAIR_CARD.STRAND.COLOR,
		side: DoubleSide,
	})

	private theme: EditorTheme = 'dark'

	public constructor() {
		this.modeController = new ModeController({ controller: this })
		this.modeController.registerMode(this.objectMode)
		this.modeController.activateMode(ObjectMode.ID)
	}

	public setTheme(theme: EditorTheme): void {
		this.theme = theme
		this.hairCardMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].object)
		this.hairCardOutlineMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].hairCardOutline)
	}

	public getTheme(): EditorTheme {
		return this.theme
	}

	public dispose(): void {
		this.hairCardGeometry.dispose()
		this.hairCardMaterial.dispose()
		this.hairCardOutlineGeometry.dispose()
		this.hairCardOutlineMaterial.dispose()
		this.hairCardStrands.dispose()
		this.hairCardStrandMaterial.dispose()
		this.hairCardBaker.dispose()
	}
}
