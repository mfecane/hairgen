import { BAKE, HAIR_CARD } from '@/constants'
import { BufferGeometry, OrthographicCamera } from 'three'

/**
 * Builds the bake's orthographic camera, framed to the complete shared hair-card working area.
 * Its frustum uses offsets around the camera origin, so a 0-1 working area centered at 0.5 needs
 * local bounds -0.5..0.5. It deliberately looks straight down -Z with up = +Y, so its basis
 * coincides with atlas space. This is why HairCardBakeMaterialFactory's normal map can use a plain
 * MeshNormalMaterial (view-space normal-as-color) and get an object-space result without a custom
 * shader, and why the AO pass's G-buffers can be read back as object-space directly.
 */
export class HairCardBakeOrthographicCamera {
	public create(geometry: BufferGeometry): OrthographicCamera {
		geometry.computeBoundingBox()
		const maxZ = geometry.boundingBox?.max.z ?? 0
		const workingAreaCenter = (HAIR_CARD.WORKING_AREA_MIN + HAIR_CARD.WORKING_AREA_MAX) / 2
		const workingAreaHalfExtent = (HAIR_CARD.WORKING_AREA_MAX - HAIR_CARD.WORKING_AREA_MIN) / 2

		// The camera sits just beyond the strand geometry's highest point (world Z), looking back
		// toward the card's z = 0 plane - near/far are camera-space clip distances, not world Z.
		const cameraZ = maxZ + BAKE.CAMERA_FAR_PADDING
		const near = BAKE.CAMERA_NEAR_PADDING
		const far = cameraZ + BAKE.CAMERA_NEAR_PADDING

		const camera = new OrthographicCamera(
			-workingAreaHalfExtent,
			workingAreaHalfExtent,
			workingAreaHalfExtent,
			-workingAreaHalfExtent,
			near,
			far
		)
		camera.name = 'hairCardBakeCamera'
		camera.up.set(0, 1, 0)
		camera.position.set(workingAreaCenter, workingAreaCenter, cameraZ)
		camera.lookAt(workingAreaCenter, workingAreaCenter, 0)
		camera.updateProjectionMatrix()
		return camera
	}
}
