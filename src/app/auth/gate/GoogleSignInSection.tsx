'use client'

import { GoogleSignInSectionContent } from '@/app/auth/gate/GoogleSignInSectionContent'
import { Suspense } from 'react'

export function GoogleSignInSection() {
	return (
		<Suspense fallback={null}>
			<GoogleSignInSectionContent />
		</Suspense>
	)
}
