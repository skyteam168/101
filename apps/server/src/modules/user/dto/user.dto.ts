import {
  ApiProperty,
  ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'cashier01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]{3,64}$/)
  username!: string;

  @ApiProperty({ example: 'Cashier@123', description: '8–64 位，须含字母和数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/, {
    message: 'PASSWORD_TOO_WEAK',
  })
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  roleIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';

  @ApiPropertyOptional({ enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleIds?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ description: '8–64 位，须含字母和数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7E]{8,64}$/, {
    message: 'PASSWORD_TOO_WEAK',
  })
  password!: string;
}
