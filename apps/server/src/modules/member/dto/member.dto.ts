import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMemberLevelDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nameZh!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nameVi!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPoints?: number;

  @ApiPropertyOptional({ description: '累计消费升级门槛（越南盾）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSpend?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  birthdayBonusPoints?: number;

  @ApiPropertyOptional({ description: '配送费减免（越南盾）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryFeeOff?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priorityReserve?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priorityDelivery?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  birthdayGift?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class UpdateMemberLevelDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSpend?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  birthdayBonusPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryFeeOff?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priorityReserve?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  priorityDelivery?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  birthdayGift?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class JoinMemberDto {
  @ApiProperty()
  @IsDateString()
  birthday!: string;

  @ApiProperty()
  @IsBoolean()
  agree!: boolean;
}

export class MemberQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  memberLevelId?: string;
}

export class AdjustPointsDto {
  @ApiProperty({ description: '可正可负' })
  @Type(() => Number)
  @IsInt()
  delta!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class AdjustBalanceDto {
  @ApiProperty({ description: '越南盾整数，可正可负' })
  @Type(() => Number)
  @IsInt()
  delta!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
