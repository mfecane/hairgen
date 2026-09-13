import { HairPreviewColors } from '@/lib/hair/compose/HairCardPreviewMapTypes'

/** Shallow shape check for a client-submitted `previewColors` body field - shared by both project routes that accept it (PUT /api/projects/[projectId], POST /api/projects). */
export function isValidPreviewColors(value: unknown): value is HairPreviewColors {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.primary === 'string' &&
		typeof candidate.secondary === 'string' &&
		typeof candidate.tip === 'string' &&
		typeof candidate.root === 'string'
	)
}
