import { HitTester } from '@/editor/main/HitTester'
import { Object3D } from 'three'

/**
 * The single owner of "what's currently pickable in the groom viewport" - replaces three
 * independent mechanisms this editor used to rely on to approximate the same thing, each of which
 * could drift out of sync with the others since nothing tied them together:
 *
 *  - SplineVertexGizmo capturing `Mesh.prototype.raycast` once and toggling its two knob colliders
 *    between that and a no-op every time the active vertex changed (setHandlesRaycastable).
 *  - SplineBodyGeometry doing the identical capture-and-toggle dance on each spline's collider
 *    tube/card strip, every frame, based on selection (setSplineBodyPickable).
 *  - HitTester being handed whole `Group`s (e.g. splineVertexWidget.handleGroup) and trusting that
 *    recursing into "whatever's currently a child" - filtered down to the eligible subset purely by
 *    the two toggles above - happened to line up with what the cursor should actually be able to hit.
 *
 * None of the collider meshes this manager's callers own ever have their own `.raycast` touched
 * anymore (see SplineVertexGizmo.getPickableColliders/SplineVertexWidget.getColliders/
 * SplineBodyGeometry.getPickableBodyCollider) - a collider is pickable this frame if and only if it's
 * in the array `rebuild` was given for its tier, full stop. One source of truth instead of three,
 * each previously reachable only by reading a different file's raycast-toggle call site.
 *
 * Tiers keep HitTester's existing "first non-empty tier wins outright" priority semantics (see its
 * own class doc) - callers still decide priority by array order (gizmo colliders ahead of position
 * handles ahead of spline bodies, see GroomViewport's rebuildPickability) - but every tier here is a
 * flat array of leaf collider objects, never a container relying on recursion plus visibility/raycast
 * tricks to arrive at the right set. That's the "raycast one by one" contract: each object in a tier
 * either IS meant to be hit-tested this frame, or it simply isn't in the array.
 *
 * Rebuilt every frame from GroomViewport.render() (after SplineVertexWidget/SplineVertexGizmo have
 * repositioned themselves and applyViewModeAndGhosting has resolved this frame's per-spline
 * selection/tool state) rather than only on discrete selection/tool-change events: the position
 * handle pool's own size is itself only recomputed per-frame (SplineVertexWidget.update, driven by
 * the selected spline's live vertex count, which can change mid-drag), so piggybacking on that same
 * cadence is what keeps this always correct without a second "did anything relevant change" check to
 * keep in sync with it. The rebuild itself is a handful of array reads/pushes - negligible next to
 * the rest of a render frame.
 */
export class RaycastableObjectsManager {
	public constructor(private readonly hitTester: HitTester) {}

	/**
	 * Replaces every tier HitTester will raycast against. Empty tiers are dropped rather than passed
	 * through - an empty tier can never win a hit test, but keeping it out of the array makes that
	 * explicit rather than relying on `intersectObjects([])` happening to return nothing.
	 */
	public rebuild(tiers: readonly (readonly Object3D[])[]): void {
		this.hitTester.setTargets(tiers.filter((tier) => tier.length > 0).map((tier) => [...tier]))
	}
}
