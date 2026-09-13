import { HairCardBakeRequest } from '@/lib/hair/bake/HairCardBakeTypes'

/** Shallow shape check for a client-submitted `bakeOptions` body field - shared by both project routes that accept it (PUT /api/projects/[projectId], POST /api/projects), same reasoning as isValidPreviewColors. */
export function isValidBakeOptions(value: unknown): value is HairCardBakeRequest {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.resolution === 'number' &&
		typeof candidate.alpha === 'boolean' &&
		typeof candidate.color === 'boolean' &&
		typeof candidate.normal === 'boolean' &&
		typeof candidate.ao === 'boolean' &&
		typeof candidate.height === 'boolean' &&
		isValidScaledOption(candidate.roots) &&
		isValidScaledOption(candidate.tips) &&
		isValidGroupedOption(candidate.id)
	)
}

function isValidScaledOption(value: unknown): value is { enabled: boolean; scale: number } {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const candidate = value as Record<string, unknown>
	return typeof candidate.enabled === 'boolean' && typeof candidate.scale === 'number'
}

function isValidGroupedOption(value: unknown): value is { enabled: boolean; groupCount: number } {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const candidate = value as Record<string, unknown>
	return typeof candidate.enabled === 'boolean' && typeof candidate.groupCount === 'number'
}
