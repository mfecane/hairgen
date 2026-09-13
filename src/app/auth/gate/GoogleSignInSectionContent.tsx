'use client'

import GoogleIcon from '@/components/icons/GoogleIcon'
import { Button } from '@/components/ui/button'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const GOOGLE_AUTH_ERROR_MESSAGES: Record<string, string> = {
	OAuthSignin: 'Google sign-in could not be started. Please try again.',
	OAuthCallback: 'Google sign-in did not complete. Please try again.',
	OAuthCreateAccount: 'Your account could not be created from Google sign-in.',
	EmailCreateAccount: 'Your account could not be created. Please try again.',
	Callback: 'The sign-in callback failed. Please try again.',
	AccessDenied: 'Google sign-in was denied. Please allow access to continue.',
	OAuthAccountNotLinked: 'This email is already linked to another sign-in method.',
	Default: 'Google sign-in failed. Please try again.',
}

export function GoogleSignInSectionContent() {
	const searchParams = useSearchParams()
	const authError = searchParams.get('error')
	const authErrorMessage = authError
		? (GOOGLE_AUTH_ERROR_MESSAGES[authError] ?? GOOGLE_AUTH_ERROR_MESSAGES.Default)
		: null

	const handleGoogleSignIn = useCallback(async () => {
		const callbackUrl = searchParams.get('callbackUrl') || '/projects'
		await signIn('google', { callbackUrl, redirect: true })
	}, [searchParams])

	return (
		<>
			<Button variant="secondary" className="h-12  px-6" onClick={() => void handleGoogleSignIn()}>
				<GoogleIcon className="h-4 w-4" />
				Continue with Google
			</Button>
			{authErrorMessage && <div className="text-sm text-destructive">{authErrorMessage}</div>}
		</>
	)
}
