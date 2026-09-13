import crypto from 'crypto'

export { createSeededRandom } from '@/lib/math/seededRandom'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * simple base62 encoder from bytes
 */
function bytesToAlphabet(bytes: Uint8Array, length: number): string {
	let result = ''

	for (let i = 0; result.length < length; i++) {
		const byte = bytes[i % bytes.length]
		result += ALPHABET[byte % ALPHABET.length]
	}

	return result
}

/**
 * Node-only sync hash.
 */
function sha256Sync(input: string): Uint8Array {
	return crypto.createHash('sha256').update(input).digest()
}

/**
 * Sync string ID generator (Node only, for seed scripts).
 */
export function createSeededIdGenerator(
	seed: string,
	options?: {
		length?: number
		namespace?: string
	}
) {
	const length = options?.length ?? 12
	const namespace = options?.namespace ?? 'id'

	let counter = 0

	return function generateId(): string {
		const input = `${namespace}:${seed}:${counter++}`
		const bytes = sha256Sync(input)
		return bytesToAlphabet(bytes, length)
	}
}
