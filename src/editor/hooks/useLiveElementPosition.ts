'use client'

import { RefObject, useEffect, useRef } from 'react'

export interface LiveElementPosition {
	left: number
	top: number
}

type Subscribe = (listener: (position: LiveElementPosition | null) => void) => AbortController

/**
 * Syncs a DOM element's left/top (and visibility) to a "live" position source that updates outside
 * React's render cycle - typically a viewport's per-frame projection of a 3D anchor onto screen
 * space (see GroomViewport.subscribeAddPointScreenPosition/AddPointButton, the first consumer).
 * Writes style.left/top/display directly on the ref'd node from `subscribe`'s callback instead of
 * via setState: a WebGL canvas redraws synchronously every animation frame, but a state update only
 * takes effect on React's next scheduled re-render/commit - routing a fast-moving overlay position
 * through setState visibly lagged a frame behind the canvas it's supposed to track. `subscribe`
 * itself must be a stable reference (e.g. a bound instance method) across renders, or every render
 * re-subscribes.
 */
export function useLiveElementPosition<T extends HTMLElement>(subscribe: Subscribe | null): RefObject<T | null> {
	const elementRef = useRef<T>(null)

	useEffect(() => {
		if (!subscribe) {
			return
		}
		const subscription = subscribe((position) => {
			const element = elementRef.current
			if (!element) {
				return
			}
			if (!position) {
				element.style.display = 'none'
				return
			}
			element.style.display = ''
			element.style.left = `${position.left}px`
			element.style.top = `${position.top}px`
		})
		return () => subscription.abort()
	}, [subscribe])

	return elementRef
}
