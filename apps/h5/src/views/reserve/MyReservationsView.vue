<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showSuccessToast, showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import {
  cancelMyReservation,
  getSavedReservePhone,
  listMyReservations,
  saveReservePhone,
  type PublicReservation,
} from '../../api/reservation';
import { useCustomerStore } from '../../stores/customer';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const customer = useCustomerStore();

const phone = ref('');
const loading = ref(false);
const list = ref<PublicReservation[]>([]);
const queried = ref(false);
const detail = ref<PublicReservation | null>(null);
const showDetail = ref(false);
const cancelling = ref(false);

const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

function statusLabel(status: string) {
  const key = `reserve.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function statusType(status: string) {
  if (status === 'confirmed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled' || status === 'no_show') return 'danger';
  return 'primary';
}

function formatAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dishName(it: { nameZh: string; nameVi: string }) {
  return localeField(it as unknown as Record<string, unknown>, 'name', loc.value);
}

function canEdit(r: PublicReservation) {
  return r.status === 'pending' || r.status === 'confirmed';
}

async function loadList() {
  const p = phone.value.replace(/\s+/g, '').trim();
  if (!p) {
    showToast(t('reserve.phoneRequired'));
    return;
  }
  loading.value = true;
  queried.value = true;
  try {
    list.value = await listMyReservations(p);
    saveReservePhone(p);
  } catch {
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function openDetail(r: PublicReservation) {
  detail.value = r;
  showDetail.value = true;
}

function goEdit(r: PublicReservation) {
  showDetail.value = false;
  router.push({
    name: 'reserve',
    query: { id: r.id, phone: phone.value.replace(/\s+/g, '').trim() },
  });
}

async function onCancel(r: PublicReservation) {
  try {
    await showConfirmDialog({
      title: t('reserve.cancelTitle'),
      message: t('reserve.cancelConfirm'),
    });
  } catch {
    return;
  }
  cancelling.value = true;
  try {
    await cancelMyReservation(r.id, phone.value);
    showSuccessToast(t('reserve.cancelOk'));
    showDetail.value = false;
    detail.value = null;
    await loadList();
  } catch {
    /* http 已提示 */
  } finally {
    cancelling.value = false;
  }
}

function goNew() {
  router.push({ name: 'reserve' });
}

onMounted(() => {
  const qPhone = typeof route.query.phone === 'string' ? route.query.phone : '';
  phone.value =
    qPhone ||
    getSavedReservePhone() ||
    customer.profile?.phone ||
    '';
  if (phone.value) void loadList();
});
</script>

<template>
  <div class="my-reserve-page">
    <van-nav-bar
      :title="t('reserve.myTitle')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    >
      <template #right>
        <button type="button" class="nav-link" @click="goNew">{{ t('reserve.title') }}</button>
      </template>
    </van-nav-bar>

    <van-cell-group inset class="lookup">
      <van-field
        v-model="phone"
        type="tel"
        :label="t('reserve.phone')"
        :placeholder="t('reserve.phonePlaceholder')"
        maxlength="20"
        clearable
      />
      <div class="lookup-actions">
        <van-button type="primary" block round :loading="loading" @click="loadList">
          {{ t('reserve.lookup') }}
        </van-button>
      </div>
    </van-cell-group>

    <p class="hint">{{ t('reserve.lookupHint') }}</p>

    <van-loading v-if="loading" class="center-load" />
    <van-empty
      v-else-if="queried && !list.length"
      :description="t('reserve.myEmpty')"
    />
    <div v-else class="cards">
      <button
        v-for="r in list"
        :key="r.id"
        type="button"
        class="card"
        @click="openDetail(r)"
      >
        <div class="card-top">
          <strong>{{ formatAt(r.reserveAt) }}</strong>
          <van-tag :type="statusType(r.status)" plain>{{ statusLabel(r.status) }}</van-tag>
        </div>
        <div class="card-row">{{ t('reserve.guestCount') }}：{{ r.guestCount }}</div>
        <div class="card-row">{{ r.customerName }} · {{ r.phone }}</div>
        <div v-if="r.preorderCount" class="card-row muted">
          {{ t('reserve.preorderTotal', { n: r.preorderCount }) }}
        </div>
      </button>
    </div>

    <van-popup v-model:show="showDetail" position="bottom" round :style="{ maxHeight: '80%' }">
      <div v-if="detail" class="detail">
        <div class="detail-head">
          <h3>{{ t('reserve.detailTitle') }}</h3>
          <van-tag :type="statusType(detail.status)">{{ statusLabel(detail.status) }}</van-tag>
        </div>
        <van-cell :title="t('reserve.reserveAt')" :value="formatAt(detail.reserveAt)" />
        <van-cell :title="t('reserve.customerName')" :value="detail.customerName" />
        <van-cell :title="t('reserve.phone')" :value="detail.phone" />
        <van-cell :title="t('reserve.guestCount')" :value="String(detail.guestCount)" />
        <van-cell
          v-if="detail.remark"
          :title="t('reserve.remark')"
          :label="detail.remark"
        />
        <div v-if="detail.items?.length" class="detail-items">
          <div class="items-title">{{ t('reserve.preorder') }}</div>
          <div v-for="(it, idx) in detail.items" :key="idx" class="item-row">
            <span>{{ dishName(it) }} × {{ it.qty }}</span>
            <span>{{ formatVND(it.unitPrice * it.qty) }}</span>
          </div>
        </div>
        <div v-if="canEdit(detail)" class="detail-actions">
          <van-button block round type="primary" @click="goEdit(detail)">
            {{ t('reserve.edit') }}
          </van-button>
          <van-button
            block
            round
            plain
            type="danger"
            :loading="cancelling"
            @click="onCancel(detail)"
          >
            {{ t('reserve.cancel') }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.my-reserve-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 24px;
}
.nav-link {
  border: 0;
  background: transparent;
  color: #ff6a00;
  font-size: 13px;
  padding: 0 4px;
}
.lookup {
  margin-top: 12px;
}
.lookup-actions {
  padding: 8px 16px 16px;
}
.hint {
  margin: 8px 20px 0;
  font-size: 12px;
  color: #969799;
  line-height: 1.5;
}
.center-load {
  display: flex;
  justify-content: center;
  margin-top: 48px;
}
.cards {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  text-align: left;
  border: 0;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.card:active {
  opacity: 0.92;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.card-row {
  font-size: 13px;
  color: #323233;
  line-height: 1.5;
}
.card-row.muted {
  color: #969799;
}
.detail {
  padding: 16px 0 24px;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 8px;
}
.detail-head h3 {
  margin: 0;
  font-size: 16px;
}
.detail-items {
  padding: 8px 16px 0;
}
.items-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.item-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  color: #646566;
}
.detail-actions {
  padding: 16px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
