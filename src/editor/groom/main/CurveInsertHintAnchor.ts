import { Camera, Object3D, Vector3 } from 'three'

const worldPositionScratch: Vector3 = new Vector3()

/** CSS pixel position, relative to the viewport's mount element - see CurveInsertHintAnchor.getScreenPosition. */
export interface CurveInsertScreenPosition {
	left: number
	top: number
}

/**
 * An empty Object3D marking the point along a selected spline's curve currently under the pointer,
 * while hovering its otherwise-invisible collider tube (GroomViewport.setHoveredCurvePoint,
 * SplineHoverInteractionHandler) - snapped onto the curve itself (SplineBodyGeometry.findClosestPointOnSplineBody)
 * rather than the raw hit point on the tube's surface. Purely a position anchor, no geometry/material
 * of its own - mirrors AddPointAnchor's shape exactly, including duplicating its screen-projection
 * math rather than sharing it (see AddPointAnchor's own doc for why this codebase prefers small
 * independent implementations here over one shared abstraction). Consumed by
 * SplineCurveInsertHint.tsx via GroomViewport.subscribeCurveInsertScreenPosition, bypassing
 * GroomReactBridge/setState for the same reason: this position changes on every Hover event/frame
 * while the pointer sits over the curve, and a state update would lag a frame behind the canvas's own
 * synchronous draw.
 */
export class CurveInsertHintAnchor {
	public readonly object3D: Object3D = new Object3D()

	public constructor() {
		this.object3D.name = 'curveInsertHintAnchor'
		this.object3D.visible = false
	}

	/** Repositions the anchor to the hovered curve point, or hides it while nothing is hovered. */
	public update(point: Vector3 | null): void {
		this.object3D.visible = point !== null
		if (point) {
			this.object3D.position.copy(point)
		}
	}

	/**
	 * This frame's screen-space position for the anchor, in CSS pixels relative to the viewport's
	 * mount element - null while hidden (see update()) or behind the camera. Call only after the
	 * camera/scene have rendered this frame, so `camera`'s matrices are current (see GroomViewport.render).
	 */
	public getScreenPosition(camera: Camera, width: number, height: number): CurveInsertScreenPosition | null {
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
