import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateNoticeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  titleZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  titleVi!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  contentZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  contentVi!: string;

  @ApiPropertyOptional({ enum: ['info', 'warn', 'important'] })
  @IsOptional()
  @IsIn(['info', 'warn', 'important'])
  level?: 'info' | 'warn' | 'important';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class UpdateNoticeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  titleZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  titleVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  contentZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  contentVi?: string;

  @ApiPropertyOptional({ enum: ['info', 'warn', 'important'] })
  @IsOptional()
  @IsIn(['info', 'warn', 'important'])
  level?: 'info' | 'warn' | 'important';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
