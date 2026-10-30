<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import { getStoreInfo, type StoreInfo } from '../../api/delivery';
import { createReservation } from '../../api/reservation';

const { t, locale } = useI18n();
const router = useRouter();

const store = ref<StoreInfo | null>(null);
const loading = ref(false);
const submitted = ref(false);
const showDatetimePicker = ref(false);

const form = reactive({
  customerName: '',
  phone: '',
  guestCount: '',
  remark: '',
});

const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

function storeName(s: StoreInfo) {
  return loc.value === 'vi' ? s.nameVi || s.nameZh : s.nameZh || s.nameVi;
}

const minDate = new Date();
const pickerDate = ref<string[]>([]);
const pickerTime = ref<string[]>([]);
const reserveAtIso = ref('');

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function initPickerDefaults() {
  const base = reserveAtIso.value ? new Date(reserveAtIso.value) : new Date(Date.now() + 60 * 60 * 1000);
  pickerDate.value = [String(base.getFullYear()), pad(base.getMonth() + 1), pad(base.getDate())];
  pickerTime.value = [pad(base.getHours()), pad(base.getMinutes())];
}

const reserveAtDisplay = computed(() => {
  if (!reserveAtIso.value) return '';
  const d = new Date(reserveAtIso.value);
  if (Number.isNaN(d.getTime())) return reserveAtIso.value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

function openDatetimePicker() {
  initPickerDefaults();
  showDatetimePicker.value = true;
}

function onDatetimeConfirm() {
  const [y, mo, d] = pickerDate.value;
  const [h, mi] = pickerTime.value;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
  reserveAtIso.value = dt.toISOString();
  showDatetimePicker.value = false;
}

function clearFields() {
  form.customerName = '';
  form.phone = '';
  form.guestCount = '';
  form.remark = '';
  reserveAtIso.value = '';
}

async function handleSubmit() {
  if (!form.customerName.trim()) {
    showToast(t('reserve.nameRequired'));
    return;
  }
  if (!form.phone.trim()) {
    showToast(t('reserve.phoneRequired'));
    return;
  }
  const guests = Number(form.guestCount);
  if (!form.guestCount || !Number.isFinite(guests) || guests < 1) {
    showToast(t('reserve.guestCountRequired'));
    return;
  }
  if (!reserveAtIso.value) {
    showToast(t('reserve.reserveAtRequired'));
    return;
  }

  loading.value = true;
  try {
    await createReservation({
      customerName: form.customerName.trim(),
      phone: form.phone.trim(),
      guestCount: guests,
      reserveAt: reserveAtIso.value,
      remark: form.remark.trim() || undefined,
    });
    showSuccessToast(t('reserve.success'));
    clearFields();
    submitted.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    store.value = await getStoreInfo();
  } catch {
    // 门店信息可选，失败时不阻塞表单
  }
});
</script>

<template>
  <div class="reserve-page">
    <van-nav-bar :title="t('reserve.title')" left-arrow @click-left="router.back()" />

    <div v-if="store" class="store-bar">
      <van-icon name="shop-o" size="20" color="#ff6a00" />
      <span>{{ storeName(store) }}</span>
    </div>

    <van-form @submit="handleSubmit">
      <van-cell-group inset>
        <van-field
          v-model="form.customerName"
          :label="t('reserve.customerName')"
          :placeholder="t('reserve.customerNamePlaceholder')"
          maxlength="64"
          required
        />
        <van-field
          v-model="form.phone"
          type="tel"
          :label="t('reserve.phone')"
          :placeholder="t('reserve.phonePlaceholder')"
          maxlength="20"
          required
        />
        <van-field
          v-model="form.guestCount"
          type="digit"
          :label="t('reserve.guestCount')"
          :placeholder="t('reserve.guestCountPlaceholder')"
          required
        />
        <van-field
          :model-value="reserveAtDisplay"
          readonly
          is-link
          :label="t('reserve.reserveAt')"
          :placeholder="t('reserve.reserveAtPlaceholder')"
          required
          @click="openDatetimePicker"
        />
        <van-field
          v-model="form.remark"
          type="textarea"
          rows="2"
          autosize
          :label="t('reserve.remark')"
          :placeholder="t('reserve.remarkPlaceholder')"
          maxlength="200"
          show-word-limit
        />
      </van-cell-group>

      <div class="submit-wrap">
        <van-button type="primary" block round native-type="submit" :loading="loading">
          {{ t('reserve.submit') }}
        </van-button>
      </div>
    </van-form>

    <van-empty v-if="submitted" class="success-hint" :description="t('reserve.successHint')" />

    <van-popup v-model:show="showDatetimePicker" position="bottom" round>
      <van-picker-group
        :title="t('reserve.reserveAt')"
        :tabs="[t('reserve.pickDate'), t('reserve.pickTime')]"
        @confirm="onDatetimeConfirm"
        @cancel="showDatetimePicker = false"
      >
        <van-date-picker v-model="pickerDate" :min-date="minDate" />
        <van-time-picker v-model="pickerTime" :columns-type="['hour', 'minute']" />
      </van-picker-group>
    </van-popup>
  </div>
</template>

<style scoped>
.reserve-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 32px;
}
.store-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 12px 14px;
  background: #fff;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: #323233;
}
.submit-wrap {
  margin: 24px 16px 0;
}
.success-hint {
  margin-top: 16px;
}
</style>
