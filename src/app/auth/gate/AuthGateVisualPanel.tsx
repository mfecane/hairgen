import Logo from '@/components/icons/Logo'

/** Decorative right-hand panel, hidden below md - mirrors the form panel's width once there's room for it. */
export function AuthGateVisualPanel() {
	return (
		<div data-id="auth-gate-visual-panel" className="relative hidden bg-muted md:flex md:items-center md:justify-center">
			<Logo className="h-24 w-24 text-muted-foreground/20" />
		</div>
	)
}
