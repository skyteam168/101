<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  createRuleApi,
  createTemplateApi,
  listRulesApi,
  listTemplatesApi,
  updateRuleApi,
  updateTemplateApi,
  type CouponTemplate,
  type PromoRule,
} from '../../api/marketing';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');
const tab = ref('coupons');
const loading = ref(false);
const templates = ref<CouponTemplate[]>([]);
const rules = ref<PromoRule[]>([]);

const dialog = ref(false);
const form = reactive({
  id: '',
  kind: 'coupon' as 'coupon' | 'rule',
  nameZh: '',
  nameVi: '',
  type: 'percent' as 'amount' | 'percent',
  valueText: '',
  minSpendText: '',
  validDays: 30,
  stackable: false,
  scope: 'order' as 'order' | 'dish',
  channel: 'all' as 'all' | 'delivery' | 'dine_in',
  isActive: true,
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc());
}

function benefit(row: { type: string; value: number }) {
  return row.type === 'percent' ? `${100 - row.value}折 / -${row.value}%` : formatVND(row.value);
}

async function refresh() {
  loading.value = true;
  try {
    if (tab.value === 'coupons') templates.value = await listTemplatesApi();
    else rules.value = await listRulesApi();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function openCoupon(row?: CouponTemplate) {
  form.kind = 'coupon';
  form.id = row?.id || '';
  form.nameZh = row?.nameZh || '';
  form.nameVi = row?.nameVi || '';
  form.type = row?.type || 'percent';
  form.valueText = row ? formatThousands(row.value) : '';
  form.minSpendText = row ? formatThousands(row.minSpend) : '';
  form.validDays = row?.validDays || 30;
  form.stackable = row?.stackable ?? false;
  form.scope = row?.scope || 'order';
  form.channel = row?.channel || 'all';
  form.isActive = row?.isActive ?? true;
  dialog.value = true;
}

function openRule(row?: PromoRule) {
  form.kind = 'rule';
  form.id = row?.id || '';
  form.nameZh = row?.nameZh || '';
  form.nameVi = row?.nameVi || '';
  form.type = row?.type || 'amount';
  form.valueText = row ? formatThousands(row.value) : '';
  form.minSpendText = row ? formatThousands(row.minSpend) : '';
  form.scope = row?.scope || 'order';
  form.channel = row?.channel || 'all';
  form.isActive = row?.isActive ?? true;
  dialog.value = true;
}

async function save() {
  const payload = {
    nameZh: form.nameZh,
    nameVi: form.nameVi,
    type: form.type,
    value: parseThousands(form.valueText),
    minSpend: parseThousands(form.minSpendText),
    scope: form.scope,
    channel: form.channel,
  };
  if (form.kind === 'coupon') {
    const data = { ...payload, validDays: form.validDays, stackable: form.stackable };
    if (form.id) await updateTemplateApi(form.id, { ...data, isActive: form.isActive });
    else await createTemplateApi(data);
  } else {
    if (form.id) await updateRuleApi(form.id, { ...payload, isActive: form.isActive });
    else await createRuleApi(payload);
  }
  ElMessage.success(t('common.saved'));
  dialog.value = false;
  await refresh();
}

async function toggleActive(row: CouponTemplate | PromoRule, kind: 'coupon' | 'rule') {
  if (kind === 'coupon') await updateTemplateApi(row.id, { isActive: !row.isActive });
  else await updateRuleApi(row.id, { isActive: !row.isActive });
  ElMessage.success(t('common.saved'));
  await refresh();
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <div>
        <h3>{{ t('marketing.title') }}</h3>
        <p class="sub">{{ t('marketing.subtitle') }}</p>
      </div>
    </div>
    <el-tabs v-model="tab" @tab-change="refresh">
      <el-tab-pane :label="t('marketing.coupons')" name="coupons">
        <el-button type="primary" style="margin-bottom: 10px" @click="openCoupon()">
          {{ t('marketing.addCoupon') }}
        </el-button>
        <el-table :data="templates" border>
          <el-table-column :label="t('marketing.couponName')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.type')" width="100">
            <template #default="{ row }">
              {{ row.type === 'percent' ? t('marketing.percentCoupon') : t('marketing.amountCoupon') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('marketing.benefit')" width="140">
            <template #default="{ row }">{{ benefit(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.minSpend')" width="120">
            <template #default="{ row }">{{ formatVND(row.minSpend) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.validDays')" width="90">
            <template #default="{ row }">{{ row.validDays }}{{ t('marketing.days') }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.stackable')" width="80">
            <template #default="{ row }">{{ row.stackable ? t('common.yes') : t('common.no') }}</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="100">
            <template #default="{ row }">
              <el-switch :model-value="row.isActive" @change="toggleActive(row, 'coupon')" />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="100">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCoupon(row)">{{ t('common.edit') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane :label="t('marketing.rules')" name="rules">
        <el-button type="primary" style="margin-bottom: 10px" @click="openRule()">
          {{ t('marketing.addRule') }}
        </el-button>
        <el-table :data="rules" border>
          <el-table-column :label="t('inventory.name')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.benefit')" width="140">
            <template #default="{ row }">{{ benefit(row) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.scope')" width="100">
            <template #default="{ row }">{{ t(`marketing.scope_${row.scope}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.minSpend')" width="120">
            <template #default="{ row }">{{ formatVND(row.minSpend) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="100">
            <template #default="{ row }">
              <el-switch :model-value="row.isActive" @change="toggleActive(row, 'rule')" />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="100">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRule(row)">{{ t('common.edit') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialog" :title="form.kind === 'coupon' ? t('marketing.coupon') : t('marketing.rule')" width="520px">
      <el-form label-width="110px">
        <el-form-item :label="t('common.nameZh')"><el-input v-model="form.nameZh" /></el-form-item>
        <el-form-item :label="t('common.nameVi')"><el-input v-model="form.nameVi" /></el-form-item>
        <el-form-item :label="t('marketing.type')">
          <el-select v-model="form.type" style="width: 100%">
            <el-option :label="t('marketing.percentCoupon')" value="percent" />
            <el-option :label="t('marketing.amountCoupon')" value="amount" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('marketing.value')">
          <el-input
            :model-value="form.valueText"
            @update:model-value="(v: string) => (form.valueText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('marketing.minSpend')">
          <el-input
            :model-value="form.minSpendText"
            @update:model-value="(v: string) => (form.minSpendText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item v-if="form.kind === 'coupon'" :label="t('marketing.validDays')">
          <el-input-number v-model="form.validDays" :min="1" />
        </el-form-item>
        <el-form-item :label="t('marketing.scope')">
          <el-select v-model="form.scope" style="width: 100%">
            <el-option :label="t('marketing.scope_order')" value="order" />
            <el-option :label="t('marketing.scope_dish')" value="dish" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('marketing.channel')">
          <el-select v-model="form.channel" style="width: 100%">
            <el-option :label="t('marketing.channel_all')" value="all" />
            <el-option :label="t('marketing.channel_delivery')" value="delivery" />
            <el-option :label="t('marketing.channel_dine_in')" value="dine_in" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.kind === 'coupon'" :label="t('marketing.stackable')">
          <el-switch v-model="form.stackable" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.head h3 { margin: 0; }
.sub { margin: 4px 0 12px; color: #888; font-size: 13px; }
</style>
