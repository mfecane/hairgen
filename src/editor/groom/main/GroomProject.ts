import { GROOM } from '@/constants'
import { Vector3Data } from '@/editor/main/Project'

/** Plain-data lerp, no three.js Vector3 needed - see GroomScene.insertVertexNearPoint. */
function lerpVector3Data(a: Vector3Data, b: Vector3Data, t: number): Vector3Data {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

/**
 * Where GroomScene.addVertexToSpline would place a new vertex, given a spline's current vertex
 * positions - the shared math both that mutating method and the non-mutating
 * SplineObject.getNextVertexPosition (the "add point" DOM overlay's anchor, see AddPointAnchor)
 * need. Extrapolates GROOM.SPLINE.NEW_VERTEX_OFFSET past the last vertex along the direction from
 * its second-to-last vertex, falling back to GROOM.SPLINE.DEFAULT_DIRECTION when there's no earlier
 * vertex to derive a direction from, or the last two are (near-)coincident. Returns null for a
 * spline with no vertices.
 */
function computeNextVertexPosition(positions: readonly Vector3Data[]): Vector3Data | null {
	const last = positions[positions.length - 1]
	if (!last) {
		return null
	}
	const secondToLast = positions[positions.length - 2] ?? null
	const dx = secondToLast ? last.x - secondToLast.x : GROOM.SPLINE.DEFAULT_DIRECTION.x
	const dy = secondToLast ? last.y - secondToLast.y : GROOM.SPLINE.DEFAULT_DIRECTION.y
	const dz = secondToLast ? last.z - secondToLast.z : GROOM.SPLINE.DEFAULT_DIRECTION.z
	const length = Math.hypot(dx, dy, dz)
	const direction = length > 1e-4 ? { x: dx / length, y: dy / length, z: dz / length } : GROOM.SPLINE.DEFAULT_DIRECTION
	return {
		x: last.x + direction.x * GROOM.SPLINE.NEW_VERTEX_OFFSET,
		y: last.y + direction.y * GROOM.SPLINE.NEW_VERTEX_OFFSET,
		z: last.z + direction.z * GROOM.SPLINE.NEW_VERTEX_OFFSET,
	}
}

/**
 * One point on a spline. `direction` is the vertex's orientation - defaults to world up (or the
 * scalp surface normal at placement, see GroomScene.addSpline) and is edited via the rotate gizmo
 * (SplineVertexGizmo/SplineVertexRotateInteractionHandler): rotating it spins it around the
 * spline's tangent at that vertex (see SplineVertexFrame). `scale` is a single scalar, edited via
 * the scale gizmo along `direction`'s (tangent-perpendicular) axis. Both exist so a later
 * card-instancing-along-spline step has an orientation/size to consume per vertex.
 */
export interface SplineVertexData {
	position: Vector3Data
	direction: Vector3Data
	scale: number
}

/**
 * The jsonb shape a `SplineObject` is persisted as - see `SplineObject.toJSON` and the `projects.groom`
 * column. `vertices` is a list, not a fixed 2-tuple - this iteration's place-spline tool always
 * creates exactly 2 (a straight segment), but a spline is inherently "a list of vertices," and
 * multi-point splines are the eventual point of this system (see the groom editor plan).
 */
export interface SplineObjectData {
	id: string
	vertices: SplineVertexData[]
	/** Id of a HairCard in the OTHER (object editor) project's scene to instantiate along this spline - see SplineOptionsPanel. */
	hairCardId: string | null
	/** Curve subdivisions per world unit - see SplineObject.getSubdivisionCountForResolution and SplineOptionsPanel. */
	resolution: number
	/** The card strip's own width (world units) - independent of `hairCardId`, which only ever drives its UVs/texture. See SplineCardStripGeometryGenerator/SplineOptionsPanel. */
	cardWidth: number
	/** Arc-length world units from the curve's own start where the card strip begins - it always ends exactly at the curve's end. See SplineCardStripGeometryGenerator/SplineOptionsPanel. */
	cardStartOffset: number
	/** Whether transforming a spline point also transforms neighboring vertices with a falloff - see SplineSmoothModifyFalloff/SplineSmoothModifyPanel. */
	smoothModifyEnabled: boolean
	/** [0,1] strength of the smooth-modify falloff - see SplineSmoothModifyFalloff. */
	influence: number
}

/**
 * A persistable spline vertex - deliberately has no reference to any Three.js object, same
 * reasoning as `SceneObject` (see Project.ts): every viewport's meshes/widgets are rebuilt from
 * this data rather than the other way around.
 */
export class SplineVertex {
	public position: Vector3Data

	public direction: Vector3Data

	public scale: number

	public constructor(
		position: Vector3Data,
		direction: Vector3Data = GROOM.SPLINE.DEFAULT_VERTEX_DIRECTION,
		scale: number = GROOM.SPLINE.DEFAULT_VERTEX_SCALE
	) {
		this.position = { ...position }
		this.direction = { ...direction }
		this.scale = scale
	}

	public toJSON(): SplineVertexData {
		return { position: { ...this.position }, direction: { ...this.direction }, scale: this.scale }
	}
}

export class SplineObject {
	public readonly id: string

	public vertices: SplineVertex[]

	public hairCardId: string | null

	public resolution: number

	public cardWidth: number

	public cardStartOffset: number

	public smoothModifyEnabled: boolean

	public influence: number

	public constructor(
		id: string = crypto.randomUUID(),
		vertices: SplineVertex[],
		hairCardId: string | null = null,
		resolution: number = GROOM.SPLINE.DEFAULT_RESOLUTION,
		cardWidth: number = GROOM.SPLINE.CARD_STRIP.DEFAULT_WIDTH,
		cardStartOffset: number = GROOM.SPLINE.CARD_STRIP.DEFAULT_START_OFFSET,
		smoothModifyEnabled: boolean = GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_ENABLED,
		influence: number = GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_INFLUENCE
	) {
		this.id = id
		this.vertices = vertices
		this.hairCardId = hairCardId
		this.resolution = resolution
		this.cardWidth = cardWidth
		this.cardStartOffset = cardStartOffset
		this.smoothModifyEnabled = smoothModifyEnabled
		this.influence = influence
	}

	public toJSON(): SplineObjectData {
		return {
			id: this.id,
			vertices: this.vertices.map((vertex) => vertex.toJSON()),
			hairCardId: this.hairCardId,
			resolution: this.resolution,
			cardWidth: this.cardWidth,
			cardStartOffset: this.cardStartOffset,
			smoothModifyEnabled: this.smoothModifyEnabled,
			influence: this.influence,
		}
	}

	/** Sum of consecutive vertex distances - today's always-2-vertex model makes this just the segment length. */
	public getLength(): number {
		let length = 0
		for (let i = 1; i < this.vertices.length; i++) {
			const a = this.vertices[i - 1].position
			const b = this.vertices[i].position
			length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
		}
		return length
	}

	/**
	 * The curve subdivision count for a given resolution (subdivisions per world unit), clamped to
	 * GROOM.SPLINE.MIN/MAX_SUBDIVISIONS - see SplineCurveGeometryGenerator. Takes `resolution`
	 * explicitly rather than always reading `this.resolution` so SplineOptionsPanel can preview a
	 * not-yet-committed value.
	 */
	public getSubdivisionCountForResolution(resolution: number): number {
		return Math.min(
			GROOM.SPLINE.MAX_SUBDIVISIONS,
			Math.max(GROOM.SPLINE.MIN_SUBDIVISIONS, Math.round(this.getLength() * resolution))
		)
	}

	/**
	 * Where GroomScene.addVertexToSpline would place this spline's next vertex, without mutating
	 * anything - see computeNextVertexPosition. Consumed by AddPointAnchor to anchor the "add point"
	 * DOM overlay button to that position before the click actually happens.
	 */
	public getNextVertexPosition(): Vector3Data | null {
		return computeNextVertexPosition(this.vertices.map((vertex) => vertex.position))
	}
}

/** The authoritative groom scene model: a flat set of splines, each with a stable id - mirrors ProjectScene. */
export class GroomScene {
	private readonly objectsById = new Map<string, SplineObject>()

	/**
	 * Places vertex A at `atPosition` and vertex B at a fixed default offset from it (mirrors
	 * ProjectScene.addHairCard's fixed default rectangle) - see the "Single click, fixed-length
	 * default" placement UX in the groom editor plan. When `normal` is given (the scalp surface
	 * normal at the placement point - see PlaceSplineInteractionHandler), the spline extends along
	 * it instead of GROOM.SPLINE.DEFAULT_DIRECTION, and both vertices' (store-only) `direction`
	 * fields are set to it instead of the world-up default - a guide spline placed on the scalp
	 * should stand normal to it, not point in a fixed world direction.
	 */
	public addSpline(atPosition: Vector3Data, normal: Vector3Data | null = null): SplineObject {
		const direction = normal ?? GROOM.SPLINE.DEFAULT_DIRECTION
		const vertexPosition: Vector3Data = {
			x: atPosition.x + direction.x * GROOM.SPLINE.DEFAULT_LENGTH,
			y: atPosition.y + direction.y * GROOM.SPLINE.DEFAULT_LENGTH,
			z: atPosition.z + direction.z * GROOM.SPLINE.DEFAULT_LENGTH,
		}
		const vertexDirection = normal ?? GROOM.SPLINE.DEFAULT_VERTEX_DIRECTION
		const vertexA = new SplineVertex(atPosition, vertexDirection)
		const vertexB = new SplineVertex(vertexPosition, vertexDirection)
		const object = new SplineObject(undefined, [vertexA, vertexB])
		this.objectsById.set(object.id, object)
		return object
	}

	/**
	 * Appends one new vertex to `splineId`'s end, extrapolated GROOM.SPLINE.NEW_VERTEX_OFFSET past its
	 * current last vertex along the direction from its second-to-last vertex (falling back to
	 * GROOM.SPLINE.DEFAULT_DIRECTION when there's no earlier vertex to derive a direction from, or the
	 * last two are (near-)coincident) - see GroomEditor.addVertexToSelectedSpline/
	 * AddSplineVertexCommand. Inherits the last vertex's `direction`/`scale` rather than resetting to
	 * the defaults, so extending a spline doesn't visually "reset" the new tip's gizmo.
	 */
	public addVertexToSpline(splineId: string): SplineVertex {
		const object = this.get(splineId)
		if (!object) {
			throw new Error(`GroomScene.addVertexToSpline: no object "${splineId}"`)
		}
		const { vertices } = object
		const last = vertices[vertices.length - 1]
		if (!last) {
			throw new Error(`GroomScene.addVertexToSpline: spline "${splineId}" has no vertices`)
		}
		const position = computeNextVertexPosition(vertices.map((v) => v.position))
		if (!position) {
			throw new Error(`GroomScene.addVertexToSpline: spline "${splineId}" has no vertices`)
		}
		const vertex = new SplineVertex(position, last.direction, last.scale)
		vertices.push(vertex)
		return vertex
	}

	/**
	 * Appends one new vertex to `splineId`'s end at an explicit `position` - the "add point" overlay
	 * button's drag-to-place gesture (see GroomEditor.commitAddVertexAt/AddSplineVertexInteractionHandler),
	 * as opposed to addVertexToSpline's fixed extrapolated offset. Otherwise identical: inherits the
	 * last vertex's `direction`/`scale` rather than resetting to the defaults.
	 */
	public appendVertexToSplineAt(splineId: string, position: Vector3Data): SplineVertex {
		const object = this.get(splineId)
		if (!object) {
			throw new Error(`GroomScene.appendVertexToSplineAt: no object "${splineId}"`)
		}
		const { vertices } = object
		const last = vertices[vertices.length - 1]
		if (!last) {
			throw new Error(`GroomScene.appendVertexToSplineAt: spline "${splineId}" has no vertices`)
		}
		const vertex = new SplineVertex(position, last.direction, last.scale)
		vertices.push(vertex)
		return vertex
	}

	/**
	 * Inserts one new vertex into `splineId` at the point along its curve nearest `point` - see
	 * SplineSelectionInteractionHandler's click-on-the-curve-body gesture and InsertSplineVertexCommand.
	 * Finds the closest point across every existing segment (a straight-line approximation of the
	 * smooth curve actually drawn - good enough to pick which pair of vertices the click landed
	 * between), splits that segment there, and lerps the new vertex's `direction`/`scale` between its
	 * two new neighbors so the curve's shape doesn't visually jump at the insertion point. Throws if
	 * `splineId` doesn't exist or has fewer than 2 vertices (nothing to split).
	 */
	public insertVertexNearPoint(splineId: string, point: Vector3Data): { vertex: SplineVertex; index: number } {
		const object = this.get(splineId)
		if (!object) {
			throw new Error(`GroomScene.insertVertexNearPoint: no object "${splineId}"`)
		}
		const { vertices } = object
		if (vertices.length < 2) {
			throw new Error(`GroomScene.insertVertexNearPoint: spline "${splineId}" has fewer than 2 vertices`)
		}

		let bestSegmentIndex = 0
		let bestT = 0
		let bestDistanceSq = Infinity
		let bestClosest: Vector3Data = vertices[0].position
		for (let i = 0; i < vertices.length - 1; i++) {
			const a = vertices[i].position
			const b = vertices[i + 1].position
			const abx = b.x - a.x
			const aby = b.y - a.y
			const abz = b.z - a.z
			const abLengthSq = abx * abx + aby * aby + abz * abz
			const t =
				abLengthSq > 1e-8
					? Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby + (point.z - a.z) * abz) / abLengthSq))
					: 0
			const closest: Vector3Data = { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t }
			const dx = point.x - closest.x
			const dy = point.y - closest.y
			const dz = point.z - closest.z
			const distanceSq = dx * dx + dy * dy + dz * dz
			if (distanceSq < bestDistanceSq) {
				bestDistanceSq = distanceSq
				bestSegmentIndex = i
				bestT = t
				bestClosest = closest
			}
		}

		const a = vertices[bestSegmentIndex]
		const b = vertices[bestSegmentIndex + 1]
		const direction = lerpVector3Data(a.direction, b.direction, bestT)
		const scale = a.scale + (b.scale - a.scale) * bestT
		const index = bestSegmentIndex + 1
		const vertex = new SplineVertex(bestClosest, direction, scale)
		vertices.splice(index, 0, vertex)
		return { vertex, index }
	}

	/** Restores one previously serialized spline while preserving its stable id for redo/undo. */
	public restore(data: SplineObjectData): SplineObject {
		if (this.objectsById.has(data.id)) {
			throw new Error(`GroomScene.restore: object "${data.id}" already exists`)
		}
		const storedResolution = data.resolution ?? GROOM.SPLINE.DEFAULT_RESOLUTION
		if (storedResolution <= 0) {
			throw new Error(`GroomScene.restore: resolution must be positive, got ${storedResolution}`)
		}
		// Values below the new minimum are from the former world-units-per-segment representation.
		// Its reciprocal is the equivalent subdivisions-per-world-unit value.
		const resolution =
			storedResolution < GROOM.SPLINE.MIN_RESOLUTION ? 1 / storedResolution : storedResolution
		const object = new SplineObject(
			data.id,
			data.vertices.map(
				(vertex) =>
					new SplineVertex(
						vertex.position,
						vertex.direction,
						vertex.scale ?? GROOM.SPLINE.DEFAULT_VERTEX_SCALE
					)
			),
			data.hairCardId,
			resolution,
			data.cardWidth ?? GROOM.SPLINE.CARD_STRIP.DEFAULT_WIDTH,
			data.cardStartOffset ?? GROOM.SPLINE.CARD_STRIP.DEFAULT_START_OFFSET,
			data.smoothModifyEnabled ?? GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_ENABLED,
			data.influence ?? GROOM.SPLINE.SMOOTH_MODIFY.DEFAULT_INFLUENCE
		)
		this.objectsById.set(object.id, object)
		return object
	}

	/**
	 * Duplicates `splineId`'s full option bundle and vertices under a fresh id - see
	 * GroomEditor.cloneSelectedSpline/CloneSplineCommand. Goes through restore() (not addSpline())
	 * so hairCardId/resolution/cardWidth/cardStartOffset/smoothModifyEnabled/influence all carry over
	 * unchanged, not just the vertex positions.
	 */
	public cloneSpline(splineId: string): SplineObject {
		const source = this.get(splineId)
		if (!source) {
			throw new Error(`GroomScene.cloneSpline: no object "${splineId}"`)
		}
		return this.restore({ ...source.toJSON(), id: crypto.randomUUID() })
	}

	public remove(objectId: string): void {
		if (!this.objectsById.delete(objectId)) {
			throw new Error(`GroomScene.remove: no object "${objectId}" exists`)
		}
	}

	public get(objectId: string): SplineObject | null {
		return this.objectsById.get(objectId) ?? null
	}

	public getItems(): readonly SplineObject[] {
		return [...this.objectsById.values()]
	}

	/** The jsonb-persisted form of the scene - see the `projects.groom` column. */
	public toJSON(): SplineObjectData[] {
		return this.getItems().map((object) => object.toJSON())
	}

	/** Replaces the entire scene with previously persisted splines, preserving their ids. */
	public replaceAll(items: readonly SplineObjectData[]): void {
		this.objectsById.clear()
		items.forEach((item) => this.restore(item))
	}
}

/**
 * Runtime-only state for the groom editor session. Deliberately has no id/name/thickness of its
 * own - the groom scene is one jsonb column (`groom`) on the SAME `projects` row the object
 * editor's `scene`/`name`/`thickness` live on, not a separate persisted entity.
 */
export class GroomProject {
	public readonly scene = new GroomScene()
}
