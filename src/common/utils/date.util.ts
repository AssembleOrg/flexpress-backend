import { DateTime } from 'luxon';

// Zona horaria de Buenos Aires
export const TIMEZONE = 'America/Argentina/Buenos_Aires'; // GMT-3

/**
 * Get current date/time in Buenos Aires timezone
 */
export function nowInBuenosAires(): DateTime {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Parse ISO date string to Buenos Aires timezone
 */
export function parseDate(dateString: string): DateTime {
  return DateTime.fromISO(dateString, { zone: TIMEZONE });
}

/**
 * Parse ISO date string and convert to Buenos Aires timezone
 */
export function parseDateToBA(dateString: string): DateTime {
  return DateTime.fromISO(dateString).setZone(TIMEZONE);
}

/**
 * Format date for display in Buenos Aires timezone
 */
export function formatDate(date: Date | DateTime, format: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const dt = date instanceof DateTime ? date : DateTime.fromJSDate(date);
  return dt.setZone(TIMEZONE).toFormat(format);
}

/**
 * Convert Date to DateTime in Buenos Aires timezone
 */
export function toDateTime(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: TIMEZONE });
}

/**
 * Convert DateTime to JS Date
 */
export function toJSDate(dateTime: DateTime): Date {
  return dateTime.toJSDate();
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date | DateTime): boolean {
  const dt = date instanceof DateTime ? date : DateTime.fromJSDate(date);
  return dt.setZone(TIMEZONE) < nowInBuenosAires();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date | DateTime): boolean {
  const dt = date instanceof DateTime ? date : DateTime.fromJSDate(date);
  return dt.setZone(TIMEZONE) > nowInBuenosAires();
}

/**
 * Add days to current date
 */
export function addDays(days: number): DateTime {
  return nowInBuenosAires().plus({ days });
}

/**
 * Add hours to current date
 */
export function addHours(hours: number): DateTime {
  return nowInBuenosAires().plus({ hours });
}

/**
 * Add minutes to current date
 */
export function addMinutes(minutes: number): DateTime {
  return nowInBuenosAires().plus({ minutes });
}

/**
 * Get date range (start of day to end of day) in Buenos Aires
 */
export function getDayRange(date?: Date | DateTime): { start: DateTime; end: DateTime } {
  const dt = date 
    ? (date instanceof DateTime ? date : DateTime.fromJSDate(date))
    : nowInBuenosAires();
  
  const dayInBA = dt.setZone(TIMEZONE);
  
  return {
    start: dayInBA.startOf('day'),
    end: dayInBA.endOf('day'),
  };
}

/**
 * Format date for API response (ISO 8601 with Buenos Aires timezone)
 */
export function toAPIFormat(date: Date | DateTime): string {
  const dt = date instanceof DateTime ? date : DateTime.fromJSDate(date);
  return dt.setZone(TIMEZONE).toISO()!;
}

