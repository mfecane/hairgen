'use client'

import Link from 'next/link'

import { UserMenu } from '@/components/user-menu'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export function Header() {
	const { user, loading } = useAuth()

	return (
		<header data-id="header" className="flex items-center justify-between px-6 py-4">
			<Link href="/" className="text-lg font-semibold text-foreground">
				hairgen
			</Link>

			{loading ? null : user ? (
				<UserMenu />
			) : (
				<Link data-id="header-sign-in" href="/auth/gate" className={buttonVariants()}>
					Log in
				</Link>
			)}
		</header>
	)
}
