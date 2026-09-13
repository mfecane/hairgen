import { BAKE } from '@/constants'
import { HairCardBakeAoAlgorithm } from '@/lib/hair/bake/HairCardBakeAoAlgorithm'
import { HairCardBakeGpuRenderer } from '@/lib/hair/bake/HairCardBakeGpuRenderer'
import { HairCardBakeMaterialFactory } from '@/lib/hair/bake/HairCardBakeMaterialFactory'
import { Camera, DirectionalLight, MathUtils, Mesh, Scene, Vector3 } from 'three'

const X_AXIS = new Vector3(1, 0, 0)
const Z_AXIS = new Vector3(0, 0, 1)

/**
 * Rasterized alternative to HairCardBakeRaytracedAoPass: renders the atlas mesh with a flat white,
 * shadows-only material (HairCardBakeMaterialFactory.createAoShadowMaterial) under one
 * shadow-casting directional light swept to many positions above the geometry, and averages every
 * render into the AO value - self-shadowing between strands is the only source of shading.
 *
 * The light orbits the world +Z pole (the same axis HairCardBakeOrthographicCamera looks down),
 * tilted slightly around the world X axis per BAKE.AO.SHADOW_SWEEP.ELEVATION_BASELINE_DEGREES /
 * ELEVATION_OFFSET_DEGREES, then swept around Z across AZIMUTH_SWEEP_DEGREES - repeated at
 * ELEVATION_STEPS different tilts so the samples aren't confined to one ring. A tilt of exactly 0
 * makes the azimuth sweep a no-op (rotating the vertical pole around itself), so that ring is
 * rendered once instead of once per azimuth step.
 */
export class HairCardBakeShadowSweepAoPass implements HairCardBakeAoAlgorithm {
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
		void seed // deterministic sweep angles - no randomness needed here, unlike HairCardBakeRaytracedAoPass

		const boundingBox = mesh.geometry.boundingBox
		if (!boundingBox) {
			throw new Error('HairCardBakeShadowSweepAoPass.compute: mesh geometry has no bounding box.')
		}
		const center = boundingBox.getCenter(new Vector3())
		const radius = boundingBox.getSize(new Vector3()).length() / 2
		const distance = radius + BAKE.AO.SHADOW_SWEEP.LIGHT_DISTANCE_PADDING

		const shadowMaterial = materialFactory.createAoShadowMaterial()
		mesh.material = shadowMaterial
		mesh.castShadow = true
		mesh.receiveShadow = true

		const light = this.createSweepLight(radius, distance, center, resolution)
		scene.add(light, light.target)

		const accumulator = new Float64Array(resolution * resolution)
		let samplesTaken = 0
		try {
			const elevationSteps: number = BAKE.AO.SHADOW_SWEEP.ELEVATION_STEPS
			const totalSamples = this.countTotalSamples(elevationSteps)
			for (let elevationStep = 0; elevationStep < elevationSteps; elevationStep++) {
				const tiltDegrees = this.elevationTiltDegrees(elevationStep, elevationSteps)
				// Rotating the vertical pole around itself has no effect - render that ring once.
				const azimuthSteps = tiltDegrees === 0 ? 1 : BAKE.AO.SHADOW_SWEEP.AZIMUTH_STEPS
				for (let azimuthStep = 0; azimuthStep < azimuthSteps; azimuthStep++) {
					const azimuthDegrees =
						azimuthSteps === 1 ? 0 : (azimuthStep / (azimuthSteps - 1)) * BAKE.AO.SHADOW_SWEEP.AZIMUTH_SWEEP_DEGREES
					light.position.copy(center).addScaledVector(this.sweepDirection(tiltDegrees, azimuthDegrees), distance)

					this.accumulateLuminance(gpuRenderer.renderImage(scene, camera, resolution), accumulator)
					samplesTaken++

					// Checked/reported on every sample (near-free), but only actually yields to the
					// browser every Nth one - yielding on every one of the ~33 samples would add up to
					// several hundred ms of pure requestAnimationFrame overhead for no responsiveness
					// benefit beyond yielding periodically.
					options?.signal?.throwIfAborted()
					options?.onSweepProgress?.(`sweep ${samplesTaken}/${totalSamples}`)
					if (samplesTaken % BAKE.AO.SHADOW_SWEEP.YIELD_EVERY_N_SAMPLES === 0) {
						await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
					}
				}
			}
		} finally {
			scene.remove(light, light.target)
			light.shadow.map?.dispose()
			shadowMaterial.dispose()
		}

		return this.averageToGrayscale(accumulator, alphaMask, resolution, samplesTaken)
	}

	/**
	 * A directional light whose shadow frustum is sized to cover the atlas from anywhere in the
	 * sweep. Its shadow map matches the bake's own resolution, not a fixed size - otherwise a
	 * high-resolution bake would still get a blurry/blocky AO signal from an undersized shadow map,
	 * while a low-resolution bake would waste GPU on an oversized one.
	 */
	private createSweepLight(radius: number, distance: number, target: Vector3, resolution: number): DirectionalLight {
		const light = new DirectionalLight()
		light.name = 'hairCardBakeShadowSweepLight'
		light.castShadow = true
		light.target.position.copy(target)
		light.shadow.mapSize.set(resolution, resolution)
		light.shadow.bias = BAKE.AO.SHADOW_SWEEP.SHADOW_BIAS
		light.shadow.normalBias = BAKE.AO.SHADOW_SWEEP.SHADOW_NORMAL_BIAS
		light.shadow.camera.left = -radius
		light.shadow.camera.right = radius
		light.shadow.camera.top = radius
		light.shadow.camera.bottom = -radius
		light.shadow.camera.near = 0.001
		light.shadow.camera.far = distance + radius
		light.shadow.camera.updateProjectionMatrix()
		return light
	}

	/** Mirrors the compute() loop's own azimuthSteps-collapses-to-1-at-zero-tilt rule, to know the sweep's total sample count upfront for progress reporting. */
	private countTotalSamples(elevationSteps: number): number {
		let total = 0
		for (let elevationStep = 0; elevationStep < elevationSteps; elevationStep++) {
			const tiltDegrees = this.elevationTiltDegrees(elevationStep, elevationSteps)
			total += tiltDegrees === 0 ? 1 : BAKE.AO.SHADOW_SWEEP.AZIMUTH_STEPS
		}
		return total
	}

	/** `elevationSteps` tilts spread symmetrically around the baseline (e.g. 3 steps -> [-offset, 0, +offset] off it). */
	private elevationTiltDegrees(step: number, elevationSteps: number): number {
		const { ELEVATION_BASELINE_DEGREES, ELEVATION_OFFSET_DEGREES } = BAKE.AO.SHADOW_SWEEP
		const baselineTilt = 90 - ELEVATION_BASELINE_DEGREES // 0 when the baseline is straight overhead
		if (elevationSteps === 1) {
			return baselineTilt
		}
		const t = step / (elevationSteps - 1) // 0..1
		return baselineTilt + MathUtils.lerp(-ELEVATION_OFFSET_DEGREES, ELEVATION_OFFSET_DEGREES, t)
	}

	/** The world +Z pole, tilted `tiltDegrees` around world X, then swept `azimuthDegrees` around world Z. */
	private sweepDirection(tiltDegrees: number, azimuthDegrees: number): Vector3 {
		return new Vector3(0, 0, 1)
			.applyAxisAngle(X_AXIS, MathUtils.degToRad(tiltDegrees))
			.applyAxisAngle(Z_AXIS, MathUtils.degToRad(azimuthDegrees))
	}

	/** Adds one render's red channel (the shadow-only material's output has R === G === B) into the running sum. */
	private accumulateLuminance(image: ImageData, accumulator: Float64Array): void {
		for (let texel = 0; texel < accumulator.length; texel++) {
			accumulator[texel] += image.data[texel * 4]
		}
	}

	private averageToGrayscale(accumulator: Float64Array, alphaMask: ImageData, resolution: number, samplesTaken: number): ImageData {
		const output = new Uint8ClampedArray(resolution * resolution * 4)
		for (let texel = 0; texel < accumulator.length; texel++) {
			// Left [0,0,0,0] for HairCardBakeDilator to fill in - same convention as HairCardBakeRaytracedAoPass.
			if (alphaMask.data[texel * 4] === 0) {
				continue
			}
			const gray = Math.round(accumulator[texel] / samplesTaken)
			const base = texel * 4
			output[base] = gray
			output[base + 1] = gray
			output[base + 2] = gray
			output[base + 3] = 255
		}
		return new ImageData(output, resolution, resolution)
	}
}
