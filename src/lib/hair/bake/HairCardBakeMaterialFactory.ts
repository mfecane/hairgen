import { HAIR_CARD } from '@/constants'
import { MeshBasicMaterial, MeshNormalMaterial, ShaderMaterial, UniformsLib, UniformsUtils } from 'three'

const HEIGHT_VERTEX_SHADER = /* glsl */ `
	varying float vLocalZ;
	void main() {
		vLocalZ = position.z;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const HEIGHT_FRAGMENT_SHADER = /* glsl */ `
	uniform float uMaxHeight;
	varying float vLocalZ;
	void main() {
		float height = uMaxHeight > 0.0 ? clamp(vLocalZ / uMaxHeight, 0.0, 1.0) : 0.0;
		gl_FragColor = vec4(vec3(height), 1.0);
	}
`

// hairT is 0 at a strand's root ring, 1 at its tip - see HairStrandGeometryGenerator.assignHairT.
const HAIR_T_VERTEX_SHADER = /* glsl */ `
	attribute float hairT;
	varying float vHairT;
	void main() {
		vHairT = hairT;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const ROOTS_FRAGMENT_SHADER = /* glsl */ `
	uniform float uScale;
	varying float vHairT;
	void main() {
		float gray = clamp(1.0 - vHairT / max(uScale, 0.0001), 0.0, 1.0);
		gl_FragColor = vec4(vec3(gray), 1.0);
	}
`

const TIPS_FRAGMENT_SHADER = /* glsl */ `
	uniform float uScale;
	varying float vHairT;
	void main() {
		float gray = clamp((vHairT - (1.0 - uScale)) / max(uScale, 0.0001), 0.0, 1.0);
		gl_FragColor = vec4(vec3(gray), 1.0);
	}
`

const AO_POSITION_VERTEX_SHADER = /* glsl */ `
	varying vec3 vLocalPosition;
	void main() {
		vLocalPosition = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const AO_POSITION_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vLocalPosition;
	void main() {
		gl_FragColor = vec4(vLocalPosition, 1.0);
	}
`

// Deliberately the object-space `normal` attribute, not one transformed by normalMatrix - the AO
// pass's secondary rays are cast against the geometry in the same object space it was built in.
const AO_NORMAL_VERTEX_SHADER = /* glsl */ `
	varying vec3 vLocalNormal;
	void main() {
		vLocalNormal = normal;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const AO_NORMAL_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vLocalNormal;
	void main() {
		gl_FragColor = vec4(normalize(vLocalNormal), 1.0);
	}
`

// HairCardBakeShadowSweepAoPass's "flat white, shadows only" material - it deliberately skips the
// usual N.L diffuse term (that would leak Lambertian falloff into the AO signal) and outputs
// three.js's own getShadowMask() directly, so the only shading is self-shadowing from the swept
// light. `lights: true` on the ShaderMaterial using this shader is what makes the renderer populate
// the directional-light shadow uniforms these chunks read.
const AO_SHADOW_VERTEX_SHADER = /* glsl */ `
	#include <common>
	#include <shadowmap_pars_vertex>
	void main() {
		#include <beginnormal_vertex>
		#include <defaultnormal_vertex>
		#include <begin_vertex>
		#include <project_vertex>
		#include <worldpos_vertex>
		#include <shadowmap_vertex>
	}
`

const AO_SHADOW_FRAGMENT_SHADER = /* glsl */ `
	#include <common>
	#include <packing>
	uniform bool receiveShadow;
	#include <shadowmap_pars_fragment>
	#include <shadowmask_pars_fragment>
	void main() {
		gl_FragColor = vec4(vec3(getShadowMask()), 1.0);
	}
`

/**
 * One material per bake map kind, swapped onto the bake mesh between renders (see
 * HairCardBaker/HairCardBakeGpuRenderer). Every material but createAoShadowMaterial is unlit (no
 * scene lighting is set up for the bake) - each map kind encodes its own value directly as a color,
 * not a lit appearance.
 */
export class HairCardBakeMaterialFactory {
	/** Rendered onto a scene cleared to black - the resulting grayscale image is the alpha/coverage mask every other map's dilation pass depends on. */
	public createAlphaMaterial(): MeshBasicMaterial {
		return new MeshBasicMaterial({ color: 0xffffff })
	}

	/** The single flat hair color already used by EditorController.hairCardStrandMaterial. */
	public createColorMaterial(): MeshBasicMaterial {
		return new MeshBasicMaterial({ color: HAIR_CARD.STRAND.COLOR })
	}

	/** View-space normal-as-color - see the class doc on HairCardBakeOrthographicCamera for why this bake camera makes that coincide with object space. */
	public createNormalMaterial(): MeshNormalMaterial {
		return new MeshNormalMaterial()
	}

	public createHeightMaterial(maxHeight: number): ShaderMaterial {
		return new ShaderMaterial({
			uniforms: { uMaxHeight: { value: maxHeight } },
			vertexShader: HEIGHT_VERTEX_SHADER,
			fragmentShader: HEIGHT_FRAGMENT_SHADER,
		})
	}

	public createRootsMaterial(scale: number): ShaderMaterial {
		return new ShaderMaterial({
			uniforms: { uScale: { value: scale } },
			vertexShader: HAIR_T_VERTEX_SHADER,
			fragmentShader: ROOTS_FRAGMENT_SHADER,
		})
	}

	public createTipsMaterial(scale: number): ShaderMaterial {
		return new ShaderMaterial({
			uniforms: { uScale: { value: scale } },
			vertexShader: HAIR_T_VERTEX_SHADER,
			fragmentShader: TIPS_FRAGMENT_SHADER,
		})
	}

	/** Reads the `color` attribute HairCardIdGroupAssigner.paintVertexColors writes onto a bake-local geometry clone. */
	public createIdMaterial(): MeshBasicMaterial {
		return new MeshBasicMaterial({ vertexColors: true })
	}

	public createAoPositionMaterial(): ShaderMaterial {
		return new ShaderMaterial({ vertexShader: AO_POSITION_VERTEX_SHADER, fragmentShader: AO_POSITION_FRAGMENT_SHADER })
	}

	public createAoNormalMaterial(): ShaderMaterial {
		return new ShaderMaterial({ vertexShader: AO_NORMAL_VERTEX_SHADER, fragmentShader: AO_NORMAL_FRAGMENT_SHADER })
	}

	/** See HairCardBakeShadowSweepAoPass - the caller is responsible for the mesh's castShadow/receiveShadow flags and for enabling WebGLRenderer.shadowMap. */
	public createAoShadowMaterial(): ShaderMaterial {
		return new ShaderMaterial({
			lights: true,
			// `lights: true` only makes the renderer refresh uniforms named directionalLightShadows/
			// directionalShadowMap/etc (WebGLRenderer's refreshMaterialUniforms) - it does not declare
			// them. Unlike the built-in materials (whose ShaderLib entry already merges in
			// UniformsLib.lights), a plain ShaderMaterial has to bring its own copy, or that refresh
			// throws setting `.value` on an undefined uniform.
			uniforms: UniformsUtils.clone(UniformsLib.lights),
			vertexShader: AO_SHADOW_VERTEX_SHADER,
			fragmentShader: AO_SHADOW_FRAGMENT_SHADER,
		})
	}
}
