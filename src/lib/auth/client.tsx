'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'

type User = { uid: string; email: string } | null

type AuthContextValue = {
	user: User | null
	loading: boolean
	signout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const { data: session, status } = useSession()
	const [user, setUser] = useState<User>(null)
	const loading = status === 'loading'

	useEffect(() => {
		queueMicrotask(() => {
			if (session?.user?.id) {
				setUser({ uid: session.user.id, email: session.user.email || '' })
			} else {
				setUser(null)
			}
		})
	}, [session])

	const signout = async () => {
		await signOut({ redirect: false })
		setUser(null)
	}

	const value = useMemo<AuthContextValue>(() => ({ user, loading, signout }), [user, loading])
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within AuthProvider')
	return ctx
}
