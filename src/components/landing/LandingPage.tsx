'use client'

import { Header } from '@/components/layout/Header'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function LandingPage() {
	const { user, loading } = useAuth()
	const router = useRouter()

	useEffect(() => {
		if (!loading && user) {
			router.replace('/projects')
		}
	}, [user, loading, router])

	return (
		<div data-id="landing-page" className="min-h-screen">
			<Header />
			<main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-24 text-center">
				<h1 className="text-4xl font-semibold text-foreground">hairgen</h1>
				<p className="text-muted-foreground">Generate hair textures for real-time characters.</p>
				<Link data-id="landing-sign-in-cta" href="/auth/gate" className={buttonVariants({ size: 'lg' })}>
					Sign in
				</Link>
			</main>
		</div>
	)
}
