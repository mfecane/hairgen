import { HAIR_STRAND } from '@/constants'
import { HairStrandCenterlineCurve } from '@/lib/hair/HairStrandCenterlineCurve'
import { HairStrandParams } from '@/lib/hair/HairStrandParams'
import {
	BufferGeometry,
	CatmullRomCurve3,
	Float32BufferAttribute,
	MathUtils,
	TubeGeometry,
	Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Builds a tapered, root-bent tube mesh for one hair strand, in three stages: (1) a centerline
 * shape - either generated fresh from HairStrandParams (generate) or handed in already-shaped, e.g.
 * by a card's modifier stack (generateFromCenterline); (2) a CatmullRomCurve3 through those points
 * drives Three's own TubeGeometry (frame/winding), each ring then re-scaled to the taper radius at
 * that point (see radiusAt); (3) both ends are capped from the same points. No dependencies of its
 * own - construct directly with `new HairStrandGeometryGenerator()`.
 */
export class HairStrandGeometryGenerator {
	/** Length-segment count for a strand of this length - shared by generate() and by HairCardStrandsGenerator, which needs it before this class ever sees the strand (to presample a raw centerline for the modifier stack). */
	public segmentsForLength(length: number): number {
		return Math.max(HAIR_STRAND.MIN_LENGTH_SEGMENTS, Math.round(length * HAIR_STRAND.SEGMENT_DENSITY))
	}

	public generate(params: HairStrandParams): BufferGeometry {
		const centerline = new HairStrandCenterlineCurve(params).getSpacedPoints(this.segmentsForLength(params.length))
		return this.generateFromCenterline(centerline, params)
	}

	/**
	 * Same tube/taper/cap build as generate(), from an explicit point array instead of one this class
	 * derives itself - the hook a card's modifier stack (twist/noise/clump/braid) uses, since those
	 * reshape a strand's centerline before it becomes geometry. The path driving TubeGeometry is a
	 * CatmullRomCurve3 through `centerline` rather than the analytic HairStrandCenterlineCurve, since
	 * a modifier-reshaped centerline is just points, not a re-evaluable curve - TubeGeometry then
	 * resamples that spline by its own arc length, which can drift a hair from the input points if
	 * they aren't perfectly evenly spaced any more. Acceptable at hair-strand thinness; not exact CAD.
	 */
	public generateFromCenterline(centerline: Vector3[], params: HairStrandParams): BufferGeometry {
		const lengthSegments = centerline.length - 1
		const curve = new CatmullRomCurve3(centerline)

		const tube = new TubeGeometry(curve, lengthSegments, 1, HAIR_STRAND.RADIAL_SEGMENTS, false)
		tube.deleteAttribute('uv')
		this.applyTaper(tube, centerline, params)
		this.assignHairT(tube, lengthSegments)

		const rootCap = this.buildCap(tube, centerline, 0, curve.getTangentAt(0).negate(), 0)
		const tipCap = this.buildCap(tube, centerline, lengthSegments, curve.getTangentAt(1), 1)

		const merged = mergeGeometries([tube, rootCap, tipCap])
		tube.dispose()
		rootCap.dispose()
		tipCap.dispose()
		if (!merged) {
			throw new Error('HairStrandGeometryGenerator: failed to merge the strand tube with its end caps.')
		}

		merged.name = 'hairStrandGeometry'
		merged.computeBoundingSphere()
		return merged
	}

	/** Sets the `hairT` attribute (0 at the root ring, 1 at the tip ring) used by bake-time roots/tips/height materials - see src/lib/hair/bake. Harmless for the interactive MeshStandardMaterial, which never reads it. */
	private assignHairT(tube: BufferGeometry, lengthSegments: number): void {
		const columnsPerRing = HAIR_STRAND.RADIAL_SEGMENTS + 1
		const vertexCount = tube.getAttribute('position').count
		const hairT = new Float32Array(vertexCount)
		for (let ring = 0; ring <= lengthSegments; ring++) {
			const t = ring / lengthSegments
			for (let column = 0; column < columnsPerRing; column++) {
				hairT[ring * columnsPerRing + column] = t
			}
		}
		tube.setAttribute('hairT', new Float32BufferAttribute(hairT, 1))
	}

	/** Rescales every ring of the (constant-radius-1) tube to radiusAt(t), then re-derives normals from the tapered surface. */
	private applyTaper(tube: BufferGeometry, centerline: Vector3[], params: HairStrandParams): void {
		const position = tube.getAttribute('position')
		const columnsPerRing = HAIR_STRAND.RADIAL_SEGMENTS + 1
		const lengthSegments = centerline.length - 1
		const vertex = new Vector3()

		for (let ring = 0; ring <= lengthSegments; ring++) {
			const radius = this.radiusAt(ring / lengthSegments, params)
			const center = centerline[ring]
			for (let column = 0; column < columnsPerRing; column++) {
				const index = ring * columnsPerRing + column
				vertex.fromBufferAttribute(position, index)
				vertex.sub(center).multiplyScalar(radius).add(center)
				position.setXYZ(index, vertex.x, vertex.y, vertex.z)
			}
		}
		position.needsUpdate = true
		tube.computeVertexNormals()
	}

	/**
	 * Strand radius at normalized position t in [0, 1] along the length: full thickness at the
	 * midpoint, easing down to (1 - baseTaper)/tipTaper of that at the root/tip respectively.
	 */
	private radiusAt(t: number, params: HairStrandParams): number {
		const baseRadius = params.thickness / 2
		const baseEndScale = 1 - params.baseTaper
		const tipEndScale = params.tipTaper
		const scale =
			t < 0.5
				? MathUtils.lerp(baseEndScale, 1, MathUtils.smoothstep(t / 0.5, 0, 1))
				: MathUtils.lerp(1, tipEndScale, MathUtils.smoothstep((t - 0.5) / 0.5, 0, 1))
		return baseRadius * scale
	}

	/** A flat triangle-fan cap closing off one end ring of the tube, facing `outward`, at normalized position `hairT` (0 root, 1 tip - see assignHairT). */
	private buildCap(
		tube: BufferGeometry,
		centerline: Vector3[],
		ring: number,
		outward: Vector3,
		hairT: number
	): BufferGeometry {
		const position = tube.getAttribute('position')
		const columnsPerRing = HAIR_STRAND.RADIAL_SEGMENTS + 1
		const rimStart = ring * columnsPerRing
		const rimCount = HAIR_STRAND.RADIAL_SEGMENTS // the tube's last column duplicates the first (UV seam) - drop it

		const center = centerline[ring]

		const positions = new Float32Array((rimCount + 1) * 3)
		const normals = new Float32Array((rimCount + 1) * 3)
		positions.set([center.x, center.y, center.z], 0)
		normals.set([outward.x, outward.y, outward.z], 0)

		const rim = new Vector3()
		for (let i = 0; i < rimCount; i++) {
			rim.fromBufferAttribute(position, rimStart + i)
			const offset = (i + 1) * 3
			positions.set([rim.x, rim.y, rim.z], offset)
			normals.set([outward.x, outward.y, outward.z], offset)
		}

		const isRoot = ring === 0
		const indices: number[] = []
		for (let i = 0; i < rimCount; i++) {
			const a = 1 + i
			const b = 1 + ((i + 1) % rimCount)
			if (isRoot) {
				indices.push(0, b, a)
			} else {
				indices.push(0, a, b)
			}
		}

		const cap = new BufferGeometry()
		cap.setAttribute('position', new Float32BufferAttribute(positions, 3))
		cap.setAttribute('normal', new Float32BufferAttribute(normals, 3))
		cap.setAttribute('hairT', new Float32BufferAttribute(new Float32Array(rimCount + 1).fill(hairT), 1))
		cap.setIndex(indices)
		cap.name = isRoot ? 'hairStrandRootCap' : 'hairStrandTipCap'
		return cap
	}
}
