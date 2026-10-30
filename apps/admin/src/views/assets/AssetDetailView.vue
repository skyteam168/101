<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  assetAssignApi,
  assetCheckApi,
  assetInApi,
  assetRepairApi,
  assetRepairDoneApi,
  assetScrapApi,
  assetSellApi,
  assetTransferApi,
  getAssetApi,
  type Asset,
} from '../../api/asset';
import { useUserStore } from '../../stores/user';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const asset = ref<Asset | null>(null);
const loading = ref(false);

type EventKind =
  | 'in'
  | 'assign'
  | 'transfer'
  | 'repair'
  | 'repair_done'
  | 'scrap'
  | 'sell'
  | 'check';

const eventDialog = ref(false);
const eventKind = ref<EventKind>('in');
const eventForm = reactive({
  qty: 1,
  amountText: '',
  reason: '',
  toLocation: '',
  fromPool: '' as '' | 'in_use' | 'idle' | 'repair',
  actualInUse: 0,
  actualIdle: 0,
  actualRepair: 0,
});

const eventTitle = computed(() => t(`assets.event.${eventKind.value}`));

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

async function load() {
  loading.value = true;
  try {
    asset.value = await getAssetApi(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openEvent(kind: EventKind) {
  if (!asset.value) return;
  if (kind === 'scrap' && !userStore.hasPerm('asset:scrap')) {
    ElMessage.error(t('errors.FORBIDDEN'));
    return;
  }
  if (kind === 'sell' && !userStore.hasPerm('asset:sell')) {
    ElMessage.error(t('errors.FORBIDDEN'));
    return;
  }
  eventKind.value = kind;
  eventForm.qty = 1;
  eventForm.amountText = '';
  eventForm.reason = '';
  eventForm.toLocation = asset.value.location || '';
  eventForm.fromPool = '';
  eventForm.actualInUse = asset.value.qtyInUse;
  eventForm.actualIdle = asset.value.qtyIdle;
  eventForm.actualRepair = asset.value.qtyRepair;
  eventDialog.value = true;
}

async function submitEvent() {
  if (!asset.value) return;
  const id = asset.value.id;
  const qty = eventForm.qty;
  const amount = parseThousands(eventForm.amountText);
  const reason = eventForm.reason || undefined;
  const fromPool = eventForm.fromPool || undefined;

  switch (eventKind.value) {
    case 'in':
      await assetInApi(id, { qty, reason, toLocation: eventForm.toLocation || undefined, amount });
      break;
    case 'assign':
      await assetAssignApi(id, { qty, reason, toLocation: eventForm.toLocation || undefined });
      break;
    case 'transfer':
      await assetTransferApi(id, { toLocation: eventForm.toLocation, qty, reason });
      break;
    case 'repair':
      await assetRepairApi(id, { qty, reason, fromPool, amount });
      break;
    case 'repair_done':
      await assetRepairDoneApi(id, { qty, reason, amount });
      break;
    case 'scrap':
      await assetScrapApi(id, { qty, reason, fromPool, amount });
      break;
    case 'sell':
      await assetSellApi(id, { qty, reason, fromPool, amount });
      break;
    case 'check':
      await assetCheckApi(id, {
        actualInUse: eventForm.actualInUse,
        actualIdle: eventForm.actualIdle,
        actualRepair: eventForm.actualRepair,
        reason,
      });
      break;
  }
  ElMessage.success(t('common.saved'));
  eventDialog.value = false;
  await load();
}

function eventTypeLabel(type: string) {
  const key = `assets.event.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <div>
        <el-button link type="primary" @click="router.push('/assets')">← {{ t('assets.back') }}</el-button>
        <h3 v-if="asset">{{ asset.assetNo }} · {{ nameOf(asset) }}</h3>
      </div>
      <div class="actions" v-if="asset">
        <el-button @click="openEvent('in')">{{ t('assets.event.in') }}</el-button>
        <el-button @click="openEvent('assign')">{{ t('assets.event.assign') }}</el-button>
        <el-button @click="openEvent('transfer')">{{ t('assets.event.transfer') }}</el-button>
        <el-button @click="openEvent('repair')">{{ t('assets.event.repair') }}</el-button>
        <el-button @click="openEvent('repair_done')">{{ t('assets.event.repair_done') }}</el-button>
        <el-button v-perm="'asset:scrap'" type="danger" plain @click="openEvent('scrap')">
          {{ t('assets.event.scrap') }}
        </el-button>
        <el-button v-perm="'asset:sell'" type="warning" plain @click="openEvent('sell')">
          {{ t('assets.event.sell') }}
        </el-button>
        <el-button @click="openEvent('check')">{{ t('assets.event.check') }}</el-button>
      </div>
    </div>

    <el-descriptions v-if="asset" :column="3" border>
      <el-descriptions-item :label="t('assets.category')">
        {{ asset.category ? nameOf(asset.category) : '-' }}
      </el-descriptions-item>
      <el-descriptions-item :label="t('assets.spec')">{{ asset.spec || '-' }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.unit')">{{ asset.unit }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.location')">{{ asset.location || '-' }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.supplier')">{{ asset.supplier || '-' }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.purchaseDate')">{{ asset.purchaseDate || '-' }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.unitPrice')">{{ formatVND(asset.unitPrice) }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.originalValue')">{{ formatVND(asset.originalValue) }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.netValue')">{{ formatVND(asset.netValue) }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.qtyTotal')">{{ asset.qtyTotal }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.qtyInUse')">{{ asset.qtyInUse }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.qtyIdle')">{{ asset.qtyIdle }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.qtyRepair')">{{ asset.qtyRepair }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.qtyDisposed')">{{ asset.qtyDisposed }}</el-descriptions-item>
      <el-descriptions-item :label="t('assets.warrantyUntil')">{{ asset.warrantyUntil || '-' }}</el-descriptions-item>
    </el-descriptions>

    <h4>{{ t('assets.timeline') }}</h4>
    <el-timeline v-if="asset?.events?.length">
      <el-timeline-item
        v-for="e in asset.events"
        :key="e.id"
        :timestamp="new Date(e.happenedAt).toLocaleString()"
        placement="top"
      >
        <div class="evt">
          <strong>{{ eventTypeLabel(e.type) }}</strong>
          <span>×{{ e.qty }}</span>
          <span v-if="e.amount">{{ formatVND(e.amount) }}</span>
          <span v-if="e.fromLocation || e.toLocation">
            {{ e.fromLocation || '-' }} → {{ e.toLocation || '-' }}
          </span>
          <span v-if="e.operatorName">{{ e.operatorName }}</span>
          <div v-if="e.reason" class="reason">{{ e.reason }}</div>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else :description="t('assets.noEvents')" />

    <el-dialog v-model="eventDialog" :title="eventTitle" width="460px">
      <el-form label-width="110px">
        <template v-if="eventKind === 'check'">
          <el-form-item :label="t('assets.qtyInUse')">
            <el-input-number v-model="eventForm.actualInUse" :min="0" />
          </el-form-item>
          <el-form-item :label="t('assets.qtyIdle')">
            <el-input-number v-model="eventForm.actualIdle" :min="0" />
          </el-form-item>
          <el-form-item :label="t('assets.qtyRepair')">
            <el-input-number v-model="eventForm.actualRepair" :min="0" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item v-if="eventKind !== 'transfer'" :label="t('assets.qty')">
            <el-input-number v-model="eventForm.qty" :min="1" />
          </el-form-item>
          <el-form-item
            v-if="['repair', 'scrap', 'sell'].includes(eventKind)"
            :label="t('assets.fromPool')"
          >
            <el-select v-model="eventForm.fromPool" clearable style="width: 100%">
              <el-option :label="t('assets.statusInUse')" value="in_use" />
              <el-option :label="t('assets.statusIdle')" value="idle" />
              <el-option
                v-if="eventKind !== 'repair'"
                :label="t('assets.statusRepair')"
                value="repair"
              />
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="['transfer', 'assign', 'in'].includes(eventKind)"
            :label="t('assets.location')"
          >
            <el-input v-model="eventForm.toLocation" />
          </el-form-item>
          <el-form-item
            v-if="['in', 'repair', 'repair_done', 'scrap', 'sell'].includes(eventKind)"
            :label="t('assets.amount')"
          >
            <el-input
              :model-value="eventForm.amountText"
              @update:model-value="(v: string) => (eventForm.amountText = formatThousands(parseThousands(v)))"
            />
          </el-form-item>
        </template>
        <el-form-item :label="t('assets.reason')">
          <el-input v-model="eventForm.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitEvent">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.toolbar h3 { margin: 4px 0 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
h4 { margin: 20px 0 12px; }
.evt { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
.reason { width: 100%; color: #909399; font-size: 13px; }
</style>
