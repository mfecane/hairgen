import { BAKE } from '@/constants'
import { HairCardBakeAoAlgorithm } from '@/lib/hair/bake/HairCardBakeAoAlgorithm'
import { HairCardBakeAoAlgorithmFactory } from '@/lib/hair/bake/HairCardBakeAoAlgorithmFactory'
import { HairCardBakeDilator } from '@/lib/hair/bake/HairCardBakeDilator'
import { HairCardBakeGpuRenderer } from '@/lib/hair/bake/HairCardBakeGpuRenderer'
import { BAKE_MAP_LABELS } from '@/lib/hair/bake/HairCardBakeMapLabels'
import { HairCardBakeMaterialFactory } from '@/lib/hair/bake/HairCardBakeMaterialFactory'
import { HairCardBakeOrthographicCamera } from '@/lib/hair/bake/HairCardBakeOrthographicCamera'
import { HairCardBakePngEncoder } from '@/lib/hair/bake/HairCardBakePngEncoder'
import { BakeMapKind, HairCardBakeInput, HairCardBakeMapResult, HairCardBakeResult } from '@/lib/hair/bake/HairCardBakeTypes'
import { HairCardIdGroupAssigner } from '@/lib/hair/bake/HairCardIdGroupAssigner'
import { BufferGeometry, Material, Mesh, Scene } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Orchestrates one atlas bake: clones and translates every card's current strand geometry into the
 * shared working area, merges those clones, builds an orthographic camera framed to the complete
 * 0-1 atlas, then renders each requested map by swapping the bake mesh's material - see
 * HairCardBakeMaterialFactory for what each map kind looks like. Owns its WebGLRenderer for its own
 * lifetime (constructing a GL context is expensive) - call dispose() once, when the owning
 * EditorController is torn down, not per bake.
 */
export class HairCardBaker {
	private readonly cameraFactory: HairCardBakeOrthographicCamera = new HairCardBakeOrthographicCamera()

	private readonly materialFactory: HairCardBakeMaterialFactory = new HairCardBakeMaterialFactory()

	private readonly gpuRenderer: HairCardBakeGpuRenderer = new HairCardBakeGpuRenderer()

	private readonly idAssigner: HairCardIdGroupAssigner = new HairCardIdGroupAssigner()

	private readonly aoAlgorithm: HairCardBakeAoAlgorithm = new HairCardBakeAoAlgorithmFactory().create()

	private readonly dilator: HairCardBakeDilator = new HairCardBakeDilator()

	private readonly pngEncoder: HairCardBakePngEncoder = new HairCardBakePngEncoder()

	public async bake(input: HairCardBakeInput): Promise<HairCardBakeResult> {
		const { request } = input
		if (!this.anyMapRequested(request)) {
			throw new Error('HairCardBaker.bake: at least one map must be requested.')
		}
		if (input.cards.length === 0) {
			throw new Error('HairCardBaker.bake: at least one hair card is required.')
		}

		const geometry = this.createAtlasGeometry(input)
		geometry.computeBoundingBox()
		const maxHeight = geometry.boundingBox?.max.z ?? 0

		const camera = this.cameraFactory.create(geometry)
		const scene = new Scene()
		scene.name = 'hairCardBakeScene'
		const mesh = new Mesh(geometry)
		mesh.name = 'hairCardBakeMesh'
		scene.add(mesh)

		const resolution = request.resolution
		const maps: HairCardBakeMapResult[] = []
		const createdMaterials: Material[] = []
		let alphaImage: ImageData | null = null
		const setMaterial = (material: Material): void => {
			createdMaterials.push(material)
			mesh.material = material
		}
		const pushDilated = async (kind: BakeMapKind, image: ImageData): Promise<void> => {
			if (!alphaImage) {
				throw new Error('HairCardBaker: dilation requires the alpha mask to have been rendered first.')
			}
			const dilated = this.dilator.dilate(image, alphaImage, BAKE.DILATION_PASSES)
			maps.push({ kind, blob: await this.pngEncoder.encode(dilated), resolution })
		}

		// Only the kinds actually requested (alpha is always rendered in memory regardless, to drive
		// dilation, but isn't a step the user asked for unless request.alpha is also true) - drives
		// both the progress index/total below and this array's own ordering match the render order.
		const requestedKinds: BakeMapKind[] = (
			[
				['alpha', request.alpha],
				['color', request.color],
				['normal', request.normal],
				['height', request.height],
				['roots', request.roots.enabled],
				['tips', request.tips.enabled],
				['id', request.id.enabled],
				['ao', request.ao],
			] as const
		)
			.filter(([, enabled]) => enabled)
			.map(([kind]) => kind)
		const total = requestedKinds.length
		const reportProgress = (kind: BakeMapKind, subLabel?: string): void => {
			const index = requestedKinds.indexOf(kind) + 1
			const label = subLabel ? `${BAKE_MAP_LABELS[kind]} (${subLabel})` : BAKE_MAP_LABELS[kind]
			input.onProgress?.({ label, index, total })
		}

		// Named before each step below and reported on failure - the underlying WebGL/three.js errors
		// this can throw (an out-of-VRAM allocation, a broken custom shader, ...) never say which map
		// or algorithm was rendering when they happened, so this is the only way to localize one.
		let currentStep = 'alpha (coverage mask)'
		try {
			input.signal?.throwIfAborted()
			// Always rendered, in memory - every other map's dilation depends on this mask even when
			// the alpha map itself wasn't requested.
			setMaterial(this.materialFactory.createAlphaMaterial())
			alphaImage = this.gpuRenderer.renderImage(scene, camera, resolution)
			if (request.alpha) {
				reportProgress('alpha')
				maps.push({ kind: 'alpha', blob: await this.pngEncoder.encode(alphaImage), resolution })
			}

			if (request.color) {
				input.signal?.throwIfAborted()
				currentStep = 'color'
				reportProgress('color')
				setMaterial(this.materialFactory.createColorMaterial())
				await pushDilated('color', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.normal) {
				input.signal?.throwIfAborted()
				currentStep = 'normal'
				reportProgress('normal')
				setMaterial(this.materialFactory.createNormalMaterial())
				await pushDilated('normal', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.height) {
				input.signal?.throwIfAborted()
				currentStep = 'height'
				reportProgress('height')
				setMaterial(this.materialFactory.createHeightMaterial(maxHeight))
				await pushDilated('height', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.roots.enabled) {
				input.signal?.throwIfAborted()
				currentStep = 'roots'
				reportProgress('roots')
				setMaterial(this.materialFactory.createRootsMaterial(request.roots.scale))
				await pushDilated('roots', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.tips.enabled) {
				input.signal?.throwIfAborted()
				currentStep = 'tips'
				reportProgress('tips')
				setMaterial(this.materialFactory.createTipsMaterial(request.tips.scale))
				await pushDilated('tips', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.id.enabled) {
				input.signal?.throwIfAborted()
				currentStep = 'id'
				reportProgress('id')
				const strandCount = this.countStrands(geometry)
				const groupByStrandIndex = this.idAssigner.assign(strandCount, request.id.groupCount, input.seed)
				this.idAssigner.paintVertexColors(geometry, groupByStrandIndex, request.id.groupCount)
				setMaterial(this.materialFactory.createIdMaterial())
				await pushDilated('id', this.gpuRenderer.renderImage(scene, camera, resolution))
			}
			if (request.ao) {
				input.signal?.throwIfAborted()
				currentStep = `ao (${BAKE.AO.ALGORITHM} algorithm)`
				reportProgress('ao')
				if (!alphaImage) {
					throw new Error('HairCardBaker: AO requires the alpha mask to have been rendered first.')
				}
				const aoImage = await this.aoAlgorithm.compute(
					scene,
					mesh,
					camera,
					this.gpuRenderer,
					this.materialFactory,
					alphaImage,
					resolution,
					input.seed,
					{ signal: input.signal, onSweepProgress: (subLabel) => reportProgress('ao', subLabel) }
				)
				await pushDilated('ao', aoImage)
			}
		} catch (cause) {
			// An aborted bake must keep its AbortError identity so the caller (HairCardBakeDialog) can
			// tell "the user cancelled" apart from "the map genuinely failed to render" - wrapping it
			// below like every other failure would lose that and always show a scary error message.
			if ((cause as { name?: string } | null)?.name === 'AbortError') {
				throw cause
			}
			throw new Error(
				`HairCardBaker.bake: failed while rendering the "${currentStep}" map: ${cause instanceof Error ? cause.message : String(cause)}`,
				{ cause }
			)
		} finally {
			createdMaterials.forEach((material) => material.dispose())
			geometry.dispose()
		}

		return { cardCount: input.cards.length, maps }
	}

	public dispose(): void {
		this.gpuRenderer.dispose()
	}

	private anyMapRequested(request: HairCardBakeInput['request']): boolean {
		return (
			request.alpha ||
			request.color ||
			request.normal ||
			request.ao ||
			request.height ||
			request.roots.enabled ||
			request.tips.enabled ||
			request.id.enabled
		)
	}

	/** Makes one temporary atlas-space geometry without mutating the cached per-card geometries. */
	private createAtlasGeometry(input: HairCardBakeInput): BufferGeometry {
		let strandIndexOffset = 0
		const geometries = input.cards.map((card) => {
			const geometry = card.geometry.clone()
			const strandIndex = geometry.getAttribute('hairStrandIndex')
			if (!strandIndex) {
				geometry.dispose()
				throw new Error(`HairCardBaker.bake: card "${card.cardId}" geometry has no hairStrandIndex attribute.`)
			}

			let maxStrandIndex = -1
			for (let vertex = 0; vertex < strandIndex.count; vertex++) {
				const localIndex = strandIndex.getX(vertex)
				maxStrandIndex = Math.max(maxStrandIndex, localIndex)
				strandIndex.setX(vertex, localIndex + strandIndexOffset)
			}
			strandIndex.needsUpdate = true
			strandIndexOffset += maxStrandIndex + 1
			geometry.translate(card.position.x, card.position.y, card.position.z)
			return geometry
		})

		try {
			const atlasGeometry = mergeGeometries(geometries, false)
			if (!atlasGeometry) {
				throw new Error('HairCardBaker.bake: failed to merge hair card geometries into the texture atlas.')
			}
			return atlasGeometry
		} finally {
			geometries.forEach((geometry) => geometry.dispose())
		}
	}

	/** Derives the atlas strand count from the highest merged hairStrandIndex vertex value. */
	private countStrands(geometry: BufferGeometry): number {
		const attribute = geometry.getAttribute('hairStrandIndex')
		let max = -1
		for (let i = 0; i < attribute.count; i++) {
			max = Math.max(max, attribute.getX(i))
		}
		return max + 1
	}
}
