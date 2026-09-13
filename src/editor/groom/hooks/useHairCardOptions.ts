'use client'

import { SceneObjectData } from '@/editor/main/Project'
import { useEffect, useState } from 'react'

export interface HairCardOption {
	id: string
	label: string
}

/**
 * Fetches the sibling object-project's hair cards for SplineOptionsPanel's picker - no new API
 * route needed, just the same `GET /api/projects/[projectId]` route the groom persistence hook
 * already calls, filtered to `type === 'hairCard'`. Labeled "Hair card N" by order, mirroring
 * HairCardsPanel's own convention (there's no name field on either scene-object model). `loaded`
 * is only ever set from within the fetch's own callbacks (never synchronously in the effect body,
 * mirroring useProjectPersistence's `loaded`), so there's nothing to reset when there's no
 * `projectId` - it just stays at its initial "not loaded" value.
 */
export function useHairCardOptions(projectId: string | undefined) {
	const [hairCards, setHairCards] = useState<HairCardOption[]>([])
	const [loaded, setLoaded] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!projectId) {
			return
		}
		let cancelled = false

		fetch(`/api/projects/${projectId}`)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`useHairCardOptions: failed to load project "${projectId}" (${response.status})`)
				}
				const { project } = await response.json()
				if (cancelled) {
					return
				}
				const cards = (project.scene as SceneObjectData[]).filter((object) => object.type === 'hairCard')
				setHairCards(cards.map((card, index) => ({ id: card.id, label: `Hair card ${index + 1}` })))
			})
			.catch((cause: unknown) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause))
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoaded(true)
				}
			})

		return () => {
			cancelled = true
		}
	}, [projectId])

	return { hairCards, loading: !loaded, error }
}
