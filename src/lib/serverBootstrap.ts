import { registerServices } from '@/di/registerServices'
import { Container } from '@/lib/di/container'

export const container = new Container()

registerServices(container)
