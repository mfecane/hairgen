import { cn } from '@/lib/utils'
import { ChevronsLeftRight } from 'lucide-react'
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react'

interface NumericInputProps extends Omit<
	ComponentProps<'input'>,
	'type' | 'inputMode' | 'value' | 'defaultValue' | 'onChange' | 'onFocus' | 'onBlur' | 'step' | 'min' | 'max'
> {
	value: number
	onValueChange: (value: number) => void
	round?: boolean
	roundStep?: number
	dragStep?: number
	min?: number
	max?: number
}

const DRAG_PIXELS_PER_STEP = 10
const DEFAULT_DECIMAL_DRAG_STEP = 0.1
const DEFAULT_WHOLE_DRAG_STEP = 1
const DEFAULT_ROUND_STEP = 0.001
const TYPE_COMMIT_DELAY_MS = 150
const DRAG_COMMIT_DELAY_MS = 150

export function NumericInput({
	value,
	onValueChange,
	id,
	round = false,
	roundStep = DEFAULT_ROUND_STEP,
	dragStep,
	min,
	max,
	className,
	disabled,
	...props
}: NumericInputProps) {
	const [draft, setDraft] = useState(String(value))
	const isEditing = useRef(false)
	const dragHandle = useRef<HTMLButtonElement>(null)
	const dragPointerId = useRef<number | null>(null)
	const dragFrameValue = useRef(value)
	const dragChangeStep = useRef(DEFAULT_DECIMAL_DRAG_STEP)
	const lastDragValue = useRef(value)
	const typeCommitTimeout = useRef<number | null>(null)
	const dragCommitTimeout = useRef<number | null>(null)
	const pendingDragValue = useRef<number | null>(null)
	const effectiveRoundStep = round ? 1 : roundStep
	const dragSettings = useRef({ disabled, min, max, onValueChange, roundStep: effectiveRoundStep })
	dragSettings.current = { disabled, min, max, onValueChange, roundStep: effectiveRoundStep }
	const cancelTypeCommit = useCallback(() => {
		if (typeCommitTimeout.current !== null) window.clearTimeout(typeCommitTimeout.current)
		typeCommitTimeout.current = null
	}, [])
	const cancelDragCommit = useCallback(() => {
		if (dragCommitTimeout.current !== null) window.clearTimeout(dragCommitTimeout.current)
		dragCommitTimeout.current = null
	}, [])
	const stopDragging = useCallback((commit = true) => {
		cancelDragCommit()
		const finalValue = pendingDragValue.current
		pendingDragValue.current = null
		const handle = dragHandle.current
		const pointerId = dragPointerId.current
		if (handle && pointerId !== null && handle.hasPointerCapture(pointerId)) {
			handle.releasePointerCapture(pointerId)
		}
		if (document.pointerLockElement === handle) document.exitPointerLock()
		dragPointerId.current = null
		isEditing.current = false
		if (commit && finalValue !== null) dragSettings.current.onValueChange(finalValue)
	}, [cancelDragCommit])
	const scheduleDraggedValue = useCallback((nextValue: number) => {
		pendingDragValue.current = nextValue
		cancelDragCommit()
		dragCommitTimeout.current = window.setTimeout(() => {
			dragCommitTimeout.current = null
			pendingDragValue.current = null
			dragSettings.current.onValueChange(nextValue)
		}, DRAG_COMMIT_DELAY_MS)
	}, [cancelDragCommit])

	useEffect(() => {
		if (!isEditing.current) setDraft(String(value))
	}, [value])
	useEffect(() => {
		if (!disabled) return
		cancelTypeCommit()
		stopDragging(false)
		isEditing.current = false
		setDraft(String(value))
	}, [cancelTypeCommit, disabled, stopDragging, value])
	useEffect(() => cancelTypeCommit, [cancelTypeCommit])
	useEffect(() => {
		const handleMouseMove = (event: MouseEvent) => {
			const settings = dragSettings.current
			if (settings.disabled || document.pointerLockElement !== dragHandle.current) return
			const precision = event.ctrlKey || event.metaKey
			const effectiveStep = precision ? dragChangeStep.current / 10 : dragChangeStep.current
			const delta = (event.movementX / DRAG_PIXELS_PER_STEP) * effectiveStep
			dragFrameValue.current = constrain(dragFrameValue.current + delta, settings.min, settings.max)
			const constrainedValue = roundToStep(dragFrameValue.current, settings.roundStep)
			if (constrainedValue === lastDragValue.current) return
			lastDragValue.current = constrainedValue
			setDraft(String(constrainedValue))
			scheduleDraggedValue(constrainedValue)
		}
		const handleMouseUp = () => {
			if (dragPointerId.current !== null) stopDragging()
		}
		const handlePointerCancel = (event: PointerEvent) => {
			if (event.pointerId === dragPointerId.current) stopDragging()
		}
		const handlePointerLockChange = () => {
			if (document.pointerLockElement !== dragHandle.current) stopDragging()
		}

		document.addEventListener('mousemove', handleMouseMove)
		document.addEventListener('mouseup', handleMouseUp)
		document.addEventListener('pointercancel', handlePointerCancel)
		document.addEventListener('pointerlockchange', handlePointerLockChange)
		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
			document.removeEventListener('mouseup', handleMouseUp)
			document.removeEventListener('pointercancel', handlePointerCancel)
			document.removeEventListener('pointerlockchange', handlePointerLockChange)
			stopDragging(false)
		}
	}, [scheduleDraggedValue, stopDragging])

	const applyValue = (value: number): number | undefined => {
		if (disabled) return undefined
		const rounded = roundToStep(value, effectiveRoundStep)
		const constrained = constrain(rounded, min, max)
		onValueChange(constrained)
		return constrained
	}
	const scheduleTypedValue = (nextValue: number) => {
		cancelTypeCommit()
		typeCommitTimeout.current = window.setTimeout(() => {
			typeCommitTimeout.current = null
			applyValue(nextValue)
		}, TYPE_COMMIT_DELAY_MS)
	}

	return (
		<div
			data-id={id ? `${id}-draggable-number` : 'draggable-number'}
			data-disabled={disabled || undefined}
			className={cn(
				'nodrag inline-flex h-7 overflow-hidden items-center rounded-md border border-border bg-input',
				'dark:bg-input/30 text-foreground focus-within:ring-1 focus-within:ring-ring',
				'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50',
				className
			)}
		>
			<input
				{...props}
				id={id}
				type="text"
				inputMode={round ? 'numeric' : 'decimal'}
				value={draft}
				disabled={disabled}
				className="h-full flex-1 min-w-12 w-10 px-1 py-0 text-right text-xs outline-none disabled:cursor-not-allowed"
				onFocus={() => {
					isEditing.current = true
				}}
				onChange={(event) => {
					const next = event.target.value
					setDraft(next)
					const parsed = parseCompleteNumberDraft(next)
					if (parsed !== undefined) scheduleTypedValue(parsed)
					else cancelTypeCommit()
				}}
				onBlur={(event) => {
					cancelTypeCommit()
					isEditing.current = false
					const latestDraft = event.currentTarget.value
					const parsed = Number(latestDraft)
					if (latestDraft !== '' && Number.isFinite(parsed)) {
						setDraft(String(applyValue(parsed) ?? value))
					} else {
						setDraft(String(value))
					}
				}}
			/>
			<button
				ref={dragHandle}
				type="button"
				data-id={id ? `${id}-drag-handle` : 'number-drag-handle'}
				className={cn(
					'flex h-full w-6 shrink-0 touch-none cursor-ew-resize items-center justify-center',
					'disabled:pointer-events-none disabled:cursor-not-allowed'
				)}
				disabled={disabled}
				aria-label="Drag sideways to adjust value"
				title="Drag sideways to adjust; hold Ctrl/Command for finer changes"
				onPointerDown={(event) => {
					if (disabled) return
					cancelTypeCommit()
					isEditing.current = true
					event.currentTarget.setPointerCapture(event.pointerId)
					dragPointerId.current = event.pointerId
					dragFrameValue.current = value
					dragChangeStep.current = resolveDragStep(dragStep, round)
					lastDragValue.current = value
					void event.currentTarget.requestPointerLock()
				}}
			>
				<ChevronsLeftRight aria-hidden="true" className="size-4" />
			</button>
		</div>
	)
}

function resolveDragStep(explicitStep: number | undefined, round: boolean): number {
	if (explicitStep !== undefined) {
		if (!Number.isFinite(explicitStep) || explicitStep <= 0) {
			throw new Error(`Number input drag step must be a positive finite number; received ${explicitStep}.`)
		}
		return explicitStep
	}
	return round ? DEFAULT_WHOLE_DRAG_STEP : DEFAULT_DECIMAL_DRAG_STEP
}

function parseCompleteNumberDraft(draft: string): number | undefined {
	if (draft === '' || draft.endsWith('.')) return undefined
	const parsed = Number(draft)
	return Number.isFinite(parsed) ? parsed : undefined
}

function constrain(value: number, min: number | undefined, max: number | undefined): number {
	if (min !== undefined && max !== undefined && min > max) {
		throw new Error(`Number input min (${min}) must not exceed max (${max}).`)
	}
	return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value))
}

function roundToStep(value: number, step: number): number {
	if (!Number.isFinite(step) || step <= 0) {
		throw new Error(`Number input roundStep must be a positive finite number; received ${step}.`)
	}
	const decimals = decimalPlaces(step)
	return Number((Math.round(value / step) * step).toFixed(decimals))
}

function decimalPlaces(value: number): number {
	const text = String(value).toLowerCase()
	if (!text.includes('e-')) return text.split('.')[1]?.length ?? 0
	const [coefficient, exponent] = text.split('e-')
	return Number(exponent) + (coefficient.split('.')[1]?.length ?? 0)
}
