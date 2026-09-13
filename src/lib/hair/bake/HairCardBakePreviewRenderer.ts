import { BAKE, EDITOR_SCENE_COLORS, EditorTheme } from '@/constants'
import { ElementResizeObserver } from '@/editor/main/ElementResizeObserver'
import { BakeMapKind } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardPreviewMapComposer } from '@/lib/hair/compose/HairCardPreviewMapComposer'
import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'
import {
	AmbientLight,
	Color,
	DirectionalLight,
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	Texture,
	TextureLoader,
	WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Standalone three.js scene mounted by HairCardBakePreviewPanel - a single plane spanning the same
 * 0-1 UV space as the baked atlas (see docs/editor/hair-cards-plan.md's "Baking"), shown as an
 * actual hair card. `showPreview` is the default view: HairCardPreviewMapComposer's "preview
 * material" recipe (the composed alpha/id/roots/tips + colors blend, plus the baked normal map if
 * one exists) - the same material recipe the groom editor's merged Textured/Preview view mode uses,
 * see docs/editor/hair-cards-plan.md's "Preview material" section. `showSingleMap` is the debug
 * override entered by clicking one map's own checkbox card, showing that one stored map alone,
 * unlit. Entirely independent of Editor/Viewport, which render the live project scene, not one
 * bake's output - owns its own renderer/camera/controls/render loop.
 */
export class HairCardBakePreviewRenderer {
	private readonly scene: Scene = new Scene()

	private readonly camera: PerspectiveCamera

	private readonly renderer: WebGLRenderer

	private readonly controls: OrbitControls

	private readonly geometry: PlaneGeometry

	private readonly material: MeshStandardMaterial

	/** Applied instead of `material` while one raw map is shown alone - see `showSingleMap`. */
	private readonly singleMapMaterial: MeshBasicMaterial

	private readonly mesh: Mesh

	private readonly textureLoader = new TextureLoader()

	private readonly previewComposer = new HairCardPreviewMapComposer()

	private readonly resizeObserver: ElementResizeObserver

	private singleMapTexture: Texture | null = null

	/** Cache key (bake map URLs + colors) last applied by showPreview - see its own doc. */
	private appliedPreviewKey: string | null = null

	private readonly renderFrame = (): void => {
		this.controls.update()
		this.renderer.render(this.scene, this.camera)
		this.animationFrameId = requestAnimationFrame(this.renderFrame)
	}

	private animationFrameId: number

	private disposed = false

	public constructor(mountElement: HTMLElement, theme: EditorTheme) {
		this.scene.name = 'hairCardBakePreviewScene'
		this.scene.background = new Color(EDITOR_SCENE_COLORS[theme].viewportBackground)

		const ambientLight = new AmbientLight(0xffffff, 0.7)
		ambientLight.name = 'hairCardBakePreviewAmbientLight'
		this.scene.add(ambientLight)

		const directionalLight = new DirectionalLight(0xffffff, 1.2)
		directionalLight.name = 'hairCardBakePreviewDirectionalLight'
		directionalLight.position.set(2, 3, 4)
		this.scene.add(directionalLight)

		const { clientWidth, clientHeight } = mountElement
		this.camera = new PerspectiveCamera(45, clientWidth / (clientHeight || 1), 0.01, 100)
		this.camera.name = 'hairCardBakePreviewCamera'
		this.camera.position.set(0, 0, BAKE.PREVIEW.CAMERA_DISTANCE)

		this.renderer = new WebGLRenderer({ antialias: true })
		this.renderer.setSize(clientWidth, clientHeight)
		this.renderer.setPixelRatio(window.devicePixelRatio)
		mountElement.appendChild(this.renderer.domElement)

		this.controls = new OrbitControls(this.camera, this.renderer.domElement)
		this.controls.enableDamping = true

		this.geometry = new PlaneGeometry(1, 1)
		this.geometry.name = 'hairCardBakePreviewGeometry'
		this.geometry.setAttribute('uv2', this.geometry.attributes.uv)

		this.material = new MeshStandardMaterial({
			name: 'hairCardBakePreviewMaterial',
			roughness: BAKE.PREVIEW.ROUGHNESS,
			metalness: BAKE.PREVIEW.METALNESS,
			side: DoubleSide,
		})

		this.singleMapMaterial = new MeshBasicMaterial({
			name: 'hairCardBakePreviewSingleMapMaterial',
			side: DoubleSide,
			transparent: true,
		})

		this.mesh = new Mesh(this.geometry, this.material)
		this.mesh.name = 'hairCardBakePreviewCard'
		this.scene.add(this.mesh)

		this.resizeObserver = new ElementResizeObserver(mountElement, () => this.handleResize(mountElement))
		this.animationFrameId = requestAnimationFrame(this.renderFrame)
	}

	/**
	 * The default view: composes the "preview material" (HairCardPreviewMapComposer.composePreview)
	 * from `bakedMaps`/`colors` and applies it to `material` - idempotent, skips recomposing when the
	 * same (urls, colors) combination is already applied, same caching shape as
	 * GroomEditorController.ensureCardStripPreviewMap. Clears back to a plain unmapped card when
	 * `bakedMaps` has no `alpha` (the composer's one required map) - HairCardBakePreviewPanel shows
	 * its own warning for that case instead of leaving a stale texture on screen.
	 */
	public async showPreview(
		bakedMaps: Partial<Record<BakeMapKind, { url: string }>>,
		colors: HairPreviewColors
	): Promise<void> {
		const key = JSON.stringify({ maps: bakedMaps, colors })
		if (key === this.appliedPreviewKey) {
			return
		}
		this.appliedPreviewKey = key
		const result = await this.previewComposer.composePreview(bakedMaps, colors)
		if (this.disposed || key !== this.appliedPreviewKey) {
			result?.texture.dispose()
			result?.normalMap?.dispose()
			return
		}
		this.material.map?.dispose()
		this.material.normalMap?.dispose()
		this.material.map = result?.texture ?? null
		this.material.normalMap = result?.normalMap ?? null
		this.material.transparent = Boolean(result)
		this.material.needsUpdate = true
	}

	/**
	 * Shows one stored map alone, unlit, on the same quad - entered by clicking a map's checkbox
	 * card (HairCardBakeMapCheckboxCard). Swaps the mesh onto `singleMapMaterial` so `material` (and
	 * whatever `showPreview` applied to it) is left untouched for `exitSingleMap` to restore.
	 */
	public async showSingleMap(url: string): Promise<void> {
		const texture = await this.textureLoader.loadAsync(url)
		if (this.disposed) {
			texture.dispose()
			return
		}
		this.singleMapTexture?.dispose()
		this.singleMapTexture = texture
		this.singleMapMaterial.map = texture
		this.singleMapMaterial.needsUpdate = true
		this.mesh.material = this.singleMapMaterial
	}

	/** Leaves single-map preview mode, back to the default preview material. */
	public exitSingleMap(): void {
		this.mesh.material = this.material
		this.singleMapTexture?.dispose()
		this.singleMapTexture = null
		this.singleMapMaterial.map = null
	}

	public dispose(): void {
		this.disposed = true
		cancelAnimationFrame(this.animationFrameId)
		this.resizeObserver.dispose()
		this.controls.dispose()
		this.material.map?.dispose()
		this.material.normalMap?.dispose()
		this.singleMapTexture?.dispose()
		this.previewComposer.dispose()
		this.geometry.dispose()
		this.material.dispose()
		this.singleMapMaterial.dispose()
		this.renderer.dispose()
		this.renderer.domElement.remove()
	}

	private handleResize(mountElement: HTMLElement): void {
		const { clientWidth, clientHeight } = mountElement
		if (clientWidth === 0 || clientHeight === 0) {
			return
		}
		this.camera.aspect = clientWidth / clientHeight
		this.camera.updateProjectionMatrix()
		this.renderer.setSize(clientWidth, clientHeight)
	}
}
