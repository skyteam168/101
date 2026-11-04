import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @MaxLength(128)
  @IsNotEmpty()
  username!: string;

  /** 登录不强制复杂度，避免历史弱密码账号无法登录；设密口另有规则 */
  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  password!: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token' })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  cfTurnstileToken?: string;
}
