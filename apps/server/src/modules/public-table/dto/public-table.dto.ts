import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class JoinTableDto {
  @ApiProperty({ example: '小明' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  nickname!: string;

  @ApiPropertyOptional({ description: '4 位 PIN（门店开启时必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  pin?: string;

  @ApiPropertyOptional({ description: '空闲开台时的人数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  guestCount?: number;
}

export class CartItemDto {
  @ApiProperty()
  @IsString()
  dishId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  optionsSnapshot?: unknown;
}

export class UpdateCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}

export class PatchCartItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty!: number;
}

export class AddCartItemsDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}
