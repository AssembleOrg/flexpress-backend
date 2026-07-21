import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Scope de la subida. Determina carpeta, visibilidad (public/private) y validación
 * de ownership en el backend. El cliente NO decide la carpeta ni el dueño real:
 * el ownerId sale del JWT / se valida contra la DB.
 */
export enum UploadScope {
  AVATAR = 'avatar', // público — selfie/perfil del usuario
  PERSONNEL_PHOTO = 'personnel-photo', // público — foto de conductor/ayudante
  VEHICLE_FOTO = 'vehicle-foto', // público — foto del vehículo
  USER_DNI = 'user-dni', // privado — DNI del titular
  VEHICLE_DOC = 'vehicle-doc', // privado — cédula/seguro/vtv
  PERSONNEL_DOC = 'personnel-doc', // privado — DNI/licencia de personal
  RECEIPT = 'receipt', // privado — comprobante de pago
}

export class PresignUploadDto {
  @ApiProperty({ enum: UploadScope, example: UploadScope.AVATAR })
  @IsEnum(UploadScope)
  scope: UploadScope;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  contentType: string;

  @ApiProperty({ example: 'dni-frente.jpg' })
  @IsString()
  fileName: string;

  /**
   * Id de la entidad dueña (vehicleId, driverId, helperId) según el scope.
   * Para avatar/user-dni/receipt se ignora (se usa el user del JWT).
   */
  @ApiPropertyOptional({ example: 'clx123...' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ example: 1048576, description: 'Tamaño en bytes' })
  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}
