import { SetMetadata } from '@nestjs/common';

export const AUDITORY_KEY = 'auditory';
export const Auditory = (entityType: string) => SetMetadata(AUDITORY_KEY, entityType); 