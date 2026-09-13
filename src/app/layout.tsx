import Providers from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/toast'
import type { Metadata } from 'next'
import { Noto_Sans } from 'next/font/google'
import './globals.css'

const notoSans = Noto_Sans({
	subsets: ['latin'],
	variable: '--font-noto-sans',
	display: 'swap',
})

export const metadata: Metadata = {
	title: {
		default: 'hairgen',
		template: '%s · hairgen',
	},
	description: 'Generate hair textures for real-time characters.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={notoSans.variable} suppressHydrationWarning>
			<body className={notoSans.className}>
				<Providers>
					{children}
					<Toaster />
				</Providers>
			</body>
		</html>
	)
}
