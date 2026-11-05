<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  adjustBalanceApi,
  adjustPointsApi,
  redeemBirthdayGiftApi,
  createLevelApi,
  deleteLevelApi,
  listLevelsApi,
  listMembersApi,
  setMemberStatusApi,
  softDeleteMemberApi,
  updateLevelApi,
  updateMemberApi,
  type Member,
  type MemberLevel,
} from '../../api/member';
import { issueCouponsApi, listTemplatesApi, type CouponTemplate } from '../../api/marketing';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');
const tab = ref('members');
const loading = ref(false);
const members = ref<Member[]>([]);
const levels = ref<MemberLevel[]>([]);
const keyword = ref('');
const templates = ref<CouponTemplate[]>([]);

const levelDialog = ref(false);
const levelForm = reactive({
  id: '',
  nameZh: '',
  nameVi: '',
  minPoints: 0,
  minSpend: 0,
  discountPercent: 0,
  birthdayBonusPoints: 0,
  deliveryFeeOff: 0,
  priorityReserve: false,
  priorityDelivery: false,
  birthdayGift: true,
  isActive: true,
});

const issueDialog = ref(false);
const issueForm = reactive({ memberId: '', templateId: '' });
const adjustDialog = ref(false);
const adjustForm = reactive({ id: '', kind: 'points' as 'points' | 'balance', deltaText: '', remark: '' });

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc());
}

async function refresh() {
  loading.value = true;
  try {
    levels.value = await listLevelsApi();
    if (tab.value === 'members') {
      members.value = await listMembersApi({ keyword: keyword.value || undefined });
    }
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function openLevel(row?: MemberLevel) {
  levelForm.id = row?.id || '';
  levelForm.nameZh = row?.nameZh || '';
  levelForm.nameVi = row?.nameVi || '';
  levelForm.minPoints = row?.minPoints || 0;
  levelForm.minSpend = row?.minSpend || 0;
  levelForm.discountPercent = row?.discountPercent || 0;
  levelForm.birthdayBonusPoints = row?.birthdayBonusPoints || 0;
  levelForm.deliveryFeeOff = row?.deliveryFeeOff || 0;
  levelForm.priorityReserve = !!row?.priorityReserve;
  levelForm.priorityDelivery = !!row?.priorityDelivery;
  levelForm.birthdayGift = row?.birthdayGift !== false;
  levelForm.isActive = row?.isActive ?? true;
  levelDialog.value = true;
}

async function saveLevel() {
  const payload = {
    nameZh: levelForm.nameZh,
    nameVi: levelForm.nameVi,
    minPoints: levelForm.minPoints,
    minSpend: levelForm.minSpend,
    discountPercent: levelForm.discountPercent,
    birthdayBonusPoints: levelForm.birthdayBonusPoints,
    deliveryFeeOff: levelForm.deliveryFeeOff,
    priorityReserve: levelForm.priorityReserve,
    priorityDelivery: levelForm.priorityDelivery,
    birthdayGift: levelForm.birthdayGift,
  };
  if (levelForm.id) await updateLevelApi(levelForm.id, { ...payload, isActive: levelForm.isActive });
  else await createLevelApi(payload);
  ElMessage.success(t('common.saved'));
  levelDialog.value = false;
  await refresh();
}

async function removeLevel(row: MemberLevel) {
  const others = levels.value
    .filter((l) => l.id !== row.id)
    .slice()
    .sort((a, b) => a.minSpend - b.minSpend || a.sort - b.sort);
  const fallback = others[0];
  const tip = fallback
    ? t('member.confirmDeleteLevelMigrate', { name: nameOf(row), fallback: nameOf(fallback) })
    : t('member.confirmDeleteLevelClear', { name: nameOf(row) });
  await ElMessageBox.confirm(tip, t('common.confirm'), { type: 'warning' });
  const res = await deleteLevelApi(row.id);
  if (res.migratedCount > 0) {
    ElMessage.success(
      t('member.levelDeletedMigrated', {
        n: res.migratedCount,
        fallback: res.fallbackNameZh
          ? nameOf({ nameZh: res.fallbackNameZh, nameVi: res.fallbackNameVi || res.fallbackNameZh })
          : t('member.levelCleared'),
      }),
    );
  } else {
    ElMessage.success(t('common.deleted'));
  }
  await refresh();
}

async function redeemGift(row: Member) {
  await redeemBirthdayGiftApi(row.id);
  ElMessage.success(t('common.saved'));
  await refresh();
}

async function ban(row: Member) {
  await setMemberStatusApi(row.id, row.status === 'banned' ? 'active' : 'banned');
  ElMessage.success(t('common.saved'));
  await refresh();
}

async function remove(row: Member) {
  await ElMessageBox.confirm(t('member.confirmDelete'), { type: 'warning' });
  await softDeleteMemberApi(row.id);
  ElMessage.success(t('common.saved'));
  await refresh();
}

async function openIssue(row: Member) {
  issueForm.memberId = row.id;
  templates.value = (await listTemplatesApi()).filter((x) => x.isActive);
  issueForm.templateId = templates.value[0]?.id || '';
  issueDialog.value = true;
}

async function doIssue() {
  if (!issueForm.templateId) return;
  await issueCouponsApi(issueForm.templateId, [issueForm.memberId]);
  ElMessage.success(t('member.issued'));
  issueDialog.value = false;
}

function openAdjust(row: Member, kind: 'points' | 'balance') {
  adjustForm.id = row.id;
  adjustForm.kind = kind;
  adjustForm.deltaText = '';
  adjustForm.remark = '';
  adjustDialog.value = true;
}

async function saveAdjust() {
  const delta =
    adjustForm.kind === 'balance'
      ? parseThousands(adjustForm.deltaText)
      : Number(adjustForm.deltaText.replace(/,/g, ''));
  if (!delta) return;
  if (adjustForm.kind === 'points') await adjustPointsApi(adjustForm.id, delta, adjustForm.remark);
  else await adjustBalanceApi(adjustForm.id, delta, adjustForm.remark);
  ElMessage.success(t('common.saved'));
  adjustDialog.value = false;
  await refresh();
}

async function setLevel(row: Member, levelId: string) {
  await updateMemberApi(row.id, { memberLevelId: levelId });
  ElMessage.success(t('common.saved'));
  await refresh();
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('member.title') }}</h3>
    </div>
    <el-tabs v-model="tab" @tab-change="refresh">
      <el-tab-pane :label="t('member.list')" name="members">
        <div class="subbar">
          <el-input v-model="keyword" clearable :placeholder="t('common.search')" style="width: 220px" @keyup.enter="refresh" />
          <el-button type="primary" @click="refresh">{{ t('common.search') }}</el-button>
        </div>
        <el-table :data="members" border>
          <el-table-column prop="name" :label="t('member.name')" width="120" />
          <el-table-column prop="email" label="Email" min-width="160" />
          <el-table-column :label="t('member.registerSource')" width="110">
            <template #default="{ row }">
              <el-tag
                :type="row.registerSource === 'google' ? 'warning' : 'info'"
                size="small"
              >
                {{
                  row.registerSource === 'google'
                    ? t('member.sourceGoogle')
                    : t('member.sourceEmail')
                }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" :label="t('common.phone')" width="120" />
          <el-table-column :label="t('member.level')" width="140">
            <template #default="{ row }">
              <el-select
                :model-value="row.memberLevelId"
                size="small"
                @change="(v: string) => setLevel(row, v)"
              >
                <el-option
                  v-for="lv in levels.length ? levels : []"
                  :key="lv.id"
                  :label="nameOf(lv)"
                  :value="lv.id"
                />
              </el-select>
              <span v-if="!levels.length">{{ row.memberLevel ? nameOf(row.memberLevel) : '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="points" :label="t('member.points')" width="90" />
          <el-table-column :label="t('member.balance')" width="120">
            <template #default="{ row }">{{ formatVND(row.balance) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">{{ t(`member.status.${row.status}`, row.status) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="280" fixed="right">
            <template #default="{ row }">
              <el-button link type="success" @click="redeemGift(row)">{{ t('member.redeemGift') }}</el-button>
              <el-button link type="primary" @click="openIssue(row)">{{ t('member.issueCoupon') }}</el-button>
              <el-button link @click="openAdjust(row, 'points')">{{ t('member.adjPoints') }}</el-button>
              <el-button link @click="openAdjust(row, 'balance')">{{ t('member.adjBalance') }}</el-button>
              <el-button link type="warning" @click="ban(row)">
                {{ row.status === 'banned' ? t('common.enable') : t('member.ban') }}
              </el-button>
              <el-button link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane :label="t('member.levels')" name="levels">
        <el-button type="primary" style="margin-bottom: 10px" @click="openLevel()">
          {{ t('member.addLevel') }}
        </el-button>
        <el-table :data="levels" border>
          <el-table-column :label="t('inventory.name')" min-width="120">
            <template #default="{ row }">{{ nameOf(row) }}</template>
          </el-table-column>
          <el-table-column prop="minSpend" :label="t('member.minSpend')" width="130">
            <template #default="{ row }">{{ formatVND(row.minSpend || 0) }}</template>
          </el-table-column>
          <el-table-column prop="deliveryFeeOff" :label="t('member.deliveryFeeOff')" width="120">
            <template #default="{ row }">{{ formatVND(row.deliveryFeeOff || 0) }}</template>
          </el-table-column>
          <el-table-column prop="discountPercent" :label="t('member.discountPercent')" width="100" />
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">
              {{ row.isActive ? t('common.enabled') : t('common.disabled') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="openLevel(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removeLevel(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="levelDialog" :title="t('member.level')" width="460px">
      <el-form label-width="110px">
        <el-form-item :label="t('common.nameZh')"><el-input v-model="levelForm.nameZh" /></el-form-item>
        <el-form-item :label="t('common.nameVi')"><el-input v-model="levelForm.nameVi" /></el-form-item>
        <el-form-item :label="t('member.minPoints')"><el-input-number v-model="levelForm.minPoints" :min="0" /></el-form-item>
        <el-form-item :label="t('member.minSpend')"><el-input-number v-model="levelForm.minSpend" :min="0" :step="10000" /></el-form-item>
        <el-form-item :label="t('member.discountPercent')"><el-input-number v-model="levelForm.discountPercent" :min="0" :max="100" /></el-form-item>
        <el-form-item :label="t('member.birthdayBonus')"><el-input-number v-model="levelForm.birthdayBonusPoints" :min="0" /></el-form-item>
        <el-form-item :label="t('member.deliveryFeeOff')"><el-input-number v-model="levelForm.deliveryFeeOff" :min="0" :step="1000" /></el-form-item>
        <el-form-item :label="t('member.priorityReserve')"><el-switch v-model="levelForm.priorityReserve" /></el-form-item>
        <el-form-item :label="t('member.priorityDelivery')"><el-switch v-model="levelForm.priorityDelivery" /></el-form-item>
        <el-form-item :label="t('member.birthdayGift')"><el-switch v-model="levelForm.birthdayGift" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="levelDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveLevel">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="issueDialog" :title="t('member.issueCoupon')" width="420px">
      <el-select v-model="issueForm.templateId" style="width: 100%">
        <el-option v-for="tpl in templates" :key="tpl.id" :label="nameOf(tpl)" :value="tpl.id" />
      </el-select>
      <template #footer>
        <el-button @click="issueDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doIssue">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustDialog" :title="adjustForm.kind === 'points' ? t('member.adjPoints') : t('member.adjBalance')" width="420px">
      <el-form label-width="80px">
        <el-form-item :label="t('member.delta')">
          <el-input
            :model-value="adjustForm.deltaText"
            @update:model-value="(v: string) => (adjustForm.deltaText = adjustForm.kind === 'balance' ? formatThousands(parseThousands(v)) : v)"
          />
        </el-form-item>
        <el-form-item :label="t('inventory.note')"><el-input v-model="adjustForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveAdjust">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar h3 { margin: 0 0 8px; }
.subbar { display: flex; gap: 8px; margin-bottom: 10px; }
</style>
