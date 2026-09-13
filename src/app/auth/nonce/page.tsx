'use client'

import { AuthNoncePageContent } from '@/app/auth/nonce/AuthNoncePageContent'
import { Suspense } from 'react'

export default function AuthNoncePage() {
	return (
		<Suspense fallback={null}>
			<AuthNoncePageContent />
		</Suspense>
	)
}
