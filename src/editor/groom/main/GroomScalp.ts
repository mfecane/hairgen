import { GROOM } from '@/constants'
import { Sphere, Vector3 } from 'three'

/**
 * The head/scalp proxy splines are placed and dragged against - see the groom editor plan's "the
 * eventual goal of placing hair cards on a sphere (a head/scalp proxy), guided by splines". Sits on
 * GroomPlanes.GROUND_PLANE (center at y = RADIUS so its bottom touches the ground grid). This is
 * the math object InteractionContext.intersectSphere raycasts against; GroomViewport's visible
 * sphere mesh is kept in sync with it (same center/radius) purely for rendering.
 */
export const SCALP_SPHERE: Sphere = new Sphere(new Vector3(0, GROOM.SCALP.RADIUS, 0), GROOM.SCALP.RADIUS)
