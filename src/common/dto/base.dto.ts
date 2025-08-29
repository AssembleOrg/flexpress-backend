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

export const formatDateTime = (date: Date): string => {
  return DateTime.fromJSDate(date)
    .setZone('America/Argentina/Buenos_Aires')
    .toISO();
};

export const parseDateTime = (dateString: string): Date => {
  return DateTime.fromISO(dateString, { zone: 'America/Argentina/Buenos_Aires' }).toJSDate();
}; 