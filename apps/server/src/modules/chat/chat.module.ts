import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { StorageModule } from '../../storage/storage.module';
import { StoreModule } from '../store/store.module';
import { ChatAdminController } from './chat-admin.controller';
import { ChatCustomerController } from './chat-customer.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    StoreModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      }),
    }),
  ],
  controllers: [ChatCustomerController, ChatAdminController],
  providers: [ChatService, CustomerAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
