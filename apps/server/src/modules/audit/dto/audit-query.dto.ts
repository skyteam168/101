import {
  ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class LoginLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  username?: string;

  @ApiPropertyOptional({ enum: ['success', 'fail', 'logout'] })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ip?: string;

  @ApiPropertyOptional({ description: 'ISO 开始时间' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 结束时间' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;
}

export class CustomerLoginLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  email?: string;

  @ApiPropertyOptional({
    enum: ['register', 'login', 'login_code', 'google', 'logout', 'password_change'],
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  action?: string;

  @ApiPropertyOptional({ enum: ['success', 'fail', 'logout'] })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;
}

export class OperationLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;
}
