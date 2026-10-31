export const ACCOUNT_NAME_MAXIMUM_LENGTH: 20
export const NICKNAME_MAXIMUM_UNITS: 16
export const ROOM_NAME_MAXIMUM_UNITS: 24
export function isValidAccountName(value: unknown): value is string
export function countNameUnits(value: string): number
export function isValidDisplayName(value: unknown, maximumUnits: number): value is string
export function truncateNameToUnits(value: string, maximumUnits: number): string
export function defaultNickname(account: string): string
