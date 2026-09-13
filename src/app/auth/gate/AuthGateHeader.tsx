import Logo from '@/components/icons/Logo'
import Link from 'next/link'

export function AuthGateHeader() {
	return (
		<div data-id="auth-gate-header" className="flex flex-col items-center gap-2 text-center">
			<Link href="/" className="flex items-center gap-1 text-foreground">
				<Logo />
				<span className="text-lg md:text-xl uppercase font-normal">hairgen</span>
			</Link>
			<h1 className="text-2xl font-bold">Welcome back</h1>
			<p className="text-balance text-sm text-muted-foreground">Sign in to your hairgen account</p>
		</div>
	)
}
