'use client'

import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const THEME_OPTIONS = [
	{ value: 'light', label: 'Light', icon: Sun },
	{ value: 'dark', label: 'Dark', icon: Moon },
	{ value: 'system', label: 'System', icon: Monitor },
] as const

export function UserMenu() {
	const { data: session, status } = useSession()
	const { theme, setTheme } = useTheme()

	if (status === 'loading') {
		return <div data-id="user-menu-loading" className="size-9 animate-pulse rounded-full bg-muted" />
	}

	if (!session?.user) {
		return null
	}

	const displayName = session.user.name?.trim() || session.user.email?.split('@')[0] || 'User'
	const userMenuTrigger = (
		<Button
			data-id="user-menu-trigger"
			type="button"
			size="icon"
			variant="ghost"
			className="rounded-full hover:bg-surface-hover"
			aria-label={`Open account menu for ${displayName}`}
		>
			<Avatar data-id="user-menu-avatar">
				{session.user.image && (
					<AvatarImage src={session.user.image} alt={`${displayName} avatar`} referrerPolicy="no-referrer" />
				)}
				<AvatarFallback className="font-medium">{getInitials(displayName)}</AvatarFallback>
			</Avatar>
		</Button>
	)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={userMenuTrigger} />

			<DropdownMenuContent data-id="user-menu" align="end" className="w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="font-normal">
						<span className="block truncate font-medium text-foreground">{displayName}</span>
						{session.user.email && (
							<span className="block truncate text-xs text-muted-foreground">{session.user.email}</span>
						)}
					</DropdownMenuLabel>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<div
					data-id="user-menu-theme-switch"
					role="group"
					aria-label="Theme"
					className="flex w-full items-center justify-between px-2 py-1"
				>
					<span className="text-xs font-medium text-muted-foreground">Theme</span>
					<div className="flex shrink gap-0.5">
						{THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
							<Button
								key={value}
								data-id={`user-menu-theme-${value}`}
								type="button"
								variant={theme === value ? 'default' : 'ghost'}
								className="h-7 flex-1"
								onClick={() => setTheme(value)}
								title={label}
								aria-label={`Set theme to ${label}`}
								aria-current={theme === value ? 'true' : undefined}
							>
								<Icon size={14} />
							</Button>
						))}
					</div>
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					data-id="user-menu-logout"
					className="text-destructive"
					onSelect={() => void signOut({ redirectTo: '/auth/gate' })}
				>
					<LogOut />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function getInitials(displayName: string): string {
	return displayName
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part.charAt(0))
		.join('')
		.toUpperCase()
}
