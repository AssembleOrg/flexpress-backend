import { IsBoolean } from 'class-validator';

export class RespondToMatchDto {
  // El personal (conductor + ayudantes) ya NO se elige al responder:
  // se define al ponerse disponible (config activa en CharterAvailability).
  @IsBoolean()
  accept: boolean;
}
