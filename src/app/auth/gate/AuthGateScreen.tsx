'use client'
import { AppleSignInButton } from '@/app/auth/gate/AppleSignInButton'
import { AuthGateHeader } from '@/app/auth/gate/AuthGateHeader'
import { AuthGateVisualPanel } from '@/app/auth/gate/AuthGateVisualPanel'
import { EmailNonceRequestForm } from '@/app/auth/gate/EmailNonceRequestForm'
import { GoogleSignInSection } from '@/app/auth/gate/GoogleSignInSection'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function AuthGateScreen() {
	return (
		<main data-id="auth-gate-screen" className={cn('mx-auto flex max-w-3xl flex-col gap-6 px-6 py-24')}>
			<Card className="overflow-hidden p-0 shadow-xl">
				<CardContent className="grid p-0 md:grid-cols-2">
					<div className="flex flex-col gap-6 p-6 md:p-8">
						<AuthGateHeader />
						<div className="flex flex-col gap-4">
							<GoogleSignInSection />
							<AppleSignInButton />
						</div>
						<Separator />
						<div className="text-center text-sm text-muted-foreground">or continue with email</div>
						<EmailNonceRequestForm />
					</div>
					<AuthGateVisualPanel />
				</CardContent>
			</Card>
		</main>
	)
}
