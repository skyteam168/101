import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ enum: ['zh', 'vi'] })
  @IsOptional()
  @IsIn(['zh', 'vi'])
  lang?: 'zh' | 'vi';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;
}
