import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { MemberController } from './member.controller';
import { MemberScheduler } from './member.scheduler';
import { MemberService } from './member.service';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [MemberController],
  providers: [MemberService, MemberScheduler],
  exports: [MemberService],
})
export class MemberModule {}
