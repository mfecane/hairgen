import { EditorCommand } from '@/editor/main/EditorCommand'
import { Vector3Data } from '@/editor/main/Project'
import { GroomScene, SplineObjectData, SplineVertex, SplineVertexData } from '@/editor/groom/main/GroomProject'

/** One placed spline - see GroomScene.addSpline. Mirrors AddHairCardCommand's lazy-capture-then-restore shape. */
export class AddSplineCommand implements EditorCommand {
	private data: SplineObjectData | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly atPosition: Vector3Data,
		private readonly normal: Vector3Data | null = null
	) {}

	public execute(): void {
		if (this.data) {
			this.scene.restore(this.data)
			return
		}
		this.data = this.scene.addSpline(this.atPosition, this.normal).toJSON()
	}

	public undo(): void {
		if (!this.data) {
			throw new Error('AddSplineCommand.undo: command has not been executed')
		}
		this.scene.remove(this.data.id)
	}

	public affectsProject(): boolean {
		return true
	}

	public getObjectId(): string {
		if (!this.data) {
			throw new Error('AddSplineCommand.getObjectId: command has not been executed')
		}
		return this.data.id
	}
}

/** One duplicated spline - see GroomScene.cloneSpline. Mirrors AddSplineCommand's lazy-capture-then-restore shape exactly, the only difference being the source spline id it clones from instead of a placement position. */
export class CloneSplineCommand implements EditorCommand {
	private data: SplineObjectData | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly sourceSplineId: string
	) {}

	public execute(): void {
		if (this.data) {
			this.scene.restore(this.data)
			return
		}
		this.data = this.scene.cloneSpline(this.sourceSplineId).toJSON()
	}

	public undo(): void {
		if (!this.data) {
			throw new Error('CloneSplineCommand.undo: command has not been executed')
		}
		this.scene.remove(this.data.id)
	}

	public affectsProject(): boolean {
		return true
	}

	public getObjectId(): string {
		if (!this.data) {
			throw new Error('CloneSplineCommand.getObjectId: command has not been executed')
		}
		return this.data.id
	}
}

/**
 * One appended vertex on an existing spline's end - see GroomScene.addVertexToSpline/
 * GroomEditor.addVertexToSelectedSpline. Mirrors AddSplineCommand's lazy-capture-then-restore shape:
 * the extrapolated position/direction/scale is computed once, on the first execute(), then simply
 * replayed on any later redo rather than re-extrapolated (which could drift if the spline's other
 * vertices have since changed). Undo always pops the spline's now-last vertex - since this command
 * only ever appends, that's always the same one it added, regardless of intervening non-history
 * state.
 */
export class AddSplineVertexCommand implements EditorCommand {
	private vertexData: SplineVertexData | null = null

	private vertexIndex: number | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string
	) {}

	public execute(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`AddSplineVertexCommand.execute: no spline "${this.splineId}"`)
		}
		if (this.vertexData) {
			spline.vertices.push(new SplineVertex(this.vertexData.position, this.vertexData.direction, this.vertexData.scale))
			return
		}
		const vertex = this.scene.addVertexToSpline(this.splineId)
		this.vertexData = vertex.toJSON()
		this.vertexIndex = spline.vertices.length - 1
	}

	public undo(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline || this.vertexIndex === null) {
			throw new Error('AddSplineVertexCommand.undo: command has not been executed')
		}
		spline.vertices.splice(this.vertexIndex, 1)
	}

	public affectsProject(): boolean {
		return true
	}

	/** The new vertex's index, once execute() has run - GroomEditor activates it right away, same as AddSplineCommand.getObjectId's caller. */
	public getVertexIndex(): number {
		if (this.vertexIndex === null) {
			throw new Error('AddSplineVertexCommand.getVertexIndex: command has not been executed')
		}
		return this.vertexIndex
	}
}

/**
 * One vertex appended to an existing spline's end at an explicit position - see
 * GroomScene.appendVertexToSplineAt/GroomEditor.commitAddVertexAt. Mirrors AddSplineVertexCommand's
 * lazy-capture-then-replay shape (a redo simply replays the captured vertex rather than re-deriving
 * it), the only difference being the position is given upfront (the "add point" overlay button's
 * drag-to-place gesture) rather than extrapolated by the command itself.
 */
export class AppendSplineVertexAtCommand implements EditorCommand {
	private vertexData: SplineVertexData | null = null

	private vertexIndex: number | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly position: Vector3Data
	) {}

	public execute(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`AppendSplineVertexAtCommand.execute: no spline "${this.splineId}"`)
		}
		if (this.vertexData) {
			spline.vertices.push(new SplineVertex(this.vertexData.position, this.vertexData.direction, this.vertexData.scale))
			return
		}
		const vertex = this.scene.appendVertexToSplineAt(this.splineId, this.position)
		this.vertexData = vertex.toJSON()
		this.vertexIndex = spline.vertices.length - 1
	}

	public undo(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline || this.vertexIndex === null) {
			throw new Error('AppendSplineVertexAtCommand.undo: command has not been executed')
		}
		spline.vertices.splice(this.vertexIndex, 1)
	}

	public affectsProject(): boolean {
		return true
	}

	/** The new vertex's index, once execute() has run - GroomEditor activates it right away, same as AddSplineVertexCommand.getVertexIndex's caller. */
	public getVertexIndex(): number {
		if (this.vertexIndex === null) {
			throw new Error('AppendSplineVertexAtCommand.getVertexIndex: command has not been executed')
		}
		return this.vertexIndex
	}
}

/**
 * One vertex inserted into an existing spline's curve at the point nearest a click, splitting
 * whichever segment it landed on - see GroomScene.insertVertexNearPoint/
 * SplineSelectionInteractionHandler's click-on-the-curve-body gesture. Mirrors
 * AddSplineVertexCommand's lazy-capture-then-replay shape: the nearest-point search and
 * direction/scale interpolation only happen once, on the first execute() - a later redo simply
 * re-splices the captured vertex back in at the same index, rather than re-searching (which could
 * land on a different segment if the spline's other vertices have since changed).
 */
export class InsertSplineVertexCommand implements EditorCommand {
	private vertexData: SplineVertexData | null = null

	private index: number | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly point: Vector3Data
	) {}

	public execute(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`InsertSplineVertexCommand.execute: no spline "${this.splineId}"`)
		}
		if (this.vertexData && this.index !== null) {
			spline.vertices.splice(
				this.index,
				0,
				new SplineVertex(this.vertexData.position, this.vertexData.direction, this.vertexData.scale)
			)
			return
		}
		const { vertex, index } = this.scene.insertVertexNearPoint(this.splineId, this.point)
		this.vertexData = vertex.toJSON()
		this.index = index
	}

	public undo(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline || this.index === null) {
			throw new Error('InsertSplineVertexCommand.undo: command has not been executed')
		}
		spline.vertices.splice(this.index, 1)
	}

	public affectsProject(): boolean {
		return true
	}

	/** The new vertex's index, once execute() has run - GroomEditor activates it right away, same as AddSplineVertexCommand.getVertexIndex's caller. */
	public getVertexIndex(): number {
		if (this.index === null) {
			throw new Error('InsertSplineVertexCommand.getVertexIndex: command has not been executed')
		}
		return this.index
	}
}

/**
 * One vertex removed from an existing spline - see GroomEditor.deleteActiveSplineVertex. Mirrors
 * AddSplineVertexCommand's lazy-capture-then-replay shape, inverted: the removed vertex's data is
 * captured once, on the first execute(), then simply spliced back in at the same index on undo -
 * never re-derived, so redo/undo can't drift even if other vertices have since changed. Callers
 * (GroomEditor) are responsible for never dropping a spline below GROOM.SPLINE.MIN_VERTEX_COUNT -
 * this command itself doesn't enforce that floor.
 */
export class DeleteSplineVertexCommand implements EditorCommand {
	private vertexData: SplineVertexData | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly vertexIndex: number
	) {}

	public execute(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`DeleteSplineVertexCommand.execute: no spline "${this.splineId}"`)
		}
		const vertex = spline.vertices[this.vertexIndex]
		if (!vertex) {
			throw new Error(`DeleteSplineVertexCommand.execute: no vertex ${this.vertexIndex} on spline "${this.splineId}"`)
		}
		this.vertexData ??= vertex.toJSON()
		spline.vertices.splice(this.vertexIndex, 1)
	}

	public undo(): void {
		const spline = this.scene.get(this.splineId)
		if (!spline || !this.vertexData) {
			throw new Error('DeleteSplineVertexCommand.undo: command has not been executed')
		}
		spline.vertices.splice(
			this.vertexIndex,
			0,
			new SplineVertex(this.vertexData.position, this.vertexData.direction, this.vertexData.scale)
		)
	}

	public affectsProject(): boolean {
		return true
	}
}

/**
 * One vertex's full editable state - position (drag), direction (rotate gizmo), scale (scale
 * gizmo). Bundled into one snapshot/command, following TransformObjectCommand's precedent (the
 * object editor's Translate/Rotate/Scale tools already share one position+rotation+scale command
 * even though each gesture only changes one field) - simpler than three parallel single-field
 * commands, and undo/redo never has to reason about partially-applied vertex state.
 */
export interface SplineVertexTransformSnapshot {
	position: Vector3Data
	direction: Vector3Data
	scale: number
}

/**
 * One completed position/rotate/scale drag of a spline vertex handle - see
 * SplineVertexDragInteractionHandler, SplineVertexRotateInteractionHandler,
 * SplineVertexScaleInteractionHandler. Each only ever changes one field of the snapshot per
 * gesture, but `apply` always writes all three, same as TransformObjectCommand.
 */
export class TransformSplineVertexCommand implements EditorCommand {
	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly vertexIndex: number,
		private readonly before: SplineVertexTransformSnapshot,
		private readonly after: SplineVertexTransformSnapshot
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: SplineVertexTransformSnapshot): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`TransformSplineVertexCommand: no spline "${this.splineId}"`)
		}
		const vertex = spline.vertices[this.vertexIndex]
		if (!vertex) {
			throw new Error(`TransformSplineVertexCommand: no vertex ${this.vertexIndex} on spline "${this.splineId}"`)
		}
		vertex.position = { ...snapshot.position }
		vertex.direction = { ...snapshot.direction }
		vertex.scale = snapshot.scale
	}
}

/** One vertex's before/after snapshot within a multi-vertex soft-selection gesture - see TransformSplineVerticesCommand. */
export interface SplineVertexTransformEntry {
	vertexIndex: number
	before: SplineVertexTransformSnapshot
	after: SplineVertexTransformSnapshot
}

/**
 * One completed move/rotate/scale drag with soft selection on, touching the dragged vertex plus every
 * neighbor its falloff reached - see SplineVertexDragInteractionHandler/
 * SplineVertexRotateInteractionHandler/SplineVertexScaleInteractionHandler and
 * GroomEditor.commitTransformSplineVertices. A sibling to
 * the single-vertex TransformSplineVertexCommand, not a widened version of it - this codebase
 * already prefers one command class per distinct gesture shape (AddSplineCommand/
 * AddSplineVertexCommand/InsertSplineVertexCommand are three separate classes) over one
 * parameterized class; every transform with soft selection off keeps using
 * TransformSplineVertexCommand entirely unchanged.
 */
export class TransformSplineVerticesCommand implements EditorCommand {
	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly entries: readonly SplineVertexTransformEntry[]
	) {}

	public execute(): void {
		this.entries.forEach((entry) => this.apply(entry.vertexIndex, entry.after))
	}

	public undo(): void {
		this.entries.forEach((entry) => this.apply(entry.vertexIndex, entry.before))
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(vertexIndex: number, snapshot: SplineVertexTransformSnapshot): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`TransformSplineVerticesCommand: no spline "${this.splineId}"`)
		}
		const vertex = spline.vertices[vertexIndex]
		if (!vertex) {
			throw new Error(`TransformSplineVerticesCommand: no vertex ${vertexIndex} on spline "${this.splineId}"`)
		}
		vertex.position = { ...snapshot.position }
		vertex.direction = { ...snapshot.direction }
		vertex.scale = snapshot.scale
	}
}

/**
 * A spline's full editable option bundle - hair-card reference, curve resolution, where the card
 * strip begins, and the smooth-modify falloff settings. Bundled into one snapshot/command for the
 * same reason SplineVertexTransformSnapshot is: SplineOptionsPanel.tsx and
 * SplineSmoothModifyPanel.tsx each edit only a subset of these fields per gesture, but both must
 * always read the OTHER fields live off the spline (not a stale local mirror) before committing -
 * see SplineSmoothModifyPanel's createSnapshot helper for that cross-component gotcha.
 */
export interface SplineOptionsSnapshot {
	hairCardId: string | null
	resolution: number
	cardWidth: number
	cardStartOffset: number
	smoothModifyEnabled: boolean
	influence: number
}

/** One committed edit of a spline's option bundle (hair-card reference, resolution, card-strip settings, smooth-modify settings) - see SplineOptionsPanel/SplineSmoothModifyPanel. */
export class SetSplineOptionsCommand implements EditorCommand {
	public constructor(
		private readonly scene: GroomScene,
		private readonly splineId: string,
		private readonly before: SplineOptionsSnapshot,
		private readonly after: SplineOptionsSnapshot
	) {}

	public execute(): void {
		this.apply(this.after)
	}

	public undo(): void {
		this.apply(this.before)
	}

	public affectsProject(): boolean {
		return true
	}

	private apply(snapshot: SplineOptionsSnapshot): void {
		const spline = this.scene.get(this.splineId)
		if (!spline) {
			throw new Error(`SetSplineOptionsCommand: no spline "${this.splineId}"`)
		}
		spline.hairCardId = snapshot.hairCardId
		spline.resolution = snapshot.resolution
		spline.cardWidth = snapshot.cardWidth
		spline.cardStartOffset = snapshot.cardStartOffset
		spline.smoothModifyEnabled = snapshot.smoothModifyEnabled
		spline.influence = snapshot.influence
	}
}

/** One or more deleted splines - see GroomEditor.deleteSelected. Mirrors DeleteObjectsCommand. */
export class DeleteSplineObjectsCommand implements EditorCommand {
	private items: readonly SplineObjectData[] | null = null

	public constructor(
		private readonly scene: GroomScene,
		private readonly objectIds: readonly string[]
	) {}

	public execute(): void {
		if (!this.items) {
			this.items = this.objectIds.map((objectId) => {
				const object = this.scene.get(objectId)
				if (!object) {
					throw new Error(`DeleteSplineObjectsCommand.execute: object "${objectId}" does not exist`)
				}
				return object.toJSON()
			})
		}
		this.objectIds.forEach((objectId) => this.scene.remove(objectId))
	}

	public undo(): void {
		if (!this.items) {
			throw new Error('DeleteSplineObjectsCommand.undo: command has not been executed')
		}
		this.items.forEach((item) => this.scene.restore(item))
	}

	public affectsProject(): boolean {
		return true
	}
}
