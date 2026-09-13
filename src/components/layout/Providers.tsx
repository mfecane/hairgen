'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { AppContextProvider } from '@/hooks/context/useAppContext'
import { AuthProvider } from '@/lib/auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'

interface Props {
	children: React.ReactNode
}

const Providers: React.FC<Props> = ({ children }) => {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000, // 1 minute
						gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
						refetchOnWindowFocus: false,
						retry: 1,
					},
				},
			})
	)

	return (
		<ThemeProvider>
			<AppContextProvider>
				<QueryClientProvider client={queryClient}>
					<SessionProvider>
						<AuthProvider>{children}</AuthProvider>
					</SessionProvider>
				</QueryClientProvider>
			</AppContextProvider>
		</ThemeProvider>
	)
}

export default Providers
