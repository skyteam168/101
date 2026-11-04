import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePerm } from '../../common/decorators/require-perm.decorator';
import { BusinessError } from '../../common/errors/business.error';
import { AuthUser } from '../auth/auth.types';
import {
  CreateIngredientDto,
  CreatePurchaseDto,
  CreateStocktakeDto,
  CreateSupplierDto,
  DayQueryDto,
  SetDishRecipesDto,
  UpdateIngredientDto,
  UpdateSupplierDto,
} from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  private storeId(user: AuthUser) {
    if (!user.storeId) throw new BusinessError('STORE_REQUIRED');
    return user.storeId;
  }

  @Get('suppliers')
  @RequirePerm('menu:inventory')
  suppliers(@CurrentUser() user: AuthUser, @Query('activeOnly') activeOnly?: string) {
    return this.inventory.listSuppliers(this.storeId(user), activeOnly === '1' || activeOnly === 'true');
  }

  @Post('suppliers')
  @RequirePerm('menu:inventory')
  createSupplier(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(this.storeId(user), dto);
  }

  @Patch('suppliers/:id')
  @RequirePerm('menu:inventory')
  updateSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.inventory.updateSupplier(this.storeId(user), id, dto);
  }

  @Get('ingredients')
  @RequirePerm('menu:inventory')
  ingredients(@CurrentUser() user: AuthUser, @Query('kind') kind?: string) {
    return this.inventory.listIngredients(this.storeId(user), kind);
  }

  @Post('ingredients')
  @RequirePerm('menu:inventory')
  createIngredient(@CurrentUser() user: AuthUser, @Body() dto: CreateIngredientDto) {
    return this.inventory.createIngredient(this.storeId(user), dto);
  }

  @Patch('ingredients/:id')
  @RequirePerm('menu:inventory')
  updateIngredient(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.inventory.updateIngredient(this.storeId(user), id, dto);
  }

  @Get('purchases')
  @RequirePerm('menu:inventory')
  purchases(@CurrentUser() user: AuthUser, @Query() query: DayQueryDto) {
    return this.inventory.listPurchases(this.storeId(user), query.date);
  }

  @Post('purchases')
  @RequirePerm('menu:inventory')
  createPurchase(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.inventory.createPurchase(this.storeId(user), user.id, dto);
  }

  @Get('stocktakes/preview')
  @RequirePerm('menu:inventory')
  preview(@CurrentUser() user: AuthUser, @Query() query: DayQueryDto) {
    return this.inventory.previewStocktake(this.storeId(user), query.date);
  }

  @Post('stocktakes')
  @RequirePerm('menu:inventory')
  stocktake(@CurrentUser() user: AuthUser, @Body() dto: CreateStocktakeDto) {
    return this.inventory.createAndConfirmStocktake(this.storeId(user), user.id, dto);
  }

  @Get('daily')
  @RequirePerm('menu:inventory')
  daily(@CurrentUser() user: AuthUser, @Query() query: DayQueryDto) {
    return this.inventory.getDailyConsumption(this.storeId(user), query.date);
  }

  @Get('dishes/:dishId/recipes')
  @RequirePerm('menu:dish')
  listRecipes(@CurrentUser() user: AuthUser, @Param('dishId') dishId: string) {
    return this.inventory.listDishRecipes(this.storeId(user), dishId);
  }

  @Put('dishes/:dishId/recipes')
  @RequirePerm('menu:dish:edit')
  setRecipes(
    @CurrentUser() user: AuthUser,
    @Param('dishId') dishId: string,
    @Body() dto: SetDishRecipesDto,
  ) {
    return this.inventory.setDishRecipes(this.storeId(user), dishId, dto);
  }

  @Get('movements')
  @RequirePerm('menu:inventory')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('ingredientId') ingredientId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inventory.listMovements(this.storeId(user), {
      ingredientId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
