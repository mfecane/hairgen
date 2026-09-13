/**
 * Grows a map's valid (alpha > 0) region outward by averaging valid neighbors, a fixed number of
 * passes - erases seams at bilinear-filtering/mip-mapping edges once the card is textured. Applied
 * to every requested map except alpha itself (alpha is the mask driving dilation for the rest - see
 * HairCardBaker.bake). Never mutates its inputs.
 */
export class HairCardBakeDilator {
	public dilate(image: ImageData, alphaMask: ImageData, passes: number): ImageData {
		const { width, height } = image
		let current = new Uint8ClampedArray(image.data)
		let valid = new Uint8Array(width * height)
		for (let i = 0; i < valid.length; i++) {
			valid[i] = alphaMask.data[i * 4] > 0 ? 1 : 0
		}

		for (let pass = 0; pass < passes; pass++) {
			const next = new Uint8ClampedArray(current)
			const nextValid = new Uint8Array(valid)
			let grew = false

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const index = y * width + x
					if (valid[index]) {
						continue
					}

					let r = 0
					let g = 0
					let b = 0
					let count = 0
					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							if (dx === 0 && dy === 0) {
								continue
							}
							const nx = x + dx
							const ny = y + dy
							if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
								continue
							}
							const neighborIndex = ny * width + nx
							if (!valid[neighborIndex]) {
								continue
							}
							const base = neighborIndex * 4
							r += current[base]
							g += current[base + 1]
							b += current[base + 2]
							count++
						}
					}

					if (count > 0) {
						const base = index * 4
						next[base] = r / count
						next[base + 1] = g / count
						next[base + 2] = b / count
						next[base + 3] = 255
						nextValid[index] = 1
						grew = true
					}
				}
			}

			current = next
			valid = nextValid
			if (!grew) {
				break
			}
		}

		return new ImageData(current, width, height)
	}
}
