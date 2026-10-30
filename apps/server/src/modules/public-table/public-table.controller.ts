import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { JoinTableDto } from './dto/public-table.dto';
import { PublicTableService } from './public-table.service';

@ApiTags('public-table')
@Controller('public/table')
export class PublicTableController {
  constructor(private readonly service: PublicTableService) {}

  @Public()
  @Get(':qrToken')
  peek(@Param('qrToken') qrToken: string) {
    return this.service.peek(qrToken);
  }

  @Public()
  @Post(':qrToken/join')
  join(@Param('qrToken') qrToken: string, @Body() dto: JoinTableDto) {
    return this.service.join(qrToken, dto);
  }
}
