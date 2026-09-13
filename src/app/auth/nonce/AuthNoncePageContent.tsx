'use client'

import Logo from '@/components/icons/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const RESEND_TIMEOUT_SECONDS = 30

export function AuthNoncePageContent() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const email = searchParams.get('email')
	if (email === null || email.length === 0) {
		throw new Error('Missing email query parameter for nonce verification page')
	}
	const [code, setCode] = useState<string>('')
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState<boolean>(false)
	const [resendLoading, setResendLoading] = useState<boolean>(false)
	const [resendCooldownSeconds, setResendCooldownSeconds] = useState<number>(RESEND_TIMEOUT_SECONDS)
	const [message, setMessage] = useState<string | null>(null)
	const lastAutoSubmittedCodeRef = useRef<string>('')
	const isVerifyingRef = useRef<boolean>(false)

	const canSubmit = useMemo(() => {
		return code.trim().length === 6
	}, [code])

	useEffect(() => {
		if (resendCooldownSeconds === 0) {
			return
		}
		const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
			setResendCooldownSeconds((currentSeconds: number) => currentSeconds - 1)
		}, 1000)
		return () => {
			clearTimeout(timeoutId)
		}
	}, [resendCooldownSeconds])

	const verifyCode = useCallback(async (): Promise<boolean> => {
		// Guards against the auto-submit effect and a manual Enter/click both firing
		// signIn() for the same code - the loser would consume an already-used nonce
		// and fail with a misleading "Invalid or expired code".
		if (isVerifyingRef.current) {
			return false
		}
		isVerifyingRef.current = true
		try {
			const result = await signIn('email-nonce', {
				email,
				code,
				redirect: false,
				callbackUrl: '/projects',
			})
			if (!result || result.error || !result.ok) {
				return false
			}
			router.push(result.url ?? '/projects')
			return true
		} finally {
			isVerifyingRef.current = false
		}
	}, [code, email, router])

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault()
			setLoading(true)
			setError(null)
			setMessage(null)
			const isVerified: boolean = await verifyCode()
			if (isVerified) {
				setMessage('Code verified. Continuing...')
			} else {
				setError('Invalid or expired code. Check for typos and try again.')
			}
			setLoading(false)
		},
		[verifyCode]
	)

	useEffect(() => {
		if (!canSubmit || loading) {
			return
		}
		if (lastAutoSubmittedCodeRef.current === code) {
			return
		}
		lastAutoSubmittedCodeRef.current = code
		void verifyCode().catch(() => undefined)
	}, [canSubmit, code, loading, verifyCode])

	useEffect(() => {
		if (!canSubmit) {
			lastAutoSubmittedCodeRef.current = ''
		}
	}, [canSubmit])

	const handleResendCode = useCallback(async () => {
		setResendLoading(true)
		setError(null)
		setMessage(null)
		try {
			const response = await fetch('/api/auth/email/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email }),
			})
			if (!response.ok) {
				throw new Error('Failed to resend code')
			}
			setMessage('A new verification code has been sent.')
			setResendCooldownSeconds(RESEND_TIMEOUT_SECONDS)
		} catch (resendError) {
			console.error('Email nonce resend failed', resendError)
			setError('Failed to resend code. Please try again.')
		} finally {
			setResendLoading(false)
		}
	}, [email])

	return (
		<main className={cn('flex flex-col gap-6 mx-auto max-w-md px-6 py-24')}>
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">
						<Link href="/" className="flex items-center gap-1 text-foreground">
							<Logo />
							<span className="text-lg md:text-xl uppercase font-normal">hairgen</span>
						</Link>
					</CardTitle>
					<CardDescription className="pt-4">
						<h2 className="text-lg font-medium mb-2 text-neutral-200">Check your email</h2>
						<div className="text-sm text-muted-foreground">Verification code has been sent to {email}</div>
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<form onSubmit={handleSubmit}>
						<div className="flex flex-col gap-6">
							<InputOTP
								id="nonce-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								maxLength={6}
								value={code}
								onChange={(value: string) => setCode(value.replace(/\D/g, ''))}
							>
								<InputOTPGroup className="w-full justify-center">
									<InputOTPSlot index={0} />
									<InputOTPSlot index={1} />
									<InputOTPSlot index={2} />
									<InputOTPSlot index={3} />
									<InputOTPSlot index={4} />
									<InputOTPSlot index={5} />
								</InputOTPGroup>
							</InputOTP>
							<Button type="submit" variant="secondary" disabled={!canSubmit || loading}>
								{loading ? 'Verifying...' : 'Verify code'}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={handleResendCode}
								disabled={resendLoading || loading || resendCooldownSeconds > 0}
							>
								{resendLoading
									? 'Sending code...'
									: resendCooldownSeconds > 0
										? `Send code again in ${resendCooldownSeconds}s`
										: 'Send code again'}
							</Button>
							{message && <div className="text-sm text-muted-foreground">{message}</div>}
							{error && <div className="text-sm text-destructive">{error}</div>}
						</div>
					</form>
					<Button
						type="button"
						variant="ghost"
						className="text-sm text-muted-foreground underline underline-offset-4"
						onClick={() => {
							if (window.history.length > 1) {
								router.back()
								return
							}
							router.push('/auth/gate')
						}}
					>
						Go back
					</Button>
				</CardContent>
			</Card>
		</main>
	)
}
