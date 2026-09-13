import { GROOM } from '@/constants'
import { getSplineBodyVertices } from '@/editor/groom/main/SplineBodyGeometry'
import { SelectedSpline } from '@/editor/groom/main/SplineVertexWidget'
import { Camera, Object3D, Vector3 } from 'three'

const worldPositionScratch: Vector3 = new Vector3()

/** CSS pixel position, relative to the viewport's mount element - see AddPointAnchor.getScreenPosition. */
export interface AddPointScreenPosition {
	left: number
	top: number
}

/**
 * An empty Object3D marking where GroomEditor.addVertexToSelectedSpline would place a spline's next
 * vertex - purely a position anchor (no geometry/material of its own). Lives in overlayScene
 * alongside SplineVertexWidget/SplineVertexGizmo, but unlike them draws nothing itself: its only
 * consumer is getScreenPosition, which GroomViewport.render() projects every frame and hands
 * straight to AddPointButton's subscription (GroomViewport.subscribeAddPointScreenPosition) - not
 * through GroomReactBridge/setState, since that lagged a frame behind the canvas's own synchronous
 * draw (see the class doc there).
 */
export class AddPointAnchor {
	public readonly object3D: Object3D = new Object3D()

	public constructor() {
		this.object3D.name = 'addPointAnchor'
		this.object3D.visible = false
	}

	/**
	 * Repositions the anchor to the selected spline's live next-vertex position (reading the same
	 * live mesh vertex array SplineVertexWidget does, so it tracks a drag in progress too), or hides
	 * it entirely while nothing (or more than one thing) is selected.
	 */
	public update(spline: SelectedSpline | null): void {
		const position = spline ? computeNextVertexPosition(getSplineBodyVertices(spline.object)) : null
		this.object3D.visible = position !== null
		if (position) {
			this.object3D.position.copy(position)
		}
	}

	/**
	 * This frame's screen-space position for the anchor, in CSS pixels relative to the viewport's
	 * mount element - null while hidden (see update()) or behind the camera. Call only after the
	 * camera/scene have rendered this frame, so `camera`'s matrices are current (see GroomViewport.render).
	 */
	public getScreenPosition(camera: Camera, width: number, height: number): AddPointScreenPosition | null {
		if (!this.object3D.visible || width === 0 || height === 0) {
			return null
		}
		this.object3D.getWorldPosition(worldPositionScratch)
		// Camera looks down its own local -z - a positive view-space z means the anchor sits behind
		// it, which project() alone doesn't reliably flag once the point is off-frustum.
		const viewSpaceZ = worldPositionScratch.clone().applyMatrix4(camera.matrixWorldInverse).z
		if (viewSpaceZ > 0) {
			return null
		}
		worldPositionScratch.project(camera)
		return {
			left: (worldPositionScratch.x * 0.5 + 0.5) * width,
			top: (-worldPositionScratch.y * 0.5 + 0.5) * height,
		}
	}
}

/**
 * Vector3 twin of GroomProject.ts's computeNextVertexPosition, operating on a spline body mesh's
 * live vertex array (see SplineBodyGeometry's "mesh is live truth during a drag" pattern) rather
 * than persisted SplineVertexData - kept as a separate small implementation rather than a shared
 * one, same as e.g. SplineVertexFrame's live-mesh math vs. the data-model equivalents elsewhere.
 */
function computeNextVertexPosition(positions: readonly Vector3[]): Vector3 | null {
	const last = positions[positions.length - 1]
	if (!last) {
		return null
	}
	const secondToLast = positions[positions.length - 2] ?? null
	const defaultDirection = new Vector3(
		GROOM.SPLINE.DEFAULT_DIRECTION.x,
		GROOM.SPLINE.DEFAULT_DIRECTION.y,
		GROOM.SPLINE.DEFAULT_DIRECTION.z
	)
	const direction = secondToLast ? last.clone().sub(secondToLast) : defaultDirection
	if (direction.lengthSq() < 1e-8) {
		direction.copy(defaultDirection)
	} else {
		direction.normalize()
	}
	return last.clone().addScaledVector(direction, GROOM.SPLINE.NEW_VERTEX_OFFSET)
}
