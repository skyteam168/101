import { Module } from '@nestjs/common';
import { ComboModule } from '../combo/combo.module';
import { GroupMealController } from './group-meal.controller';
import { GroupMealService } from './group-meal.service';
import { PublicGroupMealController } from './public-group-meal.controller';

@Module({
  imports: [ComboModule],
  controllers: [GroupMealController, PublicGroupMealController],
  providers: [GroupMealService],
  exports: [GroupMealService],
})
export class GroupMealModule {}
