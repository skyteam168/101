import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
