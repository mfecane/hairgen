import { CanvasEventType } from '@/editor/interaction/CanvasEventType'
import { InteractionEvent } from '@/editor/interaction/InteractionEvent'
import { InteractionHandler } from '@/editor/interaction/InteractionHandler'
import { InteractionHandlerResult } from '@/editor/interaction/InteractionHandlerResult'
import { GROUND_PLANE } from '@/editor/groom/main/GroomPlanes'
import { SCALP_SPHERE } from '@/editor/groom/main/GroomScalp'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'

/** MouseEvent.button value for the primary ("left") button - mirrors SelectionInteractionHandler. */
const PLACE_BUTTON = 0

/**
 * Places a new straight 2-point spline at the click point on the scalp proxy sphere (falling back
 * to the ground plane when the click misses the sphere) - see GroomScene.addSpline for the
 * fixed-default-offset placement UX ("Single click, fixed-length default" per the groom editor
 * plan). When the click lands on the scalp, the spline is oriented normal to it (outward along the
 * sphere radius at the hit point) rather than GROOM.SPLINE.DEFAULT_DIRECTION - a ground-plane-only
 * placement keeps the old fixed direction, since "normal to the scalp" doesn't apply off it. Only
 * present in the interaction handler list while the "Place Spline" tool is toggled on (see
 * GroomEditorController.getInteractionHandlers), so it doesn't need to check the active tool
 * itself; it runs above SplineSelectionInteractionHandler so every click places a spline rather
 * than (re)selecting one while the tool is active.
 */
export class PlaceSplineInteractionHandler implements InteractionHandler {
	public id: string = 'placeSpline'

	public priority: number = 110

	public enabled: boolean = true

	public constructor(private readonly viewport: GroomViewport) {}

	public isEnabled(event: InteractionEvent): boolean {
		return this.enabled && event.type === CanvasEventType.Click && event.context.initiatingButton === PLACE_BUTTON
	}

	public async onEvent(event: InteractionEvent): Promise<InteractionHandlerResult> {
		const scalpPoint = event.context.intersectSphere(SCALP_SPHERE)
		const point = scalpPoint ?? event.context.intersectPlane(GROUND_PLANE)
		if (!point) {
			return new InteractionHandlerResult().setPass()
		}
		const normal = scalpPoint ? scalpPoint.clone().sub(SCALP_SPHERE.center).normalize() : null
		this.viewport.editor.addSplineAt(
			{ x: point.x, y: point.y, z: point.z },
			normal ? { x: normal.x, y: normal.y, z: normal.z } : null
		)
		return new InteractionHandlerResult().setHandled()
	}
}
