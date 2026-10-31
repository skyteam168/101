import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  SetUserRolesDto,
  UpdateRoleDto,
} from './dto/role.dto';
import { RbacService } from './rbac.service';

@ApiTags('rbac')
@ApiBearerAuth()
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePerm('system:role')
  listRoles() {
    return this.rbacService.listRoles();
  }

  /** 员工管理分配角色时使用（不要求 system:role） */
  @Get('roles/brief')
  @RequirePerm('menu:system:user')
  listRolesBrief() {
    return this.rbacService.listRoles();
  }

  @Post('roles')
  @RequirePerm('system:role')
  createRole(@Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePerm('system:role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePerm('system:role')
  deleteRole(@Param('id') id: string) {
    return this.rbacService.deleteRole(id);
  }

  @Get('permissions/tree')
  @RequirePerm('system:role')
  permissionTree() {
    return this.rbacService.getPermissionTree();
  }

  @Get('roles/:id/permissions')
  @RequirePerm('system:role')
  rolePermissions(@Param('id') id: string) {
    return this.rbacService.getRolePermissionIds(id);
  }

  @Put('roles/:id/permissions')
  @RequirePerm('system:role')
  setRolePermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.rbacService.setRolePermissions(id, dto.permissionIds, user.id);
  }

  @Put('users/:userId/roles')
  @RequirePerm('system:role')
  setUserRoles(@Param('userId') userId: string, @Body() dto: SetUserRolesDto) {
    return this.rbacService.setUserRoles(userId, dto.roleIds);
  }
}
