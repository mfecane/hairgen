import { GROOM } from '@/constants'
import { HairCardUvRect } from '@/editor/groom/main/GroomHairCardLookup'
import { getVertexGizmoFrame } from '@/editor/groom/main/SplineVertexFrame'
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, MathUtils, Vector3 } from 'three'

/** Below this, a length is treated as zero - mirrors SplineCurveGeometryGenerator's epsilon. */
const MIN_LENGTH = 1e-4

/**
 * Builds the visible, textured "card strip" ribbon of quads instancing a spline's referenced hair
 * card along its curve. `cardWidth` is the spline's own field (SplineObject.cardWidth) - the
 * referenced hair card only ever supplies UVs/texture here, never the mesh's size (see
 * GroomHairCardLookup, which deliberately excludes width for that reason) - and
 * SplineBodyGeometry (the third mesh a spline body Group grows, alongside the edit-curve `Line` and
 * the invisible collider tube `SplineCurveGeometryGenerator` builds). Unlike the collider tube, this
 * strip is flat (a width axis, not a radius) and reinstates each vertex's `scale` as a visual width
 * multiplier - deliberately dropped from the collider tube when it replaced the old quad-chain
 * ribbon, and restored here instead. Always starts some arc-length offset into the curve
 * (`cardStartOffset` - SplineOptionsPanel's field) and always ends exactly at the curve's end.
 * `cardUvRect` (GroomHairCardLookup.getCardUvRect) confines the strip's UVs to the referenced hair
 * card's own portion of the shared atlas, rather than the whole image - see the per-vertex `uvs`
 * fill below.
 */
export class SplineCardStripGeometryGenerator {
	public generate(
		vertices: readonly Vector3[],
		directions: readonly Vector3[],
		scales: readonly number[],
		curve: CatmullRomCurve3,
		cardStartOffset: number,
		cardWidth: number,
		subdivisions: number,
		cardUvRect: HairCardUvRect
	): BufferGeometry {
		const geometry = new BufferGeometry()
		if (vertices.length < 2 || cardWidth <= 0) {
			return geometry
		}
		const frames = vertices.map((_vertex, index) => getVertexGizmoFrame(vertices, index, directions[index]))
		if (frames.some((frame) => !frame)) {
			// (Near-)coincident vertices somewhere along the chain - mirrors
			// SplineCurveGeometryGenerator/the old quad-chain generator's same bail-out.
			return geometry
		}

		// Arc length is sampled at curve.arcLengthDivisions (three.js' default, 200) - the SAME table
		// curve.getPointAt/getLength already use internally, so a vertex's own arc length (found by
		// interpolating this table at its known parameter k/(n-1)) and `curveLength` never disagree.
		// A coarser table keyed to just the vertex count would instead give each vertex's straight-line
		// CHORD distance, not its true position along the curved centerline - visibly wrong once a
		// spline bends.
		const lengths = curve.getLengths()
		const curveLength = lengths[lengths.length - 1]
		if (curveLength < MIN_LENGTH) {
			return geometry
		}
		const arcLengthAtParameter = (t: number): number => {
			const scaled = t * (lengths.length - 1)
			const i0 = Math.floor(scaled)
			const i1 = Math.min(lengths.length - 1, i0 + 1)
			return MathUtils.lerp(lengths[i0], lengths[i1], scaled - i0)
		}
		const vertexArcLengths = vertices.map((_vertex, index) => arcLengthAtParameter(index / (vertices.length - 1)))

		const clampedStart = Math.min(
			Math.max(cardStartOffset, 0),
			curveLength - GROOM.SPLINE.CARD_STRIP.MIN_REMAINING_LENGTH
		)
		if (clampedStart >= curveLength - MIN_LENGTH) {
			// Nothing left to draw - the offset consumes the whole (remaining) curve.
			return geometry
		}

		const crossSections = subdivisions + 1
		const positions = new Float32Array(crossSections * 2 * 3)
		const uvs = new Float32Array(crossSections * 2 * 2)
		const point = new Vector3()
		const axis = new Vector3()
		let segmentIndex = 0
		for (let i = 0; i < crossSections; i++) {
			const targetLength = clampedStart + (i / subdivisions) * (curveLength - clampedStart)
			while (
				segmentIndex < vertexArcLengths.length - 2 &&
				vertexArcLengths[segmentIndex + 1] < targetLength
			) {
				segmentIndex++
			}
			const segmentStart = vertexArcLengths[segmentIndex]
			const segmentLength = vertexArcLengths[segmentIndex + 1] - segmentStart
			const localT = segmentLength > MIN_LENGTH ? (targetLength - segmentStart) / segmentLength : 0
			// Non-null - every entry passed the frames.some(!frame) check above.
			const frameA = frames[segmentIndex] as NonNullable<(typeof frames)[number]>
			const frameB = frames[segmentIndex + 1] as NonNullable<(typeof frames)[number]>
			const scaleA = scales[segmentIndex]
			const scaleB = scales[segmentIndex + 1]

			point.copy(curve.getPointAt(Math.min(1, targetLength / curveLength)))
			axis.copy(frameA.axis).lerp(frameB.axis, localT).normalize()
			const halfWidth = (cardWidth * MathUtils.lerp(scaleA, scaleB, localT)) / 2
			const alongT = (targetLength - clampedStart) / (curveLength - clampedStart)

			const offset = i * 6
			positions[offset] = point.x - axis.x * halfWidth
			positions[offset + 1] = point.y - axis.y * halfWidth
			positions[offset + 2] = point.z - axis.z * halfWidth
			positions[offset + 3] = point.x + axis.x * halfWidth
			positions[offset + 4] = point.y + axis.y * halfWidth
			positions[offset + 5] = point.z + axis.z * halfWidth

			// Atlas X runs across the card's width. Atlas Y runs along its growth direction, with
			// roots at the card's +Y edge and tips toward -Y, so curve start maps to yMax and curve
			// end maps to yMin.
			const alongV = MathUtils.lerp(cardUvRect.yMax, cardUvRect.yMin, alongT)
			const uvOffset = i * 4
			uvs[uvOffset] = cardUvRect.xMin
			uvs[uvOffset + 1] = alongV
			uvs[uvOffset + 2] = cardUvRect.xMax
			uvs[uvOffset + 3] = alongV
		}

		const indices: number[] = []
		for (let i = 0; i < subdivisions; i++) {
			const left0 = i * 2
			const right0 = left0 + 1
			const left1 = left0 + 2
			const right1 = left0 + 3
			indices.push(left0, left1, right0, right0, left1, right1)
		}

		geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
		geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
		geometry.setIndex(indices)
		geometry.computeVertexNormals()
		geometry.name = 'splineCardStripGeometry'
		return geometry
	}
}
