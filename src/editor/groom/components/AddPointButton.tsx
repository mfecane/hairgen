'use client'

import { Button } from '@/components/ui/button'
import { useGroomReactBridge } from '@/editor/groom/hooks/useGroomReactBridge'
import { useLiveElementPosition } from '@/editor/hooks/useLiveElementPosition'
import { GroomEditor } from '@/editor/groom/main/GroomEditor'
import { GroomViewport } from '@/editor/groom/main/GroomViewport'
import { Plus } from 'lucide-react'

interface AddPointButtonProps {
	editor: GroomEditor
	viewport: GroomViewport | null
}

/**
 * Floating "add point" affordance pinned over the viewport at AddPointAnchor's live screen position
 * - see useLiveElementPosition for why its position is synced imperatively (bypassing
 * GroomReactBridge/setState) rather than as regular React state.
 *
 * A two-click gesture, same shape as GroomToolbar's "Place Spline" tool: clicking this button arms
 * "add point" mode (GroomEditor.beginAddVertexToSelectedSpline), then the next click in the viewport
 * commits a new vertex at the clicked point and returns to the select tool
 * (AddSplineVertexInteractionHandler). The button itself hides for the duration of that mode - it's
 * already served its purpose (arming it), and leaving it visible/clickable mid-placement is
 * confusing; GroomViewport's crosshair cursor is the mode's visual feedback while it's armed.
 */
export function AddPointButton({ editor, viewport }: AddPointButtonProps) {
	const { activeTool } = useGroomReactBridge()
	const buttonRef = useLiveElementPosition<HTMLButtonElement>(viewport?.subscribeAddPointScreenPosition ?? null)

	if (activeTool === 'addVertex') {
		return null
	}

	return (
		<Button
			ref={buttonRef}
			data-id="groom-add-point-button"
			type="button"
			size="icon-xs"
			// transition-none overrides Button's own transition-all - left/top are rewritten every
			// render() frame (see useLiveElementPosition), and animating that continuous stream of
			// changes is exactly the "lame transition"/lag this button must not have. The centering
			// translate lives in `style`, not a `-translate-x-1/2 -translate-y-1/2` className, because
			// Button's own base classes include an `active:...translate-y-px` "press" affordance that
			// would otherwise fight over the same transform and visibly shift the button down on click.
			className="absolute rounded-full pointer-events-auto transition-none"
			style={{ display: 'none', transform: 'translate(-50%, -50%)' }}
			title="Add point"
			onClick={() => editor.beginAddVertexToSelectedSpline()}
		>
			<Plus />
		</Button>
	)
}
