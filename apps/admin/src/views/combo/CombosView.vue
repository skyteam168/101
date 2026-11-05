<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  createComboApi,
  deleteComboApi,
  getComboApi,
  listCombosApi,
  toggleComboStatusApi,
  updateComboApi,
  type Combo,
  type ComboGroup,
  type ComboGroupItem,
} from '../../api/combo';
import { listDishesApi, type Dish } from '../../api/menu';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');

const loading = ref(false);
const combos = ref<Combo[]>([]);
const allDishes = ref<Dish[]>([]);

// ─── 对话框 ───
const dialog = ref(false);
const saving = ref(false);

const form = reactive({
  id: '',
  nameZh: '',
  nameVi: '',
  priceText: '',
  takeawayPriceText: '',
  status: 'on' as 'on' | 'off',
  isGroupMeal: false,
  servingSize: null as number | null,
  groups: [] as {
    id?: string;
    nameZh: string;
    nameVi: string;
    minSelect: number;
    maxSelect: number;
    sort: number;
    items: {
      id?: string;
      dishId: string;
      extraPrice: number;
      extraPriceText: string;
      isDefault: boolean;
      sort: number;
    }[];
  }[],
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc());
}

async function refresh() {
  loading.value = true;
  try {
    combos.value = await listCombosApi();
  } finally {
    loading.value = false;
  }
}

async function ensureDishes() {
  if (!allDishes.value.length) {
    allDishes.value = await listDishesApi({ status: 'on' });
  }
}

function dishName(dishId: string) {
  const d = allDishes.value.find((x) => x.id === dishId);
  return d ? nameOf(d) : dishId;
}

// ─── 新建 ───
async function openCreate() {
  await ensureDishes();
  form.id = '';
  form.nameZh = '';
  form.nameVi = '';
  form.priceText = '';
  form.takeawayPriceText = '';
  form.status = 'on';
  form.isGroupMeal = false;
  form.servingSize = null;
  form.groups = [];
  dialog.value = true;
}

// ─── 编辑 ───
async function openEdit(row: Combo) {
  await ensureDishes();
  const detail = await getComboApi(row.id);
  form.id = detail.id;
  form.nameZh = detail.nameZh;
  form.nameVi = detail.nameVi;
  form.priceText = formatThousands(detail.price);
  form.takeawayPriceText = formatThousands(detail.takeawayPrice);
  form.status = detail.status;
  form.isGroupMeal = !!detail.isGroupMeal;
  form.servingSize = detail.servingSize ?? null;
  form.groups = (detail.groups || []).map((g: ComboGroup) => ({
    id: g.id,
    nameZh: g.nameZh,
    nameVi: g.nameVi,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sort: g.sort,
    items: (g.items || []).map((item: ComboGroupItem) => ({
      id: item.id,
      dishId: item.dishId,
      extraPrice: item.extraPrice,
      extraPriceText: formatThousands(item.extraPrice),
      isDefault: item.isDefault,
      sort: item.sort,
    })),
  }));
  dialog.value = true;
}

// ─── 分组操作 ───
function addGroup() {
  form.groups.push({
    nameZh: '',
    nameVi: '',
    minSelect: 1,
    maxSelect: 1,
    sort: form.groups.length + 1,
    items: [],
  });
}

function removeGroup(idx: number) {
  form.groups.splice(idx, 1);
}

function addGroupItem(gIdx: number) {
  form.groups[gIdx].items.push({
    dishId: '',
    extraPrice: 0,
    extraPriceText: '0',
    isDefault: false,
    sort: form.groups[gIdx].items.length + 1,
  });
}

function removeGroupItem(gIdx: number, iIdx: number) {
  form.groups[gIdx].items.splice(iIdx, 1);
}

// ─── 保存 ───
async function save() {
  if (!form.nameZh) {
    ElMessage.warning(t('combo.nameRequired'));
    return;
  }
  // 剔除空分组；有内容的分组必须填名与菜品
  const cleanedGroups = form.groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !!it.dishId),
    }))
    .filter((g) => g.nameZh.trim() || g.nameVi.trim() || g.items.length);
  for (const g of cleanedGroups) {
    if (!g.nameZh.trim() || !g.nameVi.trim()) {
      ElMessage.warning(t('combo.groupNameRequired'));
      return;
    }
    if (!g.items.length) {
      ElMessage.warning(t('combo.groupItemsRequired'));
      return;
    }
  }
  form.groups = cleanedGroups;
  saving.value = true;
  try {
    const payload = {
      nameZh: form.nameZh,
      nameVi: form.nameVi,
      price: parseThousands(form.priceText),
      takeawayPrice: parseThousands(form.takeawayPriceText),
      status: form.status,
      isGroupMeal: form.isGroupMeal,
      servingSize: form.isGroupMeal ? form.servingSize : null,
      groups: cleanedGroups.map((g, gi) => ({
        ...(g.id ? { id: g.id } : {}),
        nameZh: g.nameZh.trim(),
        nameVi: g.nameVi.trim(),
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        sort: g.sort || gi + 1,
        items: g.items.map((item, ii) => ({
          ...(item.id ? { id: item.id } : {}),
          dishId: item.dishId,
          extraPrice: parseThousands(item.extraPriceText),
          isDefault: item.isDefault,
          sort: item.sort || ii + 1,
        })),
      })),
    };
    if (form.id) {
      await updateComboApi(form.id, payload);
    } else {
      await createComboApi(payload);
    }
    ElMessage.success(t('common.saved'));
    dialog.value = false;
    await refresh();
  } finally {
    saving.value = false;
  }
}

// ─── 上/下架 ───
async function toggleStatus(row: Combo) {
  await toggleComboStatusApi(row.id, row.status === 'on' ? 'off' : 'on');
  ElMessage.success(t('common.saved'));
  await refresh();
}

// ─── 删除 ───
async function remove(row: Combo) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteComboApi(row.id);
  ElMessage.success(t('common.saved'));
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <div>
        <h3>{{ t('combo.title') }}</h3>
        <p class="sub">{{ t('combo.subtitle') }}</p>
      </div>
      <el-button v-perm="'combo:edit'" type="primary" @click="openCreate">
        + {{ t('combo.add') }}
      </el-button>
    </div>

    <el-table :data="combos" border>
      <el-table-column :label="t('combo.name')" min-width="160">
        <template #default="{ row }">{{ nameOf(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('combo.price')" width="130">
        <template #default="{ row }">{{ formatVND(row.price) }}</template>
      </el-table-column>
      <el-table-column :label="t('combo.takeawayPrice')" width="130">
        <template #default="{ row }">{{ formatVND(row.takeawayPrice) }}</template>
      </el-table-column>
      <el-table-column :label="t('combo.groups')" width="80">
        <template #default="{ row }">{{ (row.groups || []).length }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.status === 'on'"
            v-perm="'combo:edit'"
            @change="toggleStatus(row)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" v-perm="'combo:view'" @click="openEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button link type="danger" v-perm="'combo:edit'" @click="remove(row)">
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialog"
      :title="form.id ? t('combo.edit') : t('combo.add')"
      width="720px"
      top="5vh"
    >
      <el-form label-width="100px">
        <!-- 基本信息 -->
        <el-form-item :label="t('common.nameZh')">
          <el-input v-model="form.nameZh" :placeholder="t('common.nameZh')" />
        </el-form-item>
        <el-form-item :label="t('common.nameVi')">
          <el-input v-model="form.nameVi" :placeholder="t('common.nameVi')" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item :label="t('combo.price')">
              <el-input
                :model-value="form.priceText"
                @update:model-value="(v: string) => (form.priceText = formatThousands(parseThousands(v)))"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('combo.takeawayPrice')">
              <el-input
                :model-value="form.takeawayPriceText"
                @update:model-value="(v: string) => (form.takeawayPriceText = formatThousands(parseThousands(v)))"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('common.status')">
          <el-switch
            v-model="form.status"
            active-value="on"
            inactive-value="off"
            :active-text="t('menuMgmt.on')"
            :inactive-text="t('menuMgmt.off')"
          />
        </el-form-item>
        <el-form-item :label="t('combo.isGroupMeal')">
          <el-switch v-model="form.isGroupMeal" />
        </el-form-item>
        <el-form-item v-if="form.isGroupMeal" :label="t('combo.servingSize')">
          <el-input-number v-model="form.servingSize" :min="1" :max="200" />
        </el-form-item>

        <!-- 分组 -->
        <el-divider content-position="left">{{ t('combo.groups') }}</el-divider>
        <div v-for="(grp, gi) in form.groups" :key="gi" class="group-card">
          <div class="group-header">
            <strong>{{ t('combo.group') }} {{ gi + 1 }}</strong>
            <el-button link type="danger" @click="removeGroup(gi)">{{ t('common.delete') }}</el-button>
          </div>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item :label="t('common.nameZh')" label-width="80px">
                <el-input v-model="grp.nameZh" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('common.nameVi')" label-width="80px">
                <el-input v-model="grp.nameVi" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item :label="t('combo.groupMin')" label-width="80px">
                <el-input-number v-model="grp.minSelect" :min="0" :max="grp.maxSelect" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('combo.groupMax')" label-width="80px">
                <el-input-number v-model="grp.maxSelect" :min="1" />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 分组菜品 -->
          <div class="item-list">
            <div v-for="(item, ii) in grp.items" :key="ii" class="item-row">
              <el-select
                v-model="item.dishId"
                filterable
                :placeholder="t('combo.selectDish')"
                style="flex: 1"
              >
                <el-option
                  v-for="d in allDishes"
                  :key="d.id"
                  :label="nameOf(d)"
                  :value="d.id"
                />
              </el-select>
              <el-input
                style="width: 110px"
                :model-value="item.extraPriceText"
                :placeholder="t('combo.extraPrice')"
                @update:model-value="(v: string) => (item.extraPriceText = formatThousands(parseThousands(v)))"
              />
              <el-checkbox v-model="item.isDefault">{{ t('combo.default') }}</el-checkbox>
              <el-button link type="danger" @click="removeGroupItem(gi, ii)">
                {{ t('common.delete') }}
              </el-button>
            </div>
          </div>
          <el-button size="small" @click="addGroupItem(gi)">+ {{ t('combo.addDish') }}</el-button>
        </div>

        <el-button type="dashed" style="width: 100%; margin-top: 8px" @click="addGroup">
          + {{ t('combo.addGroup') }}
        </el-button>
      </el-form>

      <template #footer>
        <el-button @click="dialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.head h3 { margin: 0; }
.sub { margin: 4px 0 0; color: #888; font-size: 13px; }
.group-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: #fafafa;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.item-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.item-row { display: flex; gap: 8px; align-items: center; }
</style>
