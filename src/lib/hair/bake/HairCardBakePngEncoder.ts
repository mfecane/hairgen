/** Encodes a rendered map's ImageData to a PNG Blob via a detached canvas - no OffscreenCanvas, since a bake only ever runs in a real tab (not a worker), and the plain canvas API has the broadest support. */
export class HairCardBakePngEncoder {
	public encode(image: ImageData): Promise<Blob> {
		const canvas = document.createElement('canvas')
		canvas.width = image.width
		canvas.height = image.height
		const context = canvas.getContext('2d')
		if (!context) {
			return Promise.reject(new Error('HairCardBakePngEncoder: failed to acquire a 2D canvas context.'))
		}
		context.putImageData(image, 0, 0)

		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) {
					resolve(blob)
				} else {
					reject(new Error('HairCardBakePngEncoder: canvas.toBlob produced no blob.'))
				}
			}, 'image/png')
		})
	}
}
