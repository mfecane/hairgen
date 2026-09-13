'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { FormEvent, useCallback, useState } from 'react'

export function EmailNonceRequestForm() {
	const router = useRouter()
	const [email, setEmail] = useState<string>('')
	const [isSubmittingEmail, setIsSubmittingEmail] = useState<boolean>(false)
	const [emailRequestError, setEmailRequestError] = useState<string | null>(null)

	const handleEmailSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setIsSubmittingEmail(true)
		setEmailRequestError(null)

		try {
			const response = await fetch('/api/auth/email/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email }),
			})

			if (!response.ok) {
				throw new Error('Unable to send sign-in code')
			}
			const params = new URLSearchParams({ email })
			router.push(`/auth/nonce?${params.toString()}`)
		} catch (error) {
			console.error('Email sign-in code request failed', error)
			setEmailRequestError('Unable to send sign-in code right now. Please try again.')
		} finally {
			setIsSubmittingEmail(false)
		}
	}, [email, router])

	return (
		<form onSubmit={handleEmailSubmit}>
			<div className="flex flex-col gap-6">
				<Input id="email" type="email" placeholder="Email" required value={email} onChange={(event) => setEmail(event.target.value)} />
				<Button type="submit" variant="secondary" disabled={isSubmittingEmail}>
					{isSubmittingEmail ? 'Sending code...' : 'Continue'}
				</Button>
				{emailRequestError && <div className="text-sm text-destructive">{emailRequestError}</div>}
			</div>
		</form>
	)
}
