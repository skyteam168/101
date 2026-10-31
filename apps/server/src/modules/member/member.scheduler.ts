import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MemberService } from './member.service';

@Injectable()
export class MemberScheduler {
  private readonly logger = new Logger(MemberScheduler.name);

  constructor(private readonly members: MemberService) {}

  /** 每小时检查生日会员，当天只发一次祝福（越南时区） */
  @Cron('15 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async birthdayGreetings() {
    const result = await this.members.sendBirthdayGreetings('1');
    if (result.sent) this.logger.log(`birthday greetings sent: ${result.sent}`);
  }
}
