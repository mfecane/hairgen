import AppleIcon from '@/components/icons/AppleIcon'
import { Button } from '@/components/ui/button'

export function AppleSignInButton() {
	return (
		<Button
			data-id="apple-sign-in-button"
			variant="secondary"
			type="button"
			disabled
			className="flex h-12 flex-col items-center gap-0.5"
		>
			<div className="flex items-center gap-2">
				<AppleIcon className="h-4 w-4" /> <span>Continue with Apple</span>
			</div>
			<div className="text-xs leading-none text-muted-foreground">Coming soon...</div>
		</Button>
	)
}
