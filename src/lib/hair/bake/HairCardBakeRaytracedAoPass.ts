import { BAKE } from '@/constants'
import { HairCardBakeAoAlgorithm } from '@/lib/hair/bake/HairCardBakeAoAlgorithm'
import { HairCardBakeGpuRenderer } from '@/lib/hair/bake/HairCardBakeGpuRenderer'
import { HairCardBakeMaterialFactory } from '@/lib/hair/bake/HairCardBakeMaterialFactory'
import { SeededRandom } from '@/lib/hair/SeededRandom'
import { Camera, Material, Mesh, Ray, Scene, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

/**
 * Ray-traced ambient occlusion - renders the object-space position/normal G-buffers with the same
 * orthographic camera used for every other map, then casts BAKE.AO.RAYTRACE.SAMPLE_COUNT
 * cosine-weighted hemisphere rays per texel against all atlas strand geometry (a MeshBVH, built once
 * per bake) to measure occlusion. The one CPU-heavy step in a bake - cost is
 * O(resolution^2 * SAMPLE_COUNT) raycasts, so this is expected to be the slowest requested map at
 * high resolution/high strand coverage.
 */
export class HairCardBakeRaytracedAoPass implements HairCardBakeAoAlgorithm {
	public async compute(
		scene: Scene,
		mesh: Mesh,
		camera: Camera,
		gpuRenderer: HairCardBakeGpuRenderer,
		materialFactory: HairCardBakeMaterialFactory,
		alphaMask: ImageData,
		resolution: number,
		seed: string,
		options?: { signal?: AbortSignal; onSweepProgress?: (label: string) => void }
	): Promise<ImageData> {
		const gBufferMaterials: Material[] = []
		let positionBuffer: Float32Array
		let normalBuffer: Float32Array
		try {
			const positionMaterial = materialFactory.createAoPositionMaterial()
			gBufferMaterials.push(positionMaterial)
			mesh.material = positionMaterial
			positionBuffer = gpuRenderer.renderFloatBuffer(scene, camera, resolution)

			const normalMaterial = materialFactory.createAoNormalMaterial()
			gBufferMaterials.push(normalMaterial)
			mesh.material = normalMaterial
			normalBuffer = gpuRenderer.renderFloatBuffer(scene, camera, resolution)
		} finally {
			gBufferMaterials.forEach((material) => material.dispose())
		}

		const bvh = new MeshBVH(mesh.geometry)
		const random = new SeededRandom(seed)
		const output = new Uint8ClampedArray(resolution * resolution * 4)

		const origin = new Vector3()
		const normal = new Vector3()
		const tangent = new Vector3()
		const bitangent = new Vector3()
		const localSample = new Vector3()
		const worldDirection = new Vector3()
		const ray = new Ray()

		const texelCount = resolution * resolution
		// Per-texel cost varies hugely (a skipped outside-alpha-mask texel is near-free, a shaded one
		// costs SAMPLE_COUNT raycasts against the BVH), so yielding is time-budgeted rather than tied
		// to a fixed texel count - a fixed schedule would either yield far too often at high
		// resolution or not often enough over a sparse alpha mask.
		let lastYieldAt = performance.now()
		for (let texel = 0; texel < texelCount; texel++) {
			// Alpha mask's red channel is the coverage value (0-255) - texels outside it have no
			// strand surface to shade, and are left [0,0,0,0] for HairCardBakeDilator to fill in later.
			if (alphaMask.data[texel * 4] === 0) {
				continue
			}

			if (performance.now() - lastYieldAt > BAKE.AO.RAYTRACE.YIELD_BUDGET_MS) {
				options?.signal?.throwIfAborted()
				options?.onSweepProgress?.(`texel ${texel.toLocaleString()}/${texelCount.toLocaleString()}`)
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
				lastYieldAt = performance.now()
			}

			const base = texel * 4
			origin.set(positionBuffer[base], positionBuffer[base + 1], positionBuffer[base + 2])
			normal.set(normalBuffer[base], normalBuffer[base + 1], normalBuffer[base + 2]).normalize()
			buildTangentBasis(normal, tangent, bitangent)

			let occluded = 0
			for (let sample = 0; sample < BAKE.AO.RAYTRACE.SAMPLE_COUNT; sample++) {
				cosineWeightedHemisphereSample(random, localSample)
				worldDirection
					.set(0, 0, 0)
					.addScaledVector(tangent, localSample.x)
					.addScaledVector(bitangent, localSample.y)
					.addScaledVector(normal, localSample.z)
					.normalize()

				ray.origin.copy(origin).addScaledVector(normal, BAKE.AO.RAYTRACE.BIAS)
				ray.direction.copy(worldDirection)

				const hit = bvh.raycastFirst(ray)
				if (hit && hit.distance <= BAKE.AO.RAYTRACE.MAX_DISTANCE) {
					occluded++
				}
			}

			const gray = Math.round(255 * (1 - occluded / BAKE.AO.RAYTRACE.SAMPLE_COUNT))
			output[base] = gray
			output[base + 1] = gray
			output[base + 2] = gray
			output[base + 3] = 255
		}

		return new ImageData(output, resolution, resolution)
	}
}

/** An orthonormal (tangent, bitangent) basis perpendicular to `normal`. */
function buildTangentBasis(normal: Vector3, tangent: Vector3, bitangent: Vector3): void {
	const reference = Math.abs(normal.z) < 0.99 ? UP_REFERENCE : SIDE_REFERENCE
	tangent.crossVectors(reference, normal).normalize()
	bitangent.crossVectors(normal, tangent)
}

const UP_REFERENCE = new Vector3(0, 0, 1)
const SIDE_REFERENCE = new Vector3(1, 0, 0)

/** A cosine-weighted direction in the (tangent, bitangent, normal) local frame - `out`'s x/y/z are that frame's coordinates, not world space (see the caller's basis rotation). */
function cosineWeightedHemisphereSample(random: SeededRandom, out: Vector3): void {
	const u1 = random.next()
	const u2 = random.next()
	const r = Math.sqrt(u1)
	const theta = 2 * Math.PI * u2
	out.set(r * Math.cos(theta), r * Math.sin(theta), Math.sqrt(Math.max(0, 1 - u1)))
}
