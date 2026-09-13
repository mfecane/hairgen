import { BAKE } from '@/constants'
import { Camera, FloatType, PCFSoftShadowMap, Scene, UnsignedByteType, WebGLRenderer, WebGLRenderTarget } from 'three'

/**
 * Owns one offscreen WebGLRenderer + resizable WebGLRenderTargets, reused across every map in a
 * bake (constructing a GL context is expensive - see HairCardBaker's lifetime notes). Two things
 * every caller must get right, not just style:
 *  - readRenderTargetPixels fills a Uint8Array, but ImageData needs a Uint8ClampedArray - copied,
 *    not just reinterpreted.
 *  - WebGL's row order is bottom-to-top; ImageData/canvas/PNG are top-to-bottom. Every readback here
 *    is row-flipped before use, or every baked map comes out vertically mirrored relative to the
 *    atlas UV convention (PlaneGeometry's default v = 0 is already at -Y/bottom).
 * Shadow maps are always enabled - only HairCardBakeShadowSweepAoPass's scene ever adds a
 * shadow-casting light, so this is a no-op cost for every other map.
 */
export class HairCardBakeGpuRenderer {
	private readonly renderer: WebGLRenderer = new WebGLRenderer({
		antialias: true,
		alpha: true,
		preserveDrawingBuffer: true,
	})

	public constructor() {
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = PCFSoftShadowMap
	}

	private byteTarget: WebGLRenderTarget | null = null

	private floatTarget: WebGLRenderTarget | null = null

	/** Renders one 8-bit RGBA map (alpha/color/normal/height/roots/tips/id). */
	public renderImage(scene: Scene, camera: Camera, resolution: number): ImageData {
		const target = this.getByteTarget(resolution)
		this.renderer.setRenderTarget(target)
		this.renderer.clear()
		this.renderer.render(scene, camera)
		this.renderer.setRenderTarget(null)

		const raw = new Uint8Array(resolution * resolution * 4)
		this.renderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, raw)
		const flipped = new Uint8ClampedArray(raw.length)
		flipRows(raw, flipped, resolution, 4)
		return new ImageData(flipped, resolution, resolution)
	}

	/** Renders one float RGBA G-buffer (the AO pass's object-space position/normal - see HairCardBakeRaytracedAoPass). */
	public renderFloatBuffer(scene: Scene, camera: Camera, resolution: number): Float32Array {
		const target = this.getFloatTarget(resolution)
		this.renderer.setRenderTarget(target)
		this.renderer.clear()
		this.renderer.render(scene, camera)
		this.renderer.setRenderTarget(null)

		const raw = new Float32Array(resolution * resolution * 4)
		this.renderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, raw)
		const flipped = new Float32Array(raw.length)
		flipRows(raw, flipped, resolution, 4)
		return flipped
	}

	public dispose(): void {
		this.byteTarget?.dispose()
		this.floatTarget?.dispose()
		this.renderer.dispose()
	}

	private getByteTarget(resolution: number): WebGLRenderTarget {
		if (!this.byteTarget || this.byteTarget.width !== resolution) {
			this.byteTarget?.dispose()
			// samples enables real MSAA on this render-to-texture target - WebGLRenderer's own
			// `antialias: true` (constructor option above) only ever applies to the default canvas
			// framebuffer, never to a WebGLRenderTarget, so every baked map would otherwise come out
			// hard-edged. three.js resolves the multisample buffer automatically before this class's
			// own readRenderTargetPixels calls run.
			this.byteTarget = new WebGLRenderTarget(resolution, resolution, {
				type: UnsignedByteType,
				samples: BAKE.MSAA_SAMPLES,
			})
		}
		return this.byteTarget
	}

	private getFloatTarget(resolution: number): WebGLRenderTarget {
		if (!this.floatTarget || this.floatTarget.width !== resolution) {
			this.floatTarget?.dispose()
			// Deliberately not multisampled, unlike getByteTarget above - this backs
			// HairCardBakeRaytracedAoPass's position/normal G-buffers, and MSAA's resolve would average
			// two unrelated surface points at a silhouette edge into a value that matches no real
			// geometry, corrupting exactly the texels the raytraced AO cares about most.
			this.floatTarget = new WebGLRenderTarget(resolution, resolution, { type: FloatType })
		}
		return this.floatTarget
	}
}

/** Copies `resolution` rows of `channels`-wide pixels from `source` (WebGL's bottom-to-top order) into `destination` (top-to-bottom). */
function flipRows(
	source: Uint8Array | Float32Array,
	destination: Uint8ClampedArray | Float32Array,
	resolution: number,
	channels: number
): void {
	const rowLength = resolution * channels
	for (let row = 0; row < resolution; row++) {
		const sourceStart = (resolution - 1 - row) * rowLength
		const destinationStart = row * rowLength
		for (let i = 0; i < rowLength; i++) {
			destination[destinationStart + i] = source[sourceStart + i]
		}
	}
}
