import { GROOM } from '@/constants'
import { Vector3 } from 'three'

/**
 * Weight per neighboring vertex a move/rotate/scale drag on `draggedIndex` should also apply to,
 * when the spline's "Soft selection" switch is on (SplineSmoothModifyPanel) - see the spline vertex
 * interaction handlers' Move step. Distance is
 * cumulative polyline distance from the dragged vertex (the same straight-segment approximation
 * GroomScene.insertVertexNearPoint already uses elsewhere in this editor), and the falloff itself is
 * a raised cosine: full `influence` at zero distance, smoothly down to zero at
 * GROOM.SPLINE.SMOOTH_MODIFY.FALLOFF_RADIUS, zero beyond it. The dragged vertex itself is never
 * included - callers apply its own change directly, unweighted, exactly as they do when smooth
 * modify is off.
 */
export function computeSmoothModifyWeights(
	vertices: readonly Vector3[],
	draggedIndex: number,
	influence: number
): Map<number, number> {
	const weights = new Map<number, number>()
	if (influence <= 0) {
		return weights
	}

	const distances: number[] = new Array(vertices.length).fill(Infinity)
	distances[draggedIndex] = 0

	let forwardDistance = 0
	for (let i = draggedIndex + 1; i < vertices.length; i++) {
		forwardDistance += vertices[i].distanceTo(vertices[i - 1])
		distances[i] = forwardDistance
	}
	let backwardDistance = 0
	for (let i = draggedIndex - 1; i >= 0; i--) {
		backwardDistance += vertices[i].distanceTo(vertices[i + 1])
		distances[i] = backwardDistance
	}

	const radius = GROOM.SPLINE.SMOOTH_MODIFY.FALLOFF_RADIUS
	for (let i = 0; i < vertices.length; i++) {
		if (i === draggedIndex || distances[i] > radius) {
			continue
		}
		const t = distances[i] / radius
		const weight = influence * 0.5 * (1 + Math.cos(Math.PI * t))
		if (weight > 0) {
			weights.set(i, weight)
		}
	}
	return weights
}
