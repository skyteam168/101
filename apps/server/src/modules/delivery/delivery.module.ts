import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AddressService } from './address.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerController } from './customer.controller';
import { DeliveryAdminController } from './delivery-admin.controller';
import { DeliveryOrderService } from './delivery-order.service';
import { MailService } from './mail.service';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { ComboModule } from '../combo/combo.module';
import { MarketingModule } from '../marketing/marketing.module';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [
    MarketingModule,
    ComboModule,
    MemberModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      }),
    }),
  ],
  controllers: [CustomerController, DeliveryAdminController],
  providers: [
    MailService,
    CustomerAuthService,
    AddressService,
    DeliveryOrderService,
    CustomerAuthGuard,
  ],
  exports: [DeliveryOrderService, MailService],
})
export class DeliveryModule {}
