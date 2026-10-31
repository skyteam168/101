import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  nameVi!: string;
}

export class UpdateStationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nameVi?: string;
}

export class CreatePrinterDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  ip!: string;

  @ApiPropertyOptional({ default: 9100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ enum: [58, 80] })
  @Type(() => Number)
  @IsIn([58, 80])
  paperWidth!: 58 | 80;

  @ApiProperty({ enum: ['front', 'kitchen'] })
  @IsIn(['front', 'kitchen'])
  role!: 'front' | 'kitchen';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  stationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  agentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePrinterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ enum: [58, 80] })
  @IsOptional()
  @Type(() => Number)
  @IsIn([58, 80])
  paperWidth?: 58 | 80;

  @ApiPropertyOptional({ enum: ['front', 'kitchen'] })
  @IsOptional()
  @IsIn(['front', 'kitchen'])
  role?: 'front' | 'kitchen';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  stationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  agentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAgentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;
}

export class UpdateAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;
}

export class ReprintDto {
  @ApiPropertyOptional({ description: '改打到其他打印机' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  printerId?: string;
}

export class JobQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ShiftPrintDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cashierName?: string;

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
