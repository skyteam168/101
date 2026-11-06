<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { Events, formatVND, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import {
  batchPriceApi,
  batchSoldOutApi,
  batchStatusApi,
  createCategoryApi,
  createDishApi,
  deleteCategoryApi,
  deleteDishApi,
  listCategoriesApi,
  listDishesApi,
  listStationsApi,
  updateCategoryApi,
  updateDishApi,
  uploadImageApi,
  type Category,
  type Dish,
  type DishOption,
  type Station,
} from '../../api/menu';
import {
  listDishRecipesApi,
  listIngredientsApi,
  setDishRecipesApi,
  type Ingredient,
} from '../../api/inventory';
import { useUserStore } from '../../stores/user';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const stations = ref<Station[]>([]);
const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const loading = ref(false);
const selectedCategoryId = ref<string>('');
const keyword = ref('');
const statusFilter = ref<'' | 'on' | 'off'>('');
const selectedIds = ref<string[]>([]);

const catDialog = ref(false);
const catForm = reactive({
  id: '' as string,
  nameZh: '',
  nameVi: '',
  sort: 0,
  isActive: true,
  kitchenStationId: '' as string | null,
});

const drawer = ref(false);
const editingId = ref<string | null>(null);
const dishForm = reactive({
  categoryId: '',
  nameZh: '',
  nameVi: '',
  descZh: '',
  descVi: '',
  image: '' as string | null,
  price: 0,
  takeawayPrice: 0,
  unit: '份',
  status: 'on' as 'on' | 'off',
  stock: null as number | null,
  dailyStock: null as number | null,
  sort: 0,
  isDineIn: true,
  isDelivery: true,
  isNew: false,
  options: [] as DishOption[],
});

const priceText = ref('');
const takeawayText = ref('');
const ingredients = ref<Ingredient[]>([]);
const recipeLines = ref<{ ingredientId: string; qty: number }[]>([]);
let socket: Socket | null = null;

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

async function loadMeta() {
  stations.value = await listStationsApi();
  categories.value = await listCategoriesApi();
  try {
    ingredients.value = await listIngredientsApi();
  } catch {
    ingredients.value = [];
  }
  if (!selectedCategoryId.value && categories.value.length) {
    selectedCategoryId.value = categories.value[0].id;
  }
}

async function loadDishes() {
  loading.value = true;
  try {
    dishes.value = await listDishesApi({
      categoryId: selectedCategoryId.value || undefined,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
    });
  } finally {
    loading.value = false;
  }
}

function openCreateCategory() {
  Object.assign(catForm, {
    id: '',
    nameZh: '',
    nameVi: '',
    sort: categories.value.length + 1,
    isActive: true,
    kitchenStationId: stations.value[0]?.id || null,
  });
  catDialog.value = true;
}

function openEditCategory(c: Category) {
  Object.assign(catForm, {
    id: c.id,
    nameZh: c.nameZh,
    nameVi: c.nameVi,
    sort: c.sort,
    isActive: c.isActive,
    kitchenStationId: c.kitchenStationId,
  });
  catDialog.value = true;
}

async function saveCategory() {
  const payload = {
    nameZh: catForm.nameZh,
    nameVi: catForm.nameVi,
    sort: catForm.sort,
    isActive: catForm.isActive,
    kitchenStationId: catForm.kitchenStationId || null,
  };
  if (catForm.id) await updateCategoryApi(catForm.id, payload);
  else await createCategoryApi(payload);
  ElMessage.success(t('common.saved'));
  catDialog.value = false;
  await loadMeta();
}

async function removeCategory(c: Category) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteCategoryApi(c.id);
  if (selectedCategoryId.value === c.id) selectedCategoryId.value = '';
  ElMessage.success(t('common.saved'));
  await loadMeta();
  await loadDishes();
}

function resetDishForm() {
  Object.assign(dishForm, {
    categoryId: selectedCategoryId.value || categories.value[0]?.id || '',
    nameZh: '',
    nameVi: '',
    descZh: '',
    descVi: '',
    image: null,
    price: 0,
    takeawayPrice: 0,
    unit: '份',
    status: 'on',
    stock: null,
    dailyStock: null,
    sort: 0,
    isDineIn: true,
    isDelivery: true,
    isNew: false,
    options: [],
  });
  priceText.value = '';
  takeawayText.value = '';
}

function openCreateDish() {
  editingId.value = null;
  resetDishForm();
  recipeLines.value = [];
  drawer.value = true;
}

async function openEditDish(d: Dish) {
  editingId.value = d.id;
  Object.assign(dishForm, {
    categoryId: d.categoryId,
    nameZh: d.nameZh,
    nameVi: d.nameVi,
    descZh: d.descZh || '',
    descVi: d.descVi || '',
    image: d.image,
    price: d.price,
    takeawayPrice: d.takeawayPrice,
    unit: d.unit,
    status: d.status,
    stock: d.stock,
    dailyStock: d.dailyStock,
    sort: d.sort,
    isDineIn: d.isDineIn,
    isDelivery: d.isDelivery,
    isNew: d.isNew,
    options: d.options.map((o) => ({ ...o })),
  });
  priceText.value = formatThousands(d.price);
  takeawayText.value = formatThousands(d.takeawayPrice);
  recipeLines.value = [];
  drawer.value = true;
  try {
    const rows = await listDishRecipesApi(d.id);
    recipeLines.value = rows.map((r) => ({ ingredientId: r.ingredientId, qty: r.qty }));
  } catch {
    recipeLines.value = [];
  }
}

function addRecipeLine() {
  const first = ingredients.value.find(
    (i) => i.isActive && !recipeLines.value.some((r) => r.ingredientId === i.id),
  );
  recipeLines.value.push({ ingredientId: first?.id || '', qty: 0.1 });
}

function addOption() {
  dishForm.options.push({
    groupNameZh: '辣度',
    groupNameVi: 'Độ cay',
    optionNameZh: '微辣',
    optionNameVi: 'Ít cay',
    extraPrice: 0,
    required: false,
    multi: false,
    sort: dishForm.options.length,
  });
}

async function onUpload(file: File) {
  const res = await uploadImageApi(file);
  dishForm.image = res.url;
  return false;
}

async function saveDish() {
  const nameZh = dishForm.nameZh.trim();
  if (!nameZh) {
    ElMessage.warning(t('menuMgmt.nameRequired'));
    return;
  }
  if (!dishForm.categoryId) {
    ElMessage.warning(t('menuMgmt.categoryRequired'));
    return;
  }
  // 未填越文时回落中文，避免只填中文 Tab 时校验失败
  if (!dishForm.nameVi.trim()) dishForm.nameVi = nameZh;
  if (!dishForm.descVi.trim() && dishForm.descZh.trim()) {
    dishForm.descVi = dishForm.descZh.trim();
  }
  dishForm.nameZh = nameZh;
  dishForm.price = parseThousands(priceText.value);
  dishForm.takeawayPrice = parseThousands(takeawayText.value);
  const payload = {
    ...dishForm,
    image: dishForm.image || undefined,
    stock: dishForm.stock == null ? undefined : dishForm.stock,
    dailyStock: dishForm.dailyStock == null ? undefined : dishForm.dailyStock,
  };
  let dishId = editingId.value;
  if (dishId) await updateDishApi(dishId, payload);
  else {
    const created = await createDishApi(payload);
    dishId = created.id;
  }
  if (dishId) {
    const items = recipeLines.value
      .filter((r) => r.ingredientId && r.qty > 0)
      .map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) }));
    await setDishRecipesApi(dishId, items);
  }
  ElMessage.success(t('common.saved'));
  drawer.value = false;
  await refreshAll();
}

async function refreshAll() {
  await Promise.all([loadDishes(), loadMeta()]);
}

async function removeDish(d: Dish) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteDishApi(d.id);
  ElMessage.success(t('common.saved'));
  // 同步刷新分类 dishCount，避免左侧「火锅 (1)」残留旧数字
  await refreshAll();
}

async function doBatchStatus(status: 'on' | 'off') {
  if (!selectedIds.value.length) return;
  await batchStatusApi(selectedIds.value, status);
  ElMessage.success(t('common.saved'));
  await loadDishes();
}

async function doBatchPrice() {
  if (!selectedIds.value.length) return;
  const { value } = await ElMessageBox.prompt(t('menuMgmt.batchPriceHint'), t('menuMgmt.batchPrice'), {
    inputPattern: /^\d+$/,
  });
  const price = Number(value);
  await batchPriceApi(selectedIds.value, price, price);
  ElMessage.success(t('common.saved'));
  await loadDishes();
}

async function doSoldOut() {
  if (!selectedIds.value.length) return;
  await ElMessageBox.confirm(t('menuMgmt.soldOutConfirm'), { type: 'warning' });
  await batchSoldOutApi(selectedIds.value);
  ElMessage.success(t('common.saved'));
  await loadDishes();
}

function onSelectionChange(rows: Dish[]) {
  selectedIds.value = rows.map((r) => r.id);
}

function connectSocket() {
  const storeId = userStore.profile?.storeId || '1';
  socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    socket?.emit('join', { room: `store:${storeId}:front` });
  });
  socket.on(Events.DISH_UPDATED, () => {
    loadDishes();
    loadMeta();
  });
}

onMounted(async () => {
  await loadMeta();
  await loadDishes();
  connectSocket();
});

onUnmounted(() => {
  socket?.disconnect();
});
</script>

<template>
  <el-row :gutter="12" class="page">
    <el-col :span="6">
      <el-card shadow="never">
        <div class="toolbar">
          <strong>{{ t('menuMgmt.categories') }}</strong>
          <el-button v-perm="'menu:dish:edit'" type="primary" link :icon="Plus" @click="openCreateCategory">
            {{ t('common.create') }}
          </el-button>
        </div>
        <el-menu :default-active="selectedCategoryId" @select="(id: string) => { selectedCategoryId = id; loadDishes(); }">
          <el-menu-item
            v-for="c in categories"
            :key="c.id"
            :index="c.id"
          >
            <div class="cat-item">
              <span>{{ nameOf(c) }} ({{ c.dishCount }})</span>
              <span class="ops">
                <el-button v-perm="'menu:dish:edit'" link size="small" @click.stop="openEditCategory(c)">
                  {{ t('common.edit') }}
                </el-button>
                <el-button v-perm="'menu:dish:edit'" link size="small" type="danger" @click.stop="removeCategory(c)">
                  {{ t('common.delete') }}
                </el-button>
              </span>
            </div>
          </el-menu-item>
        </el-menu>
      </el-card>
    </el-col>

    <el-col :span="18">
      <el-card shadow="never">
        <div class="toolbar">
          <div class="filters">
            <el-input v-model="keyword" clearable :placeholder="t('menuMgmt.search')" style="width: 200px" @keyup.enter="loadDishes" />
            <el-select v-model="statusFilter" clearable :placeholder="t('menuMgmt.status')" style="width: 120px" @change="loadDishes">
              <el-option :label="t('menuMgmt.on')" value="on" />
              <el-option :label="t('menuMgmt.off')" value="off" />
            </el-select>
            <el-button @click="loadDishes">{{ t('common.search') }}</el-button>
          </div>
          <div class="actions">
            <el-button v-perm="'menu:dish:edit'" type="primary" @click="openCreateDish">{{ t('common.create') }}</el-button>
            <el-button v-perm="'menu:dish:edit'" @click="doBatchStatus('on')">{{ t('menuMgmt.batchOn') }}</el-button>
            <el-button v-perm="'menu:dish:edit'" @click="doBatchStatus('off')">{{ t('menuMgmt.batchOff') }}</el-button>
            <el-button v-perm="'menu:dish:edit'" @click="doBatchPrice">{{ t('menuMgmt.batchPrice') }}</el-button>
            <el-button
              v-if="userStore.hasPerm('menu:dish:edit') || userStore.hasPerm('menu:dish:sold-out')"
              type="warning"
              @click="doSoldOut"
            >{{ t('menuMgmt.soldOut') }}</el-button>
            <el-button @click="refreshAll">{{ t('common.refresh') }}</el-button>
          </div>
        </div>

        <el-table v-loading="loading" :data="dishes" border @selection-change="onSelectionChange">
          <el-table-column type="selection" width="48" />
          <el-table-column :label="t('menuMgmt.name')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('menuMgmt.price')" width="130">
            <template #default="{ row }">{{ formatVND(row.price) }}</template>
          </el-table-column>
          <el-table-column :label="t('menuMgmt.takeawayPrice')" width="130">
            <template #default="{ row }">{{ formatVND(row.takeawayPrice) }}</template>
          </el-table-column>
          <el-table-column prop="stock" :label="t('menuMgmt.stock')" width="90">
            <template #default="{ row }">{{ row.stock === null ? t('menuMgmt.unlimited') : row.stock }}</template>
          </el-table-column>
          <el-table-column prop="status" :label="t('menuMgmt.status')" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'on' ? 'success' : 'info'">
                {{ row.status === 'on' ? t('menuMgmt.on') : t('menuMgmt.off') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="160" fixed="right">
            <template #default="{ row }">
              <el-button v-perm="'menu:dish:edit'" link type="primary" @click="openEditDish(row)">{{ t('common.edit') }}</el-button>
              <el-button v-perm="'menu:dish:edit'" link type="danger" @click="removeDish(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-col>
  </el-row>

  <el-dialog v-model="catDialog" :title="catForm.id ? t('common.edit') : t('common.create')" width="480px">
    <el-form label-width="110px">
      <el-form-item :label="t('roles.nameZh')"><el-input v-model="catForm.nameZh" /></el-form-item>
      <el-form-item :label="t('roles.nameVi')"><el-input v-model="catForm.nameVi" /></el-form-item>
      <el-form-item :label="t('menuMgmt.sort')"><el-input-number v-model="catForm.sort" :min="0" /></el-form-item>
      <el-form-item :label="t('menuMgmt.station')">
        <el-select v-model="catForm.kitchenStationId" clearable style="width: 100%">
          <el-option v-for="s in stations" :key="s.id" :label="nameOf(s)" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('menuMgmt.active')">
        <el-switch v-model="catForm.isActive" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="catDialog = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="saveCategory">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <el-drawer
    v-model="drawer"
    size="720px"
    class="dish-drawer"
    :title="editingId ? t('common.edit') : t('common.create')"
  >
    <el-tabs>
      <el-tab-pane label="中文">
        <el-form label-width="100px">
          <el-form-item :label="t('menuMgmt.name')"><el-input v-model="dishForm.nameZh" /></el-form-item>
          <el-form-item :label="t('menuMgmt.desc')"><el-input v-model="dishForm.descZh" type="textarea" /></el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="Tiếng Việt">
        <el-form label-width="100px">
          <el-form-item :label="t('menuMgmt.name')"><el-input v-model="dishForm.nameVi" /></el-form-item>
          <el-form-item :label="t('menuMgmt.desc')"><el-input v-model="dishForm.descVi" type="textarea" /></el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <el-form label-width="100px" style="margin-top: 12px">
      <el-form-item :label="t('menuMgmt.category')">
        <el-select v-model="dishForm.categoryId" style="width: 100%">
          <el-option v-for="c in categories" :key="c.id" :label="nameOf(c)" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('menuMgmt.price')">
        <el-input v-model="priceText" @blur="priceText = formatThousands(parseThousands(priceText))" />
      </el-form-item>
      <el-form-item :label="t('menuMgmt.takeawayPrice')">
        <el-input v-model="takeawayText" @blur="takeawayText = formatThousands(parseThousands(takeawayText))" />
      </el-form-item>
      <el-form-item :label="t('menuMgmt.unit')"><el-input v-model="dishForm.unit" /></el-form-item>
      <el-form-item :label="t('menuMgmt.stock')">
        <el-input-number v-model="dishForm.stock" :min="0" controls-position="right" />
        <span class="hint">{{ t('menuMgmt.stockHint') }}</span>
      </el-form-item>
      <el-form-item :label="t('menuMgmt.dailyStock')">
        <el-input-number v-model="dishForm.dailyStock" :min="0" controls-position="right" />
      </el-form-item>
      <el-form-item :label="t('menuMgmt.status')">
        <el-radio-group v-model="dishForm.status">
          <el-radio label="on">{{ t('menuMgmt.on') }}</el-radio>
          <el-radio label="off">{{ t('menuMgmt.off') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('menuMgmt.channels')">
        <el-checkbox v-model="dishForm.isDineIn">{{ t('menuMgmt.dineIn') }}</el-checkbox>
        <el-checkbox v-model="dishForm.isDelivery">{{ t('menuMgmt.delivery') }}</el-checkbox>
        <el-checkbox v-model="dishForm.isNew">{{ t('menuMgmt.isNew') }}</el-checkbox>
      </el-form-item>
      <el-form-item :label="t('menuMgmt.image')">
        <div class="image-row">
          <div v-if="dishForm.image" class="preview-wrap">
            <img :src="dishForm.image" class="preview" alt="" />
          </div>
          <div class="image-actions">
            <el-upload :show-file-list="false" accept="image/*" :before-upload="onUpload">
              <el-button>{{ t('menuMgmt.upload') }}</el-button>
            </el-upload>
            <el-button
              v-if="dishForm.image"
              link
              type="danger"
              @click="dishForm.image = ''"
            >
              {{ t('common.delete') }}
            </el-button>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <div class="opt-head">
      <strong>{{ t('menuMgmt.recipe') }}</strong>
      <el-button link type="primary" @click="addRecipeLine">{{ t('common.create') }}</el-button>
    </div>
    <p class="hint mb">{{ t('menuMgmt.recipeHint') }}</p>
    <div v-for="(line, idx) in recipeLines" :key="idx" class="opt-card">
      <div class="opt-flags">
        <el-select v-model="line.ingredientId" filterable style="flex: 1">
          <el-option
            v-for="ing in ingredients"
            :key="ing.id"
            :label="`${nameOf(ing)} (${ing.unit})`"
            :value="ing.id"
          />
        </el-select>
        <el-input-number v-model="line.qty" :min="0.001" :step="0.1" :precision="3" />
        <el-button link type="danger" @click="recipeLines.splice(idx, 1)">
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>

    <div class="opt-head">
      <strong>{{ t('menuMgmt.options') }}</strong>
      <el-button link type="primary" @click="addOption">{{ t('common.create') }}</el-button>
    </div>
    <div v-for="(opt, idx) in dishForm.options" :key="idx" class="opt-card">
      <div class="opt-grid">
        <el-input v-model="opt.groupNameZh" :placeholder="t('menuMgmt.groupZh')" />
        <el-input v-model="opt.groupNameVi" :placeholder="t('menuMgmt.groupVi')" />
        <el-input v-model="opt.optionNameZh" :placeholder="t('menuMgmt.optionZh')" />
        <el-input v-model="opt.optionNameVi" :placeholder="t('menuMgmt.optionVi')" />
      </div>
      <div class="opt-flags">
        <div class="opt-price">
          <span class="opt-price-label">{{ t('menuMgmt.extraPrice') }}</span>
          <el-input-number v-model="opt.extraPrice" :min="0" :step="1000" controls-position="right" />
        </div>
        <el-checkbox v-model="opt.required">{{ t('menuMgmt.required') }}</el-checkbox>
        <el-checkbox v-model="opt.multi">{{ t('menuMgmt.multi') }}</el-checkbox>
        <el-button link type="danger" @click="dishForm.options.splice(idx, 1)">
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="drawer = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="saveDish">{{ t('common.save') }}</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.page { min-height: calc(100vh - 140px); }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
.filters, .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cat-item { display: flex; justify-content: space-between; width: 100%; align-items: center; }
.ops { opacity: 0.85; }
.hint { margin-left: 8px; color: #909399; font-size: 12px; }
.image-row { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.preview-wrap { flex-shrink: 0; }
.preview { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #ebeef5; display: block; }
.image-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding-top: 4px; }
.opt-head { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
.opt-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.opt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.opt-flags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 10px;
}
.opt-price { display: flex; align-items: center; gap: 8px; }
.opt-price-label { color: #606266; font-size: 13px; white-space: nowrap; }
</style>
