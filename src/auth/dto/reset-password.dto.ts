import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido en el link del mail' })
  @IsString()
  @Length(20, 200)
  token: string;

  // bcrypt ignora todo lo que pase de 72 bytes: mejor rechazarlo que truncarlo en silencio.
  @ApiProperty({ minLength: 6, maxLength: 72 })
  @IsString()
  @Length(6, 72, {
    message: 'La contraseña debe tener entre 6 y 72 caracteres',
  })
  password: string;
}
