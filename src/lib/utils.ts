import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely converts a value to a number
 * @param value - Value to convert (string, number, null, undefined)
 * @returns Parsed number or null if conversion fails
 */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const num = typeof value === 'number' ? value : parseFloat(value);

  if (isNaN(num)) {
    return null;
  }

  return num;
}

/**
 * Checks whether a route param is a valid UUID. Dynamic [id] pages should
 * 404 on non-UUID slugs instead of passing them into uuid-typed queries
 * (which throws a Postgres error and surfaces as a 500).
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
