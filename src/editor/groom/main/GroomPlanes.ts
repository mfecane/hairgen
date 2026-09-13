import { Plane, Vector3 } from 'three'

/** The XZ plane at y = 0 - GroomViewport's ground reference surface. Splines are placed on and dragged along this plane - see PlaceSplineInteractionHandler/SplineVertexDragInteractionHandler. */
export const GROUND_PLANE: Plane = new Plane(new Vector3(0, 1, 0), 0)
