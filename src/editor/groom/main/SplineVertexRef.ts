import { Object3D } from 'three'

/** Which handle of a vertex's gizmo a collider represents - see SplineVertexWidget (position) and SplineVertexGizmo (rotate/scale). */
export type SplineVertexHandleKind = 'position' | 'rotate' | 'scale'

/**
 * Tags a spline vertex handle's collider mesh (see SplineVertexWidget/SplineVertexGizmo) with the
 * spline it belongs to, its index within that spline's vertex list, and which handle kind it is.
 * Separate from tagSceneObject/tryGetSceneObjectId (SceneObjectRef.ts), which identify a selectable
 * scene object rather than a gizmo handle - SplineVertexDragInteractionHandler/
 * SplineVertexRotateInteractionHandler/SplineVertexScaleInteractionHandler each hit-test this tag,
 * filtered to their own `kind`, so a drag on one handle is never mistaken for another. Mirrors
 * HairCardHandleRef.ts.
 */
export function tagSplineVertex(
	object: Object3D,
	splineId: string,
	vertexIndex: number,
	kind: SplineVertexHandleKind
): void {
	object.userData.splineVertex = { splineId, vertexIndex, kind }
}

export function tryGetSplineVertex(
	object: Object3D
): { splineId: string; vertexIndex: number; kind: SplineVertexHandleKind } | null {
	const tag = object.userData.splineVertex as
		{ splineId: string; vertexIndex: number; kind: SplineVertexHandleKind } | undefined
	return tag ?? null
}

/**
 * Shape of tryGetSplineVertex's result, reused as GroomViewport.setHoveredHandle's param - whatever
 * vertex handle the pointer currently sits over (see SplineHoverInteractionHandler), fed into both
 * SplineVertexWidget.update and SplineVertexGizmo.update every render() so each can highlight the
 * one handle it owns, if any, that the pointer is over.
 */
export type HoveredSplineVertexHandle = { splineId: string; vertexIndex: number; kind: SplineVertexHandleKind }
