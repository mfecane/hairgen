import { parseApiError } from '@/lib/api/errors'
import { BakedMapsRecord, HairCardBakeMapResult } from '@/lib/hair/bake/HairCardBakeTypes'

export interface HairCardBakeUploadResponse {
	maps: BakedMapsRecord
}

/** Posts the project-wide hair texture atlas maps to the project's storage. */
export class HairCardBakeUploadClient {
	/**
	 * `sceneHash` (Editor.bakeHairCards/HairCardLayoutHash) is stored alongside the maps so a later
	 * GroomHairCardLookup can tell whether the cards have since moved - see the bake route.
	 * `resolution` is the one resolution this whole bake call applied to every map in `maps`
	 * (HairCardBakeRequest.resolution) - stored per map kind so a later partial re-bake at a
	 * different resolution can be detected as a mismatch (see BakedMapsRecord).
	 */
	public async upload(
		projectId: string,
		maps: HairCardBakeMapResult[],
		sceneHash: string,
		resolution: number
	): Promise<HairCardBakeUploadResponse> {
		const formData = new FormData()
		maps.forEach((map) => formData.append(`map_${map.kind}`, map.blob, `${map.kind}.png`))
		formData.append('sceneHash', sceneHash)
		formData.append('resolution', String(resolution))

		const response = await fetch(`/api/projects/${projectId}/hair-cards/bake`, {
			method: 'POST',
			body: formData,
		})
		if (!response.ok) {
			// parseApiError's own `.message` is a friendly, generic-fallback string meant for form-style
			// UI errors elsewhere in the app - not useful here, where the caller needs to localize which
			// map/field the bake route actually rejected, so this reports the structured fields instead.
			const failure = await parseApiError(response, { fallbackMessage: "Failed to store the project's baked maps." })
			throw new Error(
				`HairCardBakeUploadClient.upload: failed to store the project's baked maps (HTTP ${failure.status}, code ${failure.code}` +
					(failure.field ? `, field "${failure.field}"` : '') +
					(failure.rawMessage ? `: ${failure.rawMessage}` : '') +
					')'
			)
		}
		return response.json()
	}
}
