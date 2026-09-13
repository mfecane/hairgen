import { EDITOR_SCENE_COLORS, EDITOR_VIEWPORT, EditorTheme, HAIR_CARD } from '@/constants'
import { Box3, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Vector3 } from 'three'

// A hair's-width in front of z = 0 so the border doesn't z-fight the inner subdivision lines
// (drawn at z = 0) where they meet along the outer edge.
const BORDER_Z_OFFSET = 0.001

/**
 * Custom grid mesh spanning the 0-1 square hair cards are laid out inside (see
 * HairCardWorkingArea's clamp helpers, which enforce this same square on move/resize) - replaces
 * three's default GridHelper and a separate bounds-preview square with a single mesh: an accented
 * border marking the working area's edge, plus muted inner subdivision lines
 * (EDITOR_VIEWPORT.GRID_DIVISIONS x itself) for scale reference. Purely a reference guide - not
 * pickable, not part of Project.scene, never rebuilt after construction since the working area's
 * bounds are fixed (HAIR_CARD.WORKING_AREA_MIN/MAX).
 */
export class WorkingAreaGrid {
	/** Accented outline of the working area's outer edge. */
	public readonly border: LineSegments

	/** Muted subdivision lines inside the working area. */
	public readonly innerLines: LineSegments

	/** The working area's bounds at z = 0 - Viewport.frameAll unions this into what it frames, so a viewport always opens framing at least the working area, even in an empty scene. */
	public readonly box: Box3

	private readonly borderMaterial: LineBasicMaterial

	private readonly innerMaterial: LineBasicMaterial

	public constructor() {
		const { WORKING_AREA_MIN: min, WORKING_AREA_MAX: max } = HAIR_CARD
		this.box = new Box3(new Vector3(min, min, 0), new Vector3(max, max, 0))

		const borderGeometry = new BufferGeometry()
		borderGeometry.setAttribute('position', new Float32BufferAttribute(this.buildBorderPositions(min, max), 3))
		this.borderMaterial = new LineBasicMaterial({ color: EDITOR_SCENE_COLORS.dark.workingArea })
		this.border = new LineSegments(borderGeometry, this.borderMaterial)
		this.border.name = 'workingAreaGridBorder'
		// Reference-only, like the old GridHelper/WorkingAreaHelper it replaces - never a pick target.
		this.border.raycast = () => {}

		const innerGeometry = new BufferGeometry()
		innerGeometry.setAttribute('position', new Float32BufferAttribute(this.buildInnerLinePositions(min, max), 3))
		this.innerMaterial = new LineBasicMaterial({ color: EDITOR_SCENE_COLORS.dark.grid })
		this.innerLines = new LineSegments(innerGeometry, this.innerMaterial)
		this.innerLines.name = 'workingAreaGridInner'
		this.innerLines.raycast = () => {}
	}

	public setTheme(theme: EditorTheme): void {
		this.borderMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].workingArea)
		this.innerMaterial.color.setHex(EDITOR_SCENE_COLORS[theme].grid)
	}

	public dispose(): void {
		this.border.geometry.dispose()
		this.borderMaterial.dispose()
		this.innerLines.geometry.dispose()
		this.innerMaterial.dispose()
	}

	/** The four edges of the working area square, as line segments so they share LineSegments' draw mode with the inner grid. */
	private buildBorderPositions(min: number, max: number): number[] {
		return [
			min, min, BORDER_Z_OFFSET, max, min, BORDER_Z_OFFSET,
			max, min, BORDER_Z_OFFSET, max, max, BORDER_Z_OFFSET,
			max, max, BORDER_Z_OFFSET, min, max, BORDER_Z_OFFSET,
			min, max, BORDER_Z_OFFSET, min, min, BORDER_Z_OFFSET,
		]
	}

	/** Interior subdivision lines only, GRID_DIVISIONS x GRID_DIVISIONS cells - the outer edge is the border, built separately above. */
	private buildInnerLinePositions(min: number, max: number): number[] {
		const { GRID_DIVISIONS: divisions } = EDITOR_VIEWPORT
		const size = max - min
		const positions: number[] = []
		for (let i = 1; i < divisions; i++) {
			const position = min + (size * i) / divisions
			positions.push(position, min, 0, position, max, 0) // vertical line
			positions.push(min, position, 0, max, position, 0) // horizontal line
		}
		return positions
	}
}
