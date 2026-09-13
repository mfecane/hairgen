import { HairCardBakeGpuRenderer } from '@/lib/hair/bake/HairCardBakeGpuRenderer'
import { HairCardBakeMaterialFactory } from '@/lib/hair/bake/HairCardBakeMaterialFactory'
import { Camera, Mesh, Scene } from 'three'

/**
 * One way of computing the `ao` bake map - see HairCardBakeRaytracedAoPass and
 * HairCardBakeShadowSweepAoPass for the two implementations, and HairCardBakeAoAlgorithmFactory for
 * how HairCardBaker picks between them.
 */
export interface HairCardBakeAoAlgorithm {
	/**
	 * `scene`/`mesh`/`camera` are HairCardBaker's shared atlas scene, bake mesh, and orthographic
	 * camera - an implementation is free to swap `mesh.material` and read it back through
	 * `gpuRenderer`, or add its own temporary lights to `scene`, as long as it undoes that before
	 * returning. `alphaMask` is the already-rendered coverage mask (see HairCardBaker.bake) -
	 * texels outside it must be left [0,0,0,0] for HairCardBakeDilator to fill in.
	 *
	 * `compute` is async so an implementation can periodically yield to the browser (this is the one
	 * bake step slow enough that a cancel click or the progress label would otherwise never get a
	 * chance to run mid-step) - `options.signal` should be checked and `options.onSweepProgress`
	 * called at each such yield point.
	 */
	compute(
		scene: Scene,
		mesh: Mesh,
		camera: Camera,
		gpuRenderer: HairCardBakeGpuRenderer,
		materialFactory: HairCardBakeMaterialFactory,
		alphaMask: ImageData,
		resolution: number,
		seed: string,
		options?: { signal?: AbortSignal; onSweepProgress?: (label: string) => void }
	): Promise<ImageData>
}
