<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  assetReportApi,
  createAssetApi,
  createAssetCategoryApi,
  deleteAssetCategoryApi,
  exportAssetsApi,
  importAssetsApi,
  listAssetCategoriesApi,
  listAssetsApi,
  printAssetLabelsApi,
  updateAssetCategoryApi,
  type Asset,
  type AssetCategory,
  type AssetReport,
} from '../../api/asset';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const router = useRouter();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const tab = ref('ledger');
const loading = ref(false);
const categories = ref<AssetCategory[]>([]);
const assets = ref<Asset[]>([]);
const report = ref<AssetReport | null>(null);
const selectedIds = ref<string[]>([]);

const filters = reactive({
  categoryId: '',
  location: '',
  status: '',
  keyword: '',
});

const catDialog = ref(false);
const catForm = reactive({ id: '', nameZh: '', nameVi: '', depreciationMonths: 36 });

const createDialog = ref(false);
const createForm = reactive({
  categoryId: '',
  nameZh: '',
  nameVi: '',
  spec: '',
  unit: '个',
  location: '',
  supplier: '',
  purchaseDate: '',
  unitPriceText: '',
  qty: 1,
  warrantyMonths: 12,
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

async function loadCategories() {
  categories.value = await listAssetCategoriesApi();
}

async function loadAssets() {
  loading.value = true;
  try {
    assets.value = await listAssetsApi({
      categoryId: filters.categoryId || undefined,
      location: filters.location || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
    });
  } finally {
    loading.value = false;
  }
}

async function loadReport() {
  report.value = await assetReportApi();
}

async function refresh() {
  await loadCategories();
  await loadAssets();
  if (tab.value === 'report') await loadReport();
}

onMounted(refresh);

function openCat(row?: AssetCategory) {
  catForm.id = row?.id || '';
  catForm.nameZh = row?.nameZh || '';
  catForm.nameVi = row?.nameVi || '';
  catForm.depreciationMonths = row?.depreciationMonths ?? 36;
  catDialog.value = true;
}

async function saveCat() {
  const payload = {
    nameZh: catForm.nameZh,
    nameVi: catForm.nameVi,
    depreciationMonths: catForm.depreciationMonths,
  };
  if (catForm.id) await updateAssetCategoryApi(catForm.id, payload);
  else await createAssetCategoryApi(payload);
  ElMessage.success(t('common.saved'));
  catDialog.value = false;
  await loadCategories();
}

async function removeCat(row: AssetCategory) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteAssetCategoryApi(row.id);
  ElMessage.success(t('common.saved'));
  await loadCategories();
}

function openCreate() {
  Object.assign(createForm, {
    categoryId: categories.value[0]?.id || '',
    nameZh: '',
    nameVi: '',
    spec: '',
    unit: '个',
    location: '',
    supplier: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    unitPriceText: '',
    qty: 1,
    warrantyMonths: 12,
  });
  createDialog.value = true;
}

async function saveCreate() {
  await createAssetApi({
    categoryId: createForm.categoryId,
    nameZh: createForm.nameZh,
    nameVi: createForm.nameVi,
    spec: createForm.spec || undefined,
    unit: createForm.unit,
    location: createForm.location || undefined,
    supplier: createForm.supplier || undefined,
    purchaseDate: createForm.purchaseDate || undefined,
    unitPrice: parseThousands(createForm.unitPriceText),
    qty: createForm.qty,
    warrantyMonths: createForm.warrantyMonths || undefined,
  });
  ElMessage.success(t('common.saved'));
  createDialog.value = false;
  await loadAssets();
}

async function onImport(file: File) {
  const res = await importAssetsApi(file);
  ElMessage.success(t('assets.importDone', { n: res.created }));
  if (res.errors?.length) ElMessage.warning(res.errors.slice(0, 3).join('; '));
  await loadAssets();
  return false;
}

async function doExport() {
  await exportAssetsApi();
}

async function doLabels() {
  if (!selectedIds.value.length) {
    ElMessage.warning(t('assets.selectFirst'));
    return;
  }
  await printAssetLabelsApi(selectedIds.value);
}

function onTab(name: string | number) {
  if (name === 'report') loadReport();
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('assets.title') }}</h3>
      <div class="actions">
        <el-button @click="openCat()">{{ t('assets.addCategory') }}</el-button>
        <el-button type="primary" @click="openCreate">{{ t('assets.create') }}</el-button>
        <el-button @click="doExport">{{ t('assets.export') }}</el-button>
        <el-upload :show-file-list="false" accept=".xlsx,.xls" :before-upload="onImport">
          <el-button>{{ t('assets.import') }}</el-button>
        </el-upload>
        <el-button @click="doLabels">{{ t('assets.printLabels') }}</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="onTab">
      <el-tab-pane :label="t('assets.ledger')" name="ledger">
        <el-form :inline="true" class="filters" @submit.prevent="loadAssets">
          <el-form-item :label="t('assets.category')">
            <el-select v-model="filters.categoryId" clearable style="width: 160px">
              <el-option v-for="c in categories" :key="c.id" :label="nameOf(c)" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('assets.location')">
            <el-input v-model="filters.location" clearable style="width: 140px" />
          </el-form-item>
          <el-form-item :label="t('assets.status')">
            <el-select v-model="filters.status" clearable style="width: 120px">
              <el-option :label="t('assets.statusInUse')" value="in_use" />
              <el-option :label="t('assets.statusIdle')" value="idle" />
              <el-option :label="t('assets.statusRepair')" value="repair" />
              <el-option :label="t('assets.statusDisposed')" value="disposed" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="filters.keyword"
              :placeholder="t('assets.keyword')"
              clearable
              style="width: 180px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="loadAssets">{{ t('common.search') }}</el-button>
          </el-form-item>
        </el-form>

        <el-table
          :data="assets"
          border
          @selection-change="(rows: Asset[]) => (selectedIds = rows.map((r) => r.id))"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="assetNo" :label="t('assets.assetNo')" width="150" />
          <el-table-column :label="t('assets.name')" min-width="120">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('assets.category')" width="110">
            <template #default="{ row }">{{ row.category ? nameOf(row.category) : '-' }}</template>
          </el-table-column>
          <el-table-column prop="location" :label="t('assets.location')" width="100" />
          <el-table-column prop="qtyTotal" :label="t('assets.qtyTotal')" width="70" />
          <el-table-column prop="qtyInUse" :label="t('assets.qtyInUse')" width="70" />
          <el-table-column prop="qtyIdle" :label="t('assets.qtyIdle')" width="70" />
          <el-table-column prop="qtyRepair" :label="t('assets.qtyRepair')" width="80" />
          <el-table-column prop="qtyDisposed" :label="t('assets.qtyDisposed')" width="80" />
          <el-table-column :label="t('assets.originalValue')" width="120">
            <template #default="{ row }">{{ formatVND(row.originalValue) }}</template>
          </el-table-column>
          <el-table-column :label="t('assets.netValue')" width="120">
            <template #default="{ row }">{{ formatVND(row.netValue) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/assets/${row.id}`)">
                {{ t('common.detail') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('assets.categories')" name="categories">
        <el-table :data="categories" border>
          <el-table-column :label="t('assets.name')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="depreciationMonths" :label="t('assets.depreciationMonths')" width="120" />
          <el-table-column prop="assetCount" :label="t('assets.assetCount')" width="100" />
          <el-table-column :label="t('common.actions')" width="160">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCat(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removeCat(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('assets.report')" name="report">
        <template v-if="report">
          <el-row :gutter="12" class="cards">
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.assetCount') }}</div>
                <div class="stat-value">{{ report.summary.assetCount }}</div>
              </div>
            </el-col>
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.originalValue') }}</div>
                <div class="stat-value">{{ formatVND(report.summary.originalValue) }}</div>
              </div>
            </el-col>
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.netValue') }}</div>
                <div class="stat-value">{{ formatVND(report.summary.netValue) }}</div>
              </div>
            </el-col>
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.repairCostMonth') }}</div>
                <div class="stat-value">{{ formatVND(report.summary.repairCostMonth) }}</div>
              </div>
            </el-col>
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.scrapLossMonth') }}</div>
                <div class="stat-value">{{ formatVND(report.summary.scrapLossMonth) }}</div>
              </div>
            </el-col>
            <el-col :span="4">
              <div class="stat">
                <div class="stat-title">{{ t('assets.sellIncomeMonth') }}</div>
                <div class="stat-value">{{ formatVND(report.summary.sellIncomeMonth) }}</div>
              </div>
            </el-col>
          </el-row>

          <h4>{{ t('assets.byCategory') }}</h4>
          <el-table :data="report.byCategory" border>
            <el-table-column :label="t('assets.category')" min-width="120">
              <template #default="{ row }">{{ nameOf(row) }}</template>
            </el-table-column>
            <el-table-column prop="qtyTotal" :label="t('assets.qtyTotal')" width="90" />
            <el-table-column prop="qtyActive" :label="t('assets.qtyActive')" width="90" />
            <el-table-column :label="t('assets.originalValue')" width="140">
              <template #default="{ row }">{{ formatVND(row.originalValue) }}</template>
            </el-table-column>
            <el-table-column :label="t('assets.netValue')" width="140">
              <template #default="{ row }">{{ formatVND(row.netValue) }}</template>
            </el-table-column>
          </el-table>

          <h4>{{ t('assets.warrantyExpiring') }}</h4>
          <el-table :data="report.warrantyExpiring" border>
            <el-table-column prop="assetNo" :label="t('assets.assetNo')" width="150" />
            <el-table-column :label="t('assets.name')" min-width="120">
              <template #default="{ row }">{{ nameOf(row) }}</template>
            </el-table-column>
            <el-table-column prop="warrantyUntil" :label="t('assets.warrantyUntil')" width="130" />
          </el-table>
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="catDialog" :title="t('assets.category')" width="440px">
      <el-form label-width="110px">
        <el-form-item :label="t('common.nameZh')">
          <el-input v-model="catForm.nameZh" />
        </el-form-item>
        <el-form-item :label="t('common.nameVi')">
          <el-input v-model="catForm.nameVi" />
        </el-form-item>
        <el-form-item :label="t('assets.depreciationMonths')">
          <el-input-number v-model="catForm.depreciationMonths" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveCat">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createDialog" :title="t('assets.create')" width="520px">
      <el-form label-width="110px">
        <el-form-item :label="t('assets.category')">
          <el-select v-model="createForm.categoryId" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="nameOf(c)" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.nameZh')">
          <el-input v-model="createForm.nameZh" />
        </el-form-item>
        <el-form-item :label="t('common.nameVi')">
          <el-input v-model="createForm.nameVi" />
        </el-form-item>
        <el-form-item :label="t('assets.spec')">
          <el-input v-model="createForm.spec" />
        </el-form-item>
        <el-form-item :label="t('assets.unit')">
          <el-input v-model="createForm.unit" />
        </el-form-item>
        <el-form-item :label="t('assets.location')">
          <el-input v-model="createForm.location" />
        </el-form-item>
        <el-form-item :label="t('assets.supplier')">
          <el-input v-model="createForm.supplier" />
        </el-form-item>
        <el-form-item :label="t('assets.purchaseDate')">
          <el-date-picker v-model="createForm.purchaseDate" value-format="YYYY-MM-DD" type="date" />
        </el-form-item>
        <el-form-item :label="t('assets.unitPrice')">
          <el-input
            :model-value="createForm.unitPriceText"
            @update:model-value="(v: string) => (createForm.unitPriceText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('assets.qty')">
          <el-input-number v-model="createForm.qty" :min="0" />
        </el-form-item>
        <el-form-item :label="t('assets.warrantyMonths')">
          <el-input-number v-model="createForm.warrantyMonths" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveCreate">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
.toolbar h3 { margin: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.filters { margin-bottom: 8px; }
.cards { margin-bottom: 16px; }
.stat { background: #f5f7fa; border-radius: 8px; padding: 12px; }
.stat-title { font-size: 12px; color: #909399; margin-bottom: 6px; }
.stat-value { font-size: 16px; font-weight: 600; word-break: break-all; }
h4 { margin: 16px 0 8px; }
</style>
