export type ApiErrorCode =
	| 'ACCOUNT_DELETED'
	| 'DELETE_FAILED'
	| 'FILE_TOO_LARGE'
	| 'INTERNAL_ERROR'
	| 'INVALID_AVATAR_REF'
	| 'INVALID_FILE_TYPE'
	| 'INVALID_NAME'
	| 'INVALID_WEIGHT'
	| 'MISSING_CONTENT_TYPE'
	| 'MISSING_FILE'
	| 'MISSING_FILENAME'
	| 'MISSING_REQUIRED_FIELDS'
	| 'NAME_TOO_LONG'
	| 'NO_AVATAR'
	| 'NOT_FOUND'
	| 'UNAUTHENTICATED'
	| 'UNKNOWN_ERROR'
	| 'UPLOAD_FAILED'
	| (string & {})

export type ApiErrorField = 'name' | (string & {})

export type ApiErrorShape = {
	code: ApiErrorCode
	field?: ApiErrorField
	message?: string
}

export class ApiError extends Error {
	code: ApiErrorCode
	status: number
	field?: ApiErrorField
	rawMessage?: string

	constructor(args: {
		code: ApiErrorCode
		status: number
		field?: ApiErrorField
		message: string
		rawMessage?: string
	}) {
		super(args.message)
		this.name = 'ApiError'
		this.code = args.code
		this.status = args.status
		this.field = args.field
		this.rawMessage = args.rawMessage
	}
}

export function apiError(code: ApiErrorCode, options?: { field?: ApiErrorField; message?: string }) {
	return {
		error: {
			code,
			field: options?.field,
			message: options?.message,
		},
	}
}

export function getUserErrorMessage(code: ApiErrorCode, fallback = 'Something went wrong. Please try again.') {
	switch (code) {
		case 'UNAUTHENTICATED':
			return 'Please sign in and try again.'
		case 'ACCOUNT_DELETED':
			return 'This account is no longer available.'
		case 'NAME_TOO_LONG':
			return 'Display name is too long.'
		case 'MISSING_CONTENT_TYPE':
		case 'MISSING_FILE':
			return 'Please choose an image file to upload.'
		case 'MISSING_FILENAME':
			return 'Could not read the file name. Please try again.'
		case 'INVALID_FILE_TYPE':
			return 'Use a JPG, PNG, or WebP image.'
		case 'FILE_TOO_LARGE':
			return 'That image is too large.'
		case 'UPLOAD_FAILED':
			return 'Upload failed. Please try again.'
		case 'NO_AVATAR':
			return 'There is no profile photo to remove.'
		case 'DELETE_FAILED':
			return 'Delete failed. Please try again.'
		case 'MISSING_REQUIRED_FIELDS':
			return 'Please choose a valid city before saving.'
		case 'NOT_FOUND':
			return 'That item could not be found.'
		case 'INVALID_NAME':
			return 'That name is invalid.'
		case 'INVALID_WEIGHT':
			return 'Weight must be a whole number between 0 and 100.'
		case 'INTERNAL_ERROR':
			return fallback
		default:
			return fallback
	}
}

export async function parseApiError(response: Response, options?: { fallbackMessage?: string }): Promise<ApiError> {
	let payload: unknown = null
	try {
		payload = await response.json()
	} catch {
		payload = null
	}

	let code: ApiErrorCode = 'UNKNOWN_ERROR'
	let field: ApiErrorField | undefined
	let rawMessage: string | undefined

	if (payload && typeof payload === 'object' && 'error' in payload) {
		const errorValue = (payload as { error?: unknown }).error
		if (typeof errorValue === 'string') {
			code = errorValue
		} else if (errorValue && typeof errorValue === 'object') {
			const structured = errorValue as { code?: unknown; field?: unknown; message?: unknown }
			if (typeof structured.code === 'string') code = structured.code
			if (typeof structured.field === 'string') field = structured.field
			if (typeof structured.message === 'string') rawMessage = structured.message
		}
	}

	if (!rawMessage && payload && typeof payload === 'object' && 'message' in payload) {
		const messageValue = (payload as { message?: unknown }).message
		if (typeof messageValue === 'string' && messageValue.length > 0) {
			rawMessage = messageValue
		}
	}

	const fallbackMessage = options?.fallbackMessage ?? 'Something went wrong. Please try again.'
	const message = rawMessage && code === 'UNKNOWN_ERROR' ? rawMessage : getUserErrorMessage(code, fallbackMessage)

	return new ApiError({
		code,
		status: response.status,
		field,
		message,
		rawMessage,
	})
}
