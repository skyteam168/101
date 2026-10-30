<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  confirmStocktakeApi,
  createIngredientApi,
  createPurchaseApi,
  createSupplierApi,
  dailyInventoryApi,
  listIngredientsApi,
  listPurchasesApi,
  listSuppliersApi,
  previewStocktakeApi,
  updateIngredientApi,
  updateSupplierApi,
  type Ingredient,
  type Purchase,
  type StocktakePreviewItem,
  type Supplier,
} from '../../api/inventory';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));
const tab = ref('ingredients');
const loading = ref(false);
const date = ref(new Date().toISOString().slice(0, 10));

const suppliers = ref<Supplier[]>([]);
const ingredients = ref<Ingredient[]>([]);
const purchases = ref<Purchase[]>([]);
const purchaseTotal = ref(0);
const preview = ref<StocktakePreviewItem[]>([]);
const daily = ref<Awaited<ReturnType<typeof dailyInventoryApi>> | null>(null);

const activeSuppliers = computed(() => suppliers.value.filter((s) => s.isActive));

const ingDialog = ref(false);
const ingForm = reactive({
  id: '',
  nameZh: '',
  nameVi: '',
  kind: 'vegetable' as 'vegetable' | 'seasoning' | 'other',
  unit: 'kg',
  stockQty: 0,
  lastCostText: '',
});

const supplierDialog = ref(false);
const supplierForm = reactive({
  id: '',
  nameZh: '',
  nameVi: '',
  contactName: '',
  phone: '',
  address: '',
  note: '',
  isActive: true,
});

const buyDialog = ref(false);
const buyForm = reactive({
  supplierId: '',
  note: '',
  lines: [] as { ingredientId: string; qty: number; unitPriceText: string }[],
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

function supplierNameOf(row: Purchase) {
  if (row.supplierNameZh || row.supplierNameVi) {
    return nameOf({
      nameZh: row.supplierNameZh || row.supplier || '',
      nameVi: row.supplierNameVi || row.supplier || '',
    });
  }
  return row.supplier || '—';
}

function kindLabel(k: string) {
  return t(`inventory.kind.${k}`, k);
}

async function loadSuppliers() {
  suppliers.value = await listSuppliersApi();
}

async function loadIngredients() {
  ingredients.value = await listIngredientsApi();
}

async function loadPurchases() {
  const res = await listPurchasesApi(date.value);
  purchases.value = res.list;
  purchaseTotal.value = res.list.reduce((s, p) => s + p.totalAmount, 0);
}

async function loadPreview() {
  const res = await previewStocktakeApi(date.value);
  preview.value = res.items.map((i) => ({ ...i }));
}

async function loadDaily() {
  daily.value = await dailyInventoryApi(date.value);
}

async function refresh() {
  loading.value = true;
  try {
    if (tab.value === 'suppliers') await loadSuppliers();
    else if (tab.value === 'ingredients') await loadIngredients();
    else if (tab.value === 'purchase') {
      await Promise.all([loadPurchases(), loadSuppliers(), loadIngredients()]);
    } else if (tab.value === 'stocktake') await loadPreview();
    else await loadDaily();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function openIng(row?: Ingredient) {
  ingForm.id = row?.id || '';
  ingForm.nameZh = row?.nameZh || '';
  ingForm.nameVi = row?.nameVi || '';
  ingForm.kind = row?.kind || 'vegetable';
  ingForm.unit = row?.unit || 'kg';
  ingForm.stockQty = row?.stockQty || 0;
  ingForm.lastCostText = row ? formatThousands(row.lastCost) : '';
  ingDialog.value = true;
}

async function saveIng() {
  if (ingForm.id) {
    await updateIngredientApi(ingForm.id, {
      nameZh: ingForm.nameZh,
      nameVi: ingForm.nameVi,
      kind: ingForm.kind,
      unit: ingForm.unit,
    });
  } else {
    await createIngredientApi({
      nameZh: ingForm.nameZh,
      nameVi: ingForm.nameVi,
      kind: ingForm.kind,
      unit: ingForm.unit,
      stockQty: ingForm.stockQty,
      lastCost: parseThousands(ingForm.lastCostText),
    });
  }
  ElMessage.success(t('common.saved'));
  ingDialog.value = false;
  await loadIngredients();
}

function openSupplier(row?: Supplier) {
  supplierForm.id = row?.id || '';
  supplierForm.nameZh = row?.nameZh || '';
  supplierForm.nameVi = row?.nameVi || '';
  supplierForm.contactName = row?.contactName || '';
  supplierForm.phone = row?.phone || '';
  supplierForm.address = row?.address || '';
  supplierForm.note = row?.note || '';
  supplierForm.isActive = row?.isActive ?? true;
  supplierDialog.value = true;
}

async function saveSupplier() {
  if (!supplierForm.nameZh.trim() || !supplierForm.nameVi.trim()) {
    ElMessage.warning(t('inventory.supplierNameRequired'));
    return;
  }
  const payload = {
    nameZh: supplierForm.nameZh.trim(),
    nameVi: supplierForm.nameVi.trim(),
    contactName: supplierForm.contactName.trim() || undefined,
    phone: supplierForm.phone.trim() || undefined,
    address: supplierForm.address.trim() || undefined,
    note: supplierForm.note.trim() || undefined,
  };
  if (supplierForm.id) {
    await updateSupplierApi(supplierForm.id, {
      ...payload,
      isActive: supplierForm.isActive,
    });
  } else {
    await createSupplierApi(payload);
  }
  ElMessage.success(t('common.saved'));
  supplierDialog.value = false;
  await loadSuppliers();
}

async function toggleSupplier(row: Supplier) {
  await updateSupplierApi(row.id, { isActive: !row.isActive });
  ElMessage.success(t('common.saved'));
  await loadSuppliers();
}

function openBuy() {
  buyForm.supplierId = activeSuppliers.value[0]?.id || '';
  buyForm.note = '';
  buyForm.lines = [
    { ingredientId: ingredients.value[0]?.id || '', qty: 1, unitPriceText: '' },
  ];
  buyDialog.value = true;
  if (!ingredients.value.length) loadIngredients();
  if (!suppliers.value.length) loadSuppliers();
}

function addBuyLine() {
  buyForm.lines.push({
    ingredientId: ingredients.value[0]?.id || '',
    qty: 1,
    unitPriceText: '',
  });
}

async function saveBuy() {
  if (!buyForm.supplierId) {
    ElMessage.warning(t('inventory.supplierRequired'));
    return;
  }
  await createPurchaseApi({
    businessDate: date.value,
    supplierId: buyForm.supplierId,
    note: buyForm.note || undefined,
    items: buyForm.lines.map((l) => ({
      ingredientId: l.ingredientId,
      qty: l.qty,
      unitPrice: parseThousands(l.unitPriceText),
    })),
  });
  ElMessage.success(t('common.saved'));
  buyDialog.value = false;
  await loadPurchases();
}

async function confirmTake() {
  await confirmStocktakeApi({
    businessDate: date.value,
    items: preview.value.map((i) => ({
      ingredientId: i.ingredientId,
      countedQty: i.countedQty,
    })),
  });
  ElMessage.success(t('inventory.stocktakeDone'));
  await loadPreview();
  await loadIngredients();
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('inventory.title') }}</h3>
      <div class="actions">
        <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" @change="refresh" />
        <el-button type="primary" @click="refresh">{{ t('common.search') }}</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="refresh">
      <el-tab-pane :label="t('inventory.suppliers')" name="suppliers">
        <el-button type="primary" style="margin-bottom: 10px" @click="openSupplier()">
          {{ t('inventory.addSupplier') }}
        </el-button>
        <el-table :data="suppliers" border>
          <el-table-column :label="t('inventory.name')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="contactName" :label="t('inventory.contactName')" width="120" />
          <el-table-column prop="phone" :label="t('common.phone')" width="130" />
          <el-table-column prop="address" :label="t('common.address')" min-width="180" show-overflow-tooltip />
          <el-table-column prop="note" :label="t('inventory.note')" min-width="120" show-overflow-tooltip />
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">
              {{ row.isActive ? t('common.enabled') : t('common.disabled') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="160">
            <template #default="{ row }">
              <el-button link type="primary" @click="openSupplier(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="warning" @click="toggleSupplier(row)">
                {{ row.isActive ? t('common.disable') : t('common.enable') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('inventory.ingredients')" name="ingredients">
        <el-button type="primary" style="margin-bottom: 10px" @click="openIng()">
          {{ t('inventory.addIngredient') }}
        </el-button>
        <el-table :data="ingredients" border>
          <el-table-column :label="t('inventory.name')" min-width="120">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('inventory.kindLabel')" width="100">
            <template #default="{ row }">{{ kindLabel(row.kind) }}</template>
          </el-table-column>
          <el-table-column prop="unit" :label="t('inventory.unit')" width="80" />
          <el-table-column prop="stockQty" :label="t('inventory.stock')" width="90" />
          <el-table-column :label="t('inventory.lastCost')" width="120">
            <template #default="{ row }">{{ formatVND(row.lastCost) }}</template>
          </el-table-column>
          <el-table-column :label="t('inventory.stockValue')" width="130">
            <template #default="{ row }">{{ formatVND(row.stockValue) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="100">
            <template #default="{ row }">
              <el-button link type="primary" @click="openIng(row)">{{ t('common.edit') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('inventory.purchase')" name="purchase">
        <div class="subbar">
          <el-button type="primary" @click="openBuy">{{ t('inventory.addPurchase') }}</el-button>
          <span>{{ t('inventory.dayTotal') }}：{{ formatVND(purchaseTotal) }}</span>
        </div>
        <el-table :data="purchases" border>
          <el-table-column prop="createdAt" :label="t('inventory.time')" min-width="160">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column :label="t('inventory.supplier')" width="160">
            <template #default="{ row }">{{ supplierNameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('inventory.amount')" width="120">
            <template #default="{ row }">{{ formatVND(row.totalAmount) }}</template>
          </el-table-column>
          <el-table-column :label="t('inventory.items')" min-width="220">
            <template #default="{ row }">
              <div v-for="it in row.items" :key="it.ingredientId + it.qty">
                {{ nameOf(it) }} {{ it.qty }}{{ it.unit }} × {{ formatVND(it.unitPrice) }}
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('inventory.stocktake')" name="stocktake">
        <div class="subbar">
          <span>{{ t('inventory.stocktakeHint') }}</span>
          <el-button type="warning" @click="confirmTake">{{ t('inventory.confirmStocktake') }}</el-button>
        </div>
        <el-table :data="preview" border>
          <el-table-column :label="t('inventory.name')" min-width="120">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="unit" :label="t('inventory.unit')" width="70" />
          <el-table-column prop="openingQty" :label="t('inventory.opening')" width="90" />
          <el-table-column prop="purchasedQty" :label="t('inventory.purchased')" width="90" />
          <el-table-column :label="t('inventory.counted')" width="140">
            <template #default="{ row }">
              <el-input-number v-model="row.countedQty" :min="0" :step="0.1" size="small" />
            </template>
          </el-table-column>
          <el-table-column :label="t('inventory.consumption')" width="100">
            <template #default="{ row }">
              {{ Math.max(0, Number((row.openingQty + row.purchasedQty - row.countedQty).toFixed(3))) }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('inventory.daily')" name="daily">
        <el-descriptions v-if="daily" :column="3" border style="margin-bottom: 12px">
          <el-descriptions-item :label="t('inventory.businessDate')">{{ daily.businessDate }}</el-descriptions-item>
          <el-descriptions-item :label="t('inventory.dayTotal')">{{ formatVND(daily.purchaseTotal) }}</el-descriptions-item>
          <el-descriptions-item :label="t('inventory.consumptionAmount')">
            {{ formatVND(daily.stocktake?.totalConsumptionAmount ?? 0) }}
          </el-descriptions-item>
        </el-descriptions>
        <el-table v-if="daily?.stocktake" :data="daily.stocktake.items" border>
          <el-table-column :label="t('inventory.name')" min-width="120">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="openingQty" :label="t('inventory.opening')" width="90" />
          <el-table-column prop="purchasedQty" :label="t('inventory.purchased')" width="90" />
          <el-table-column prop="countedQty" :label="t('inventory.counted')" width="90" />
          <el-table-column prop="consumptionQty" :label="t('inventory.consumption')" width="90" />
          <el-table-column :label="t('inventory.consumptionAmount')" width="130">
            <template #default="{ row }">{{ formatVND(row.consumptionAmount) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else :description="t('inventory.noStocktake')" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="supplierDialog" :title="t('inventory.supplier')" width="520px">
      <el-form label-width="100px">
        <el-form-item :label="t('common.nameZh')" required>
          <el-input v-model="supplierForm.nameZh" />
        </el-form-item>
        <el-form-item :label="t('common.nameVi')" required>
          <el-input v-model="supplierForm.nameVi" />
        </el-form-item>
        <el-form-item :label="t('inventory.contactName')">
          <el-input v-model="supplierForm.contactName" />
        </el-form-item>
        <el-form-item :label="t('common.phone')">
          <el-input v-model="supplierForm.phone" />
        </el-form-item>
        <el-form-item :label="t('common.address')">
          <el-input v-model="supplierForm.address" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('inventory.note')">
          <el-input v-model="supplierForm.note" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item v-if="supplierForm.id" :label="t('common.status')">
          <el-switch
            v-model="supplierForm.isActive"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="supplierDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveSupplier">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ingDialog" :title="t('inventory.ingredient')" width="460px">
      <el-form label-width="100px">
        <el-form-item :label="t('common.nameZh')"><el-input v-model="ingForm.nameZh" /></el-form-item>
        <el-form-item :label="t('common.nameVi')"><el-input v-model="ingForm.nameVi" /></el-form-item>
        <el-form-item :label="t('inventory.kindLabel')">
          <el-select v-model="ingForm.kind" style="width: 100%">
            <el-option :label="t('inventory.kind.vegetable')" value="vegetable" />
            <el-option :label="t('inventory.kind.seasoning')" value="seasoning" />
            <el-option :label="t('inventory.kind.other')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('inventory.unit')"><el-input v-model="ingForm.unit" /></el-form-item>
        <el-form-item v-if="!ingForm.id" :label="t('inventory.stock')">
          <el-input-number v-model="ingForm.stockQty" :min="0" :step="0.1" />
        </el-form-item>
        <el-form-item v-if="!ingForm.id" :label="t('inventory.lastCost')">
          <el-input
            :model-value="ingForm.lastCostText"
            @update:model-value="(v: string) => (ingForm.lastCostText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ingDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveIng">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="buyDialog" :title="t('inventory.addPurchase')" width="640px">
      <el-form label-width="90px">
        <el-form-item :label="t('inventory.supplier')" required>
          <el-select
            v-model="buyForm.supplierId"
            filterable
            style="width: 100%"
            :placeholder="t('inventory.selectSupplier')"
          >
            <el-option
              v-for="s in activeSuppliers"
              :key="s.id"
              :label="nameOf(s)"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('inventory.note')"><el-input v-model="buyForm.note" /></el-form-item>
      </el-form>
      <el-table :data="buyForm.lines" border size="small">
        <el-table-column :label="t('inventory.name')" min-width="140">
          <template #default="{ row }">
            <el-select v-model="row.ingredientId" style="width: 100%">
              <el-option
                v-for="ing in ingredients"
                :key="ing.id"
                :label="nameOf(ing)"
                :value="ing.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :label="t('inventory.qty')" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.qty" :min="0.001" :step="0.1" size="small" />
          </template>
        </el-table-column>
        <el-table-column :label="t('inventory.unitPrice')" width="140">
          <template #default="{ row }">
            <el-input
              size="small"
              :model-value="row.unitPriceText"
              @update:model-value="(v: string) => (row.unitPriceText = formatThousands(parseThousands(v)))"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-button style="margin-top: 8px" @click="addBuyLine">{{ t('inventory.addLine') }}</el-button>
      <template #footer>
        <el-button @click="buyDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveBuy">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.toolbar h3 { margin: 0; }
.actions { display: flex; gap: 8px; align-items: center; }
.subbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
</style>
