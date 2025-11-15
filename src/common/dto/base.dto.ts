import { DateTime } from 'luxon';

export class BaseEntityDto {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class BaseCreateDto {
  // Common fields for creation can be added here
}

export class BaseUpdateDto {
  // Common fields for updates can be added here
}

export const formatDateTime = (date: Date | null): string => {
  if (!date) {
    return new Date().toISOString();
  }
  const result = DateTime.fromJSDate(date)
    .setZone('America/Argentina/Buenos_Aires')
    .toISO();
  return result || new Date().toISOString();
};

export const parseDateTime = (dateString: string): Date => {
  return DateTime.fromISO(dateString, { zone: 'America/Argentina/Buenos_Aires' }).toJSDate();
}; 