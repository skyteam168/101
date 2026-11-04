<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { showToast } from 'vant';
import { toPng } from 'html-to-image';
import { formatVND, type PrintTicketPayload } from '@restaurant/shared';

const props = defineProps<{
  payload: PrintTicketPayload;
  /** 显示「已付款」章 */
  paidStamp?: boolean;
}>();

const { t, locale } = useI18n();
const ticketRef = ref<HTMLElement | null>(null);
const saving = ref(false);
const previewImg = ref('');

const isViUi = computed(() => String(locale.value).startsWith('vi'));
const data = computed(() => props.payload.data);
const paperPx = computed(() => (props.payload.paperWidth === 80 ? 320 : 280));

function bi(zh?: string | null, vi?: string | null, sep = ' / '): string {
  const z = (zh || '').trim();
  const v = (vi || '').trim();
  if (z && v && z !== v) return `${z}${sep}${v}`;
  return z || v || '';
}

function itemNames(it: { nameZh?: string; nameVi?: string }) {
  const zh = (it.nameZh || '').trim();
  const vi = (it.nameVi || '').trim();
  const primary = isViUi.value ? vi || zh : zh || vi;
  const secondary = isViUi.value ? (zh && zh !== vi ? zh : '') : vi && vi !== zh ? vi : '';
  return { primary, secondary };
}

const storeNameLines = computed(() => {
  const zh = data.value.storeNameZh?.trim() || '';
  const vi = data.value.storeNameVi?.trim() || '';
  if (zh && vi && zh !== vi) return [zh, vi];
  return [zh || vi].filter(Boolean);
});

const titleText = computed(
  () => bi(data.value.titleZh, data.value.titleVi) || bi('结账小票', 'Hóa đơn'),
);

const footerLines = computed(() => {
  const zh = data.value.footerZh?.trim() || '欢迎下次光临';
  const vi = data.value.footerVi?.trim() || 'Hẹn gặp lại';
  if (zh && vi && zh !== vi) return [zh, vi];
  return [zh || vi].filter(Boolean);
});

const stampText = computed(() => bi('已付款', 'ĐÃ THANH TOÁN'));

function fmtTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(isViUi.value ? 'vi-VN' : 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function payLabel(method: string) {
  const map: Record<string, [string, string]> = {
    cash: ['现金', 'Tiền mặt'],
    card: ['银行卡', 'Thẻ'],
    bank_transfer: ['转账', 'Chuyển khoản'],
    momo: ['MoMo', 'MoMo'],
    vnpay: ['VNPay', 'VNPay'],
  };
  const pair = map[method];
  return pair ? bi(pair[0], pair[1]) : method;
}

async function exportImage() {
  if (!ticketRef.value || saving.value) return;
  saving.value = true;
  try {
    const dataUrl = await toPng(ticketRef.value, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });
    previewImg.value = dataUrl;
    // 尝试触发下载（桌面/部分 Android）；iOS 仍可长按图片保存
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `receipt-${data.value.orderNo || Date.now()}.png`;
    a.click();
    showToast(t('shop.order.receiptSavedHint'));
  } catch {
    showToast(t('shop.order.receiptSaveFailed'));
  } finally {
    saving.value = false;
  }
}

defineExpose({ exportImage });
</script>

<template>
  <div class="e-receipt">
    <div ref="ticketRef" class="ticket" :style="{ width: paperPx + 'px' }">
      <div v-if="paidStamp !== false" class="stamp" aria-hidden="true">
        <span>{{ stampText }}</span>
      </div>

      <div v-for="(line, i) in storeNameLines" :key="'s' + i" class="center bold store">{{ line }}</div>
      <div v-if="data.address" class="center muted small">{{ data.address }}</div>
      <div v-if="data.phone" class="center muted small">{{ data.phone }}</div>
      <div class="center bold title">{{ titleText }}</div>
      <div class="sep" />

      <div v-if="data.tableCode" class="row">
        <span>{{ bi('桌台', 'Bàn') }}: {{ data.tableCode }}</span>
      </div>
      <div v-if="data.orderNo" class="row">
        <span>{{ bi('单号', 'Mã đơn') }}</span>
        <span>{{ data.orderNo }}</span>
      </div>
      <div v-if="data.createdAt" class="row">
        <span>{{ bi('下单', 'Đặt') }}</span>
        <span>{{ fmtTime(data.createdAt) }}</span>
      </div>
      <div v-if="data.paidAt" class="row">
        <span>{{ bi('结账', 'Thanh toán') }}</span>
        <span>{{ fmtTime(data.paidAt) }}</span>
      </div>
      <div v-if="data.remark" class="muted small">{{ bi('备注', 'Ghi chú') }}: {{ data.remark }}</div>

      <div class="sep" />

      <div v-for="(it, idx) in data.items || []" :key="idx" class="item">
        <div class="row">
          <span class="name bold">{{ itemNames(it).primary }} ×{{ it.qty }}</span>
          <span v-if="it.amount != null">{{ formatVND(it.amount) }}</span>
        </div>
        <div v-if="itemNames(it).secondary" class="name-alt muted small">
          {{ itemNames(it).secondary }}
        </div>
      </div>

      <div class="sep" />
      <div v-if="data.subtotal != null" class="row">
        <span>{{ bi('小计', 'Tạm tính') }}</span>
        <span>{{ formatVND(data.subtotal) }}</span>
      </div>
      <div v-if="data.discount && data.discount > 0" class="row">
        <span>{{ bi('折扣', 'Giảm giá') }}</span>
        <span>-{{ formatVND(data.discount) }}</span>
      </div>
      <div v-if="data.serviceCharge && data.serviceCharge > 0" class="row">
        <span>{{ bi('服务费', 'Phí phục vụ') }}</span>
        <span>{{ formatVND(data.serviceCharge) }}</span>
      </div>
      <div v-if="data.deliveryFee && data.deliveryFee > 0" class="row">
        <span>{{ bi('配送费', 'Phí giao') }}</span>
        <span>{{ formatVND(data.deliveryFee) }}</span>
      </div>
      <div class="row bold total">
        <span>{{ bi('合计', 'TỔNG') }}</span>
        <span>{{ formatVND(data.total ?? 0) }}</span>
      </div>

      <template v-if="data.payments?.length">
        <div class="sep" />
        <div v-for="(p, i) in data.payments" :key="i" class="row">
          <span>{{ payLabel(p.method) }}</span>
          <span>{{ formatVND(p.amount) }}</span>
        </div>
      </template>
      <div v-else-if="data.paidAmount != null" class="row">
        <span>{{ bi('已付', 'Đã trả') }}</span>
        <span>{{ formatVND(data.paidAmount) }}</span>
      </div>

      <div class="sep" />
      <div v-for="(line, i) in footerLines" :key="'f' + i" class="center footer">{{ line }}</div>
    </div>

    <div class="actions">
      <van-button block round type="primary" :loading="saving" @click="exportImage">
        {{ t('shop.order.saveReceiptImage') }}
      </van-button>
      <p class="hint">{{ t('shop.order.receiptLongPressHint') }}</p>
    </div>

    <div v-if="previewImg" class="img-preview">
      <p class="hint">{{ t('shop.order.receiptLongPressHint') }}</p>
      <img :src="previewImg" alt="receipt" class="receipt-img" />
    </div>
  </div>
</template>

<style scoped>
.e-receipt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 4px;
}
.ticket {
  position: relative;
  background: #fff;
  color: #111;
  padding: 16px 14px 20px;
  font-family: 'Courier New', Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.stamp {
  position: absolute;
  right: 10px;
  top: 52px;
  width: 88px;
  height: 88px;
  border: 3px solid rgba(220, 38, 38, 0.85);
  border-radius: 50%;
  color: rgba(220, 38, 38, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-18deg);
  pointer-events: none;
  z-index: 2;
  background: rgba(255, 255, 255, 0.35);
}
.stamp span {
  font-size: 13px;
  font-weight: 800;
  text-align: center;
  line-height: 1.2;
  letter-spacing: 1px;
  padding: 4px;
}
.center {
  text-align: center;
}
.bold {
  font-weight: 700;
}
.store {
  font-size: 15px;
  margin-bottom: 2px;
}
.title {
  font-size: 14px;
  margin: 8px 0 4px;
}
.muted {
  color: #666;
}
.small {
  font-size: 11px;
}
.sep {
  border-top: 1px dashed #999;
  margin: 8px 0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 0;
}
.row .name {
  flex: 1;
  word-break: break-word;
}
.name-alt {
  padding-left: 2px;
  margin-bottom: 2px;
}
.item {
  margin: 4px 0;
}
.total {
  font-size: 13px;
  margin-top: 4px;
}
.footer {
  margin-top: 2px;
  font-size: 13px;
}
.actions {
  width: 100%;
  max-width: 320px;
  padding: 0 8px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #969799;
  text-align: center;
  line-height: 1.4;
}
.img-preview {
  width: 100%;
  max-width: 320px;
  text-align: center;
}
.receipt-img {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #eee;
  background: #fff;
  -webkit-touch-callout: default;
  user-select: none;
}
</style>
