import { randomInt } from 'node:crypto'

import { DUMB_USER_NAMES } from '@/config/dumb-user-names'

export function pickRandomDumbUserName(): string {
	return DUMB_USER_NAMES[randomInt(0, DUMB_USER_NAMES.length)]
}
