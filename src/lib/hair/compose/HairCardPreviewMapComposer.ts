import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import {
	CanvasTexture,
	Color,
	Mesh,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	SRGBColorSpace,
	Texture,
	TextureLoader,
	UnsignedByteType,
	WebGLRenderer,
	WebGLRenderTarget,
} from 'three'

const VERTEX_SHADER = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`

// uHasId/uHasRoots/uHasTips are 0/1 switches, not branches - each optional map's texture uniform
// falls back to uAlpha (always present) when absent, and its 0 weight zeroes out its own blend
// step's contribution, same trick HairCardBakeRaytracedAoPass-adjacent code elsewhere in this bake pipeline
// avoids by just always binding something. uId's own grayscale value already IS the smooth
// primary/secondary blend factor - HairCardIdGroupAssigner paints it as (group + 0.5) / groupCount,
// no extra remapping needed here beyond the mix() itself.
const FRAGMENT_SHADER = /* glsl */ `
	uniform sampler2D uAlpha;
	uniform sampler2D uId;
	uniform sampler2D uRoots;
	uniform sampler2D uTips;
	uniform float uHasId;
	uniform float uHasRoots;
	uniform float uHasTips;
	uniform vec3 uPrimary;
	uniform vec3 uSecondary;
	uniform vec3 uTip;
	uniform vec3 uRoot;
	varying vec2 vUv;
	void main() {
		float a = texture2D(uAlpha, vUv).r;
		vec3 color = mix(uPrimary, mix(uPrimary, uSecondary, texture2D(uId, vUv).r), uHasId);
		color = mix(color, uRoot, texture2D(uRoots, vUv).r * uHasRoots);
		color = mix(color, uTip, texture2D(uTips, vUv).r * uHasTips);
		gl_FragColor = vec4(color, a);
	}
`

/**
 * Composes the project's one "preview material" recipe: a color+alpha map blended from the already-
 * baked alpha/id/roots/tips maps plus its 4 user-picked colors (`Project.previewColors`, edited via
 * HairCardBakeDialog), with the baked `normal` map layered on top unmodified if one exists. This is
 * the single implementation behind every "preview"/"textured" surface in the app - the groom
 * editor's merged Textured/Preview view mode (`GroomEditorController.ensureCardStripPreviewMap`) and
 * `HairCardBakePreviewRenderer`'s own default viewport preview - see
 * docs/editor/hair-cards-plan.md's "Preview material" section. `alpha` is the only required map -
 * it's the one channel every blend step actually samples (the output alpha channel directly, see the
 * fragment shader) - `id`/`roots`/`tips` are each independently optional, a project baked without
 * one just skips that blend step, and `color` isn't read here at all (it's a flat single-color fill,
 * see HairCardBakeMaterialFactory.createColorMaterial - no per-strand signal to reuse).
 *
 * Owns one small offscreen WebGLRenderer + a cached WebGLRenderTarget for its own lifetime
 * (constructing a GL context is expensive - same reasoning as HairCardBaker/
 * HairCardBakeGpuRenderer), used only internally to render the blend pass - `composeToCanvas`/
 * `composePreview` are the only ways to get the result out, both via a CPU pixel readback into a
 * plain `<canvas>`/`CanvasTexture` rather than handing out the render target's own `Texture`, since
 * that can't be used by any `WebGLRenderer` other than this composer's own internal one (a
 * `WebGLRenderTarget`'s texture lives entirely inside the GL context that rendered it).
 */
export class HairCardPreviewMapComposer {
	private readonly renderer: WebGLRenderer = new WebGLRenderer()

	private readonly textureLoader: TextureLoader = new TextureLoader()

	private readonly scene: Scene = new Scene()

	private readonly camera: OrthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

	private readonly quad: Mesh

	private readonly material: ShaderMaterial

	private renderTarget: WebGLRenderTarget | null = null

	public constructor() {
		this.material = new ShaderMaterial({
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			uniforms: {
				uAlpha: { value: null },
				uId: { value: null },
				uRoots: { value: null },
				uTips: { value: null },
				uHasId: { value: 0 },
				uHasRoots: { value: 0 },
				uHasTips: { value: 0 },
				uPrimary: { value: new Color() },
				uSecondary: { value: new Color() },
				uTip: { value: new Color() },
				uRoot: { value: new Color() },
			},
		})
		this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
		this.quad.frustumCulled = false
		this.scene.add(this.quad)
	}

	/**
	 * Renders one composed texture sized to the alpha map's own resolution - null when `bakedMaps`
	 * has no `alpha` (see the class doc - the only required map). Loads every map fresh from its
	 * storage URL on each call - callers are expected to cache by (urls, colors) themselves and only
	 * call this when that key actually changes (see GroomEditorController.ensureCardStripPreviewMap).
	 * Private - `composeToCanvas`/`composePreview` are the only externally usable ways to get the
	 * result (see the class doc on why the raw render-target `Texture` itself can't be handed out).
	 */
	private async compose(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
		colors: HairPreviewColors
	): Promise<Texture | null> {
		const alphaUrl = bakedMaps.alpha?.url
		if (!alphaUrl) {
			return null
		}

		const loaded: Texture[] = []
		try {
			const alphaTexture = await this.loadRequired(alphaUrl, loaded)
			const [idTexture, rootsTexture, tipsTexture] = await Promise.all([
				this.loadOptional(bakedMaps.id?.url, loaded),
				this.loadOptional(bakedMaps.roots?.url, loaded),
				this.loadOptional(bakedMaps.tips?.url, loaded),
			])

			const uniforms = this.material.uniforms
			uniforms.uAlpha.value = alphaTexture
			uniforms.uId.value = idTexture ?? alphaTexture
			uniforms.uRoots.value = rootsTexture ?? alphaTexture
			uniforms.uTips.value = tipsTexture ?? alphaTexture
			uniforms.uHasId.value = idTexture ? 1 : 0
			uniforms.uHasRoots.value = rootsTexture ? 1 : 0
			uniforms.uHasTips.value = tipsTexture ? 1 : 0
			;(uniforms.uPrimary.value as Color).set(colors.primary)
			;(uniforms.uSecondary.value as Color).set(colors.secondary)
			;(uniforms.uTip.value as Color).set(colors.tip)
			;(uniforms.uRoot.value as Color).set(colors.root)

			const resolution = alphaTexture.image.width as number
			const target = this.getRenderTarget(resolution)
			this.renderer.setRenderTarget(target)
			this.renderer.render(this.scene, this.camera)
			this.renderer.setRenderTarget(null)

			return target.texture
		} finally {
			loaded.forEach((texture) => texture.dispose())
		}
	}

	/**
	 * Same as `compose`, but reads the rendered result back into a plain `<canvas>` instead of
	 * returning the render-target-backed `Texture` - used where the caller needs the pixels outside
	 * this composer's own WebGL context (a thumbnail `<img>`, or `HairCardBakePreviewRenderer`'s
	 * separate renderer/context - a `WebGLRenderTarget`'s texture can't be handed to a different
	 * `WebGLRenderer` directly). Null under the same conditions `compose` returns null.
	 */
	public async composeToCanvas(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
		colors: HairPreviewColors
	): Promise<HTMLCanvasElement | null> {
		const composed = await this.compose(bakedMaps, colors)
		if (!composed || !this.renderTarget) {
			return null
		}

		const { width, height } = this.renderTarget
		const pixels = new Uint8Array(width * height * 4)
		this.renderer.readRenderTargetPixels(this.renderTarget, 0, 0, width, height, pixels)

		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (!context) {
			throw new Error('HairCardPreviewMapComposer.composeToCanvas: 2D canvas context is unavailable.')
		}

		// WebGL read-back rows run bottom-to-top; canvas ImageData rows run top-to-bottom.
		const imageData = context.createImageData(width, height)
		const rowBytes = width * 4
		for (let y = 0; y < height; y++) {
			const sourceRow = height - 1 - y
			imageData.data.set(pixels.subarray(sourceRow * rowBytes, (sourceRow + 1) * rowBytes), y * rowBytes)
		}
		context.putImageData(imageData, 0, 0)
		return canvas
	}

	/**
	 * The full "preview material" recipe: `composeToCanvas`'s result wrapped in a `CanvasTexture`
	 * (safe to assign to a material rendered by any `WebGLRenderer`, canvas sources aren't tied to
	 * one GL context the way a render target's texture is), plus the baked `normal` map loaded
	 * straight from its own storage URL alongside it - unlike the composed diffuse/alpha, the normal
	 * map isn't blended with anything, so a plain `TextureLoader` load is enough. Null under the same
	 * condition `composeToCanvas` returns null (no `alpha` baked); `normalMap` is independently null
	 * when `normal` hasn't been baked. Callers own the returned texture(s) - dispose them once
	 * replaced or no longer needed (see GroomEditorController.ensureCardStripPreviewMap/
	 * HairCardBakePreviewRenderer.showPreview).
	 */
	public async composePreview(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
		colors: HairPreviewColors
	): Promise<{ texture: CanvasTexture; normalMap: Texture | null } | null> {
		const canvas = await this.composeToCanvas(bakedMaps, colors)
		if (!canvas) {
			return null
		}
		const normalUrl = bakedMaps.normal?.url
		// Normal maps stay in the loader's default linear color space - only the diffuse/base-color
		// output (this composed canvas) needs the sRGB reinterpretation.
		const normalMap = normalUrl ? await this.textureLoader.loadAsync(normalUrl) : null
		const texture = new CanvasTexture(canvas)
		texture.colorSpace = SRGBColorSpace
		return { texture, normalMap }
	}

	public dispose(): void {
		this.renderTarget?.dispose()
		this.material.dispose()
		this.quad.geometry.dispose()
		this.renderer.dispose()
	}

	private async loadRequired(url: string, loaded: Texture[]): Promise<Texture> {
		const texture = await this.textureLoader.loadAsync(url)
		loaded.push(texture)
		return texture
	}

	private async loadOptional(url: string | undefined, loaded: Texture[]): Promise<Texture | null> {
		return url ? this.loadRequired(url, loaded) : null
	}

	private getRenderTarget(resolution: number): WebGLRenderTarget {
		if (!this.renderTarget || this.renderTarget.width !== resolution) {
			this.renderTarget?.dispose()
			this.renderTarget = new WebGLRenderTarget(resolution, resolution, { type: UnsignedByteType })
		}
		return this.renderTarget
	}
}
