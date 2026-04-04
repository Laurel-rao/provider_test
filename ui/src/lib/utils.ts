import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}
