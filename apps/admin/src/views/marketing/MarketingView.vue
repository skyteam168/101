<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  couponAnalyticsApi,
  createRuleApi,
  createTemplateApi,
  deleteRuleApi,
  deleteTemplateApi,
  listCouponsApi,
  listRulesApi,
  listTemplatesApi,
  updateRuleApi,
  updateTemplateApi,
  type CouponAnalytics,
  type CouponTemplate,
  type IssuedCoupon,
  type PromoRule,
} from '../../api/marketing';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');
const tab = ref('coupons');
const loading = ref(false);
const templates = ref<CouponTemplate[]>([]);
const rules = ref<PromoRule[]>([]);
const analytics = ref<CouponAnalytics | null>(null);
const issued = ref<IssuedCoupon[]>([]);
const analyticsDays = ref(30);
const issueFilter = reactive({
  templateId: '' as string,
  status: '' as '' | 'unused' | 'used' | 'expired',
});

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

function statusLabel(status: string) {
  return t(`marketing.status_${status}`);
}

const summaryCards = computed(() => {
  const s = analytics.value?.summary;
  if (!s) return [];
  return [
    { key: 'issued', label: t('marketing.statIssued'), value: String(s.issued) },
    { key: 'used', label: t('marketing.statUsed'), value: String(s.used) },
    { key: 'unused', label: t('marketing.statUnused'), value: String(s.unused) },
    { key: 'expired', label: t('marketing.statExpired'), value: String(s.expired) },
    { key: 'useRate', label: t('marketing.statUseRate'), value: `${s.useRate}%` },
    { key: 'claimers', label: t('marketing.statClaimers'), value: String(s.uniqueClaimers) },
  ];
});

const dailyMax = computed(() => {
  const rows = analytics.value?.daily || [];
  return Math.max(1, ...rows.map((d) => Math.max(d.claimed, d.used)));
});

async function refresh() {
  loading.value = true;
  try {
    if (tab.value === 'coupons') {
      templates.value = await listTemplatesApi();
    } else if (tab.value === 'rules') {
      rules.value = await listRulesApi();
    } else {
      await loadAnalytics();
    }
  } finally {
    loading.value = false;
  }
}

async function loadAnalytics() {
  const [a, list] = await Promise.all([
    couponAnalyticsApi(analyticsDays.value),
    listCouponsApi({
      templateId: issueFilter.templateId || undefined,
      status: issueFilter.status || undefined,
    }),
  ]);
  analytics.value = a;
  issued.value = list;
  if (!templates.value.length) {
    templates.value = await listTemplatesApi();
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

async function removeCoupon(row: CouponTemplate) {
  await ElMessageBox.confirm(t('marketing.deleteCouponConfirm'), { type: 'warning' });
  await deleteTemplateApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

async function removeRule(row: PromoRule) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteRuleApi(row.id);
  ElMessage.success(t('common.deleted'));
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
        <el-button v-perm="'marketing:edit'" type="primary" style="margin-bottom: 10px" @click="openCoupon()">
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
          <el-table-column :label="t('marketing.statIssued')" width="80">
            <template #default="{ row }">{{ row.stats?.issued ?? 0 }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.statUsed')" width="80">
            <template #default="{ row }">{{ row.stats?.used ?? 0 }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.statUseRate')" width="90">
            <template #default="{ row }">{{ row.stats?.useRate ?? 0 }}%</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="100">
            <template #default="{ row }">
              <el-switch
                v-perm="'marketing:edit'"
                :model-value="row.isActive"
                @change="toggleActive(row, 'coupon')"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button v-perm="'marketing:edit'" link type="primary" @click="openCoupon(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-button v-perm="'marketing:edit'" link type="danger" @click="removeCoupon(row)">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('marketing.analytics')" name="analytics">
        <div class="analytics-toolbar">
          <el-radio-group v-model="analyticsDays" @change="loadAnalytics">
            <el-radio-button :value="7">7{{ t('marketing.days') }}</el-radio-button>
            <el-radio-button :value="30">30{{ t('marketing.days') }}</el-radio-button>
            <el-radio-button :value="90">90{{ t('marketing.days') }}</el-radio-button>
          </el-radio-group>
          <el-button @click="loadAnalytics">{{ t('common.refresh') }}</el-button>
        </div>

        <el-row :gutter="12" class="cards">
          <el-col v-for="c in summaryCards" :key="c.key" :xs="12" :sm="8" :md="4">
            <el-card shadow="never" class="stat-card">
              <div class="stat-label">{{ c.label }}</div>
              <div class="stat-value">{{ c.value }}</div>
            </el-card>
          </el-col>
        </el-row>

        <h4 class="section-title">{{ t('marketing.byTemplate') }}</h4>
        <el-table :data="analytics?.byTemplate || []" border size="small">
          <el-table-column :label="t('marketing.couponName')" min-width="140">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="issued" :label="t('marketing.statIssued')" width="90" />
          <el-table-column prop="unused" :label="t('marketing.statUnused')" width="90" />
          <el-table-column prop="used" :label="t('marketing.statUsed')" width="90" />
          <el-table-column prop="expired" :label="t('marketing.statExpired')" width="90" />
          <el-table-column :label="t('marketing.statUseRate')" width="100">
            <template #default="{ row }">{{ row.useRate }}%</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">
              <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
                {{ row.isActive ? t('menuMgmt.on') : t('menuMgmt.off') }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <h4 class="section-title">{{ t('marketing.dailyTrend') }}</h4>
        <div class="daily-bars">
          <div v-for="d in analytics?.daily || []" :key="d.date" class="daily-col" :title="d.date">
            <div class="bars">
              <div
                class="bar claimed"
                :style="{ height: `${(d.claimed / dailyMax) * 100}%` }"
              />
              <div class="bar used" :style="{ height: `${(d.used / dailyMax) * 100}%` }" />
            </div>
            <div class="daily-label">{{ d.date.slice(5) }}</div>
          </div>
        </div>
        <div class="legend">
          <span><i class="dot claimed" />{{ t('marketing.statIssued') }}</span>
          <span><i class="dot used" />{{ t('marketing.statUsed') }}</span>
        </div>

        <h4 class="section-title">{{ t('marketing.issuedList') }}</h4>
        <div class="filters">
          <el-select
            v-model="issueFilter.templateId"
            clearable
            :placeholder="t('marketing.coupon')"
            style="width: 200px"
            @change="loadAnalytics"
          >
            <el-option
              v-for="tpl in templates"
              :key="tpl.id"
              :label="nameOf(tpl)"
              :value="tpl.id"
            />
          </el-select>
          <el-select
            v-model="issueFilter.status"
            clearable
            :placeholder="t('common.status')"
            style="width: 140px"
            @change="loadAnalytics"
          >
            <el-option :label="t('marketing.status_unused')" value="unused" />
            <el-option :label="t('marketing.status_used')" value="used" />
            <el-option :label="t('marketing.status_expired')" value="expired" />
          </el-select>
        </div>
        <el-table :data="issued" border size="small" max-height="420">
          <el-table-column :label="t('marketing.couponName')" min-width="120">
            <template #default="{ row }">{{ nameOf(row.template) }}</template>
          </el-table-column>
          <el-table-column prop="code" :label="t('marketing.code')" width="140" />
          <el-table-column :label="t('marketing.customer')" min-width="120">
            <template #default="{ row }">
              {{ row.customerName || row.customerPhone || row.customerEmail || row.customerId }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="100">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.status === 'used' ? 'success' : row.status === 'expired' ? 'info' : 'warning'"
              >
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('marketing.claimedAt')" width="170">
            <template #default="{ row }">{{ row.createdAt.replace('T', ' ').slice(0, 19) }}</template>
          </el-table-column>
          <el-table-column :label="t('marketing.expiresAt')" width="170">
            <template #default="{ row }">{{ row.expiresAt.replace('T', ' ').slice(0, 19) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('marketing.rules')" name="rules">
        <el-button v-perm="'marketing:edit'" type="primary" style="margin-bottom: 10px" @click="openRule()">
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
              <el-switch
                v-perm="'marketing:edit'"
                :model-value="row.isActive"
                @change="toggleActive(row, 'rule')"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button v-perm="'marketing:edit'" link type="primary" @click="openRule(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-button v-perm="'marketing:edit'" link type="danger" @click="removeRule(row)">
                {{ t('common.delete') }}
              </el-button>
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
.analytics-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.cards { margin-bottom: 8px; }
.stat-card { margin-bottom: 12px; }
.stat-label { color: #888; font-size: 12px; }
.stat-value { margin-top: 6px; font-size: 22px; font-weight: 700; color: #303133; }
.section-title { margin: 18px 0 10px; font-size: 14px; }
.filters { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.daily-bars {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  height: 140px;
  overflow-x: auto;
  padding: 8px 0 0;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}
.daily-col {
  flex: 0 0 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.bars {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  min-height: 100px;
}
.bar {
  width: 7px;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
}
.bar.claimed { background: #ff9f43; }
.bar.used { background: #67c23a; }
.daily-label {
  font-size: 10px;
  color: #909399;
  transform: scale(0.9);
  white-space: nowrap;
}
.legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  color: #606266;
  font-size: 12px;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.dot.claimed { background: #ff9f43; }
.dot.used { background: #67c23a; }
</style>
