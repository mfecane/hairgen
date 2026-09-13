import { Intersection, Object3D, Raycaster } from 'three'

export interface HitResult {
	intersection: Intersection<Object3D> | null
	object: Object3D | null
	intersections: Intersection<Object3D>[]
}

/** Anything InteractionContext can raycast against - Viewport implements this. */
export interface HitTestable {
	hitTester: HitTester
}

/**
 * Raycast hit testing against an explicit allow-list of pickable roots, set via setTargets -
 * never the whole scene graph. Lights, grid, gizmos and other helpers are structurally excluded
 * by never being added to that list, rather than by opting each of them out individually.
 *
 * Targets are given as ordered priority tiers, not one flat list: each tier is raycast in turn,
 * and the first tier with any intersection wins outright, regardless of whether a later tier
 * would have produced a closer one. This is what keeps a widget handle pickable even while it
 * sits behind (or inside) an occluding mesh from the camera's point of view - the same "drawn on
 * top" precedence the overlay-scene render pass already gives them visually (see Viewport.render/
 * GroomViewport.render's depth-cleared second pass) is given to hit-testing too, rather than
 * leaving it to whichever object happens to be geometrically closest.
 */
export class HitTester {
	private tiers: Object3D[][] = []

	public setTargets(tiers: Object3D[][]): void {
		this.tiers = tiers
	}

	public performHitTest(raycaster: Raycaster): HitResult {
		for (const tier of this.tiers) {
			const intersections = raycaster.intersectObjects(tier, true)
			if (intersections.length > 0) {
				return { intersection: intersections[0], object: intersections[0].object, intersections }
			}
		}
		return { intersection: null, object: null, intersections: [] }
	}
}
