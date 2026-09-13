import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines clsx (conditional class joining) and tailwind-merge (resolves Tailwind class conflicts).
 * Example: cn("px-2", "px-4") → "px-4" (conflicts resolved)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
