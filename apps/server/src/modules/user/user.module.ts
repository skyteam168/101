import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [RbacModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
