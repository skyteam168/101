import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GuestAuthGuard } from '../../common/guards/guest-auth.guard';
import { InventoryModule } from '../inventory/inventory.module';
import { PublicSessionController } from './public-session.controller';
import { PublicTableController } from './public-table.controller';
import { PublicTableService } from './public-table.service';

@Module({
  imports: [
    InventoryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      }),
    }),
  ],
  controllers: [PublicSessionController, PublicTableController],
  providers: [PublicTableService, GuestAuthGuard],
  exports: [PublicTableService],
})
export class PublicTableModule {}
