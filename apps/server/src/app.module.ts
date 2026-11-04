import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermGuard } from './common/guards/perm.guard';
import { AssetModule } from './modules/asset/asset.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { ComboModule } from './modules/combo/combo.module';
import { GroupMealModule } from './modules/group-meal/group-meal.module';
import { HealthModule } from './modules/health/health.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { MemberModule } from './modules/member/member.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrderModule } from './modules/order/order.module';
import { PublicTableModule } from './modules/public-table/public-table.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReservationModule } from './modules/reservation/reservation.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { PrintModule } from './modules/print/print.module';
import { ReportModule } from './modules/report/report.module';
import { StoreModule } from './modules/store/store.module';
import { TableModule } from './modules/table/table.module';
import { UserModule } from './modules/user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './modules/security/security.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    SecurityModule,
    AuditModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    RbacModule,
    UserModule,
    MenuModule,
    TableModule,
    OrderModule,
    PublicTableModule,
    StoreModule,
    PrintModule,
    DeliveryModule,
    AssetModule,
    ReportModule,
    InventoryModule,
    HrModule,
    MemberModule,
    MarketingModule,
    ComboModule,
    ReservationModule,
    GroupMealModule,
    ChatModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermGuard },
  ],
})
export class AppModule {}
