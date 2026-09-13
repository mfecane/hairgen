import { registerClientServices } from '@/di/registerClient'
import { Container } from '@/lib/di/container'
import { createContext, useContext, useState } from 'react'
import { Optional } from 'typescript-optional'

export interface ContextShape {
	// immutable
	container: Container
}

const AppContext = createContext<ContextShape | null>(null)

interface Props {
	children: React.ReactNode
}

export const AppContextProvider: React.FC<Props> = ({ children }) => {
	const [container] = useState(() => {
		const instance = new Container()
		registerClientServices(instance)
		return instance
	})
	return <AppContext.Provider value={{ container }}>{children}</AppContext.Provider>
}

export const useAppContext: () => ContextShape = () => {
	const context: ContextShape | null = useContext(AppContext)
	return Optional.ofNullable(context).orElseThrow(() => new Error('Failed to initialize context'))
}
