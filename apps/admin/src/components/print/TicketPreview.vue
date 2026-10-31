<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatVND, type PrintTicketPayload } from '@restaurant/shared';

const props = defineProps<{
  payload: PrintTicketPayload;
}>();

const { t, locale } = useI18n();
const isViUi = computed(() => locale.value === 'vi-VN');

const data = computed(() => props.payload.data);
const isReceipt = computed(() => props.payload.template === 'receipt');
const paperPx = computed(() => (props.payload.paperWidth === 80 ? 320 : 280));

/** 中越双语文案：两者都有且不同则「中 / 越」，否则取有值的一方 */
function bi(zh?: string | null, vi?: string | null, sep = ' / '): string {
  const z = (zh || '').trim();
  const v = (vi || '').trim();
  if (z && v && z !== v) return `${z}${sep}${v}`;
  return z || v || '';
}

/** 菜名：主行跟界面语言，另一语言固定副行（结账单给客人双语可读） */
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

const titleText = computed(() =>
  bi(data.value.titleZh, data.value.titleVi) || bi('结账小票', 'Hóa đơn'),
);

const footerLines = computed(() => {
  const zh = data.value.footerZh?.trim() || (isReceipt.value ? '欢迎下次光临' : '');
  const vi = data.value.footerVi?.trim() || (isReceipt.value ? 'Hẹn gặp lại' : '');
  if (zh && vi && zh !== vi) return [zh, vi];
  if (zh || vi) return [zh || vi];
  return [t('print.welcome')];
});

function fmtTime(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale.value === 'vi-VN' ? 'vi-VN' : 'zh-CN', {
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
</script>

<template>
  <div class="ticket-wrap">
    <div class="ticket" :style="{ width: paperPx + 'px' }">
      <div v-for="(line, i) in storeNameLines" :key="'s' + i" class="center bold store">{{ line }}</div>
      <div v-if="data.address" class="center muted small">{{ data.address }}</div>
      <div v-if="data.phone" class="center muted small">{{ data.phone }}</div>
      <div class="center bold title">{{ titleText }}</div>
      <div class="sep" />

      <div v-if="data.tableCode" class="row">
        <span>{{ bi('桌台', 'Bàn') }}: {{ data.tableCode }}</span>
        <span v-if="data.guestCount != null && data.guestCount > 0">
          {{ data.guestCount }} {{ bi('位', 'khách') }}
        </span>
      </div>
      <div v-if="data.orderNo" class="row">
        <span>{{ bi('单号', 'Mã đơn') }}</span>
        <span>{{ data.orderNo }}</span>
      </div>
      <div v-if="data.roundNo" class="row">
        <span>{{ bi('轮次', 'Lượt') }}</span>
        <span>{{ data.roundNo }}</span>
      </div>
      <div v-if="data.createdAt" class="row">
        <span>{{ bi('下单', 'Đặt') }}</span>
        <span>{{ fmtTime(data.createdAt) }}</span>
      </div>
      <div v-if="isReceipt && data.paidAt" class="row">
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
        <div v-if="it.remark" class="muted small">{{ it.remark }}</div>
      </div>

      <template v-if="isReceipt || data.total != null">
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
            <span>{{ formatVND((p as { received?: number }).received ?? p.amount) }}</span>
          </div>
          <div
            v-if="data.payments.some((p) => ((p as { received?: number }).received ?? p.amount) > p.amount)"
            class="row"
          >
            <span>{{ bi('找零', 'Tiền thừa') }}</span>
            <span>{{
              formatVND(
                data.payments.reduce(
                  (s, p) => s + Math.max(0, ((p as { received?: number }).received ?? p.amount) - p.amount),
                  0,
                ),
              )
            }}</span>
          </div>
        </template>
        <div v-else-if="data.paidAmount != null" class="row">
          <span>{{ bi('已付', 'Đã trả') }}</span>
          <span>{{ formatVND(data.paidAmount) }}</span>
        </div>
      </template>

      <template v-if="data.shift">
        <div class="sep" />
        <div v-if="data.shift.cashierName" class="row">
          <span>{{ bi('收银员', 'Thu ngân') }}</span>
          <span>{{ data.shift.cashierName }}</span>
        </div>
        <div v-if="data.shift.from" class="row">
          <span>{{ bi('开始', 'Bắt đầu') }}</span>
          <span>{{ fmtTime(data.shift.from) }}</span>
        </div>
        <div v-if="data.shift.to" class="row">
          <span>{{ bi('结束', 'Kết thúc') }}</span>
          <span>{{ fmtTime(data.shift.to) }}</span>
        </div>
        <div v-if="data.shift.orderCount != null" class="row">
          <span>{{ bi('订单数', 'Số đơn') }}</span>
          <span>{{ data.shift.orderCount }}</span>
        </div>
        <div v-if="data.shift.totalSales != null" class="row bold">
          <span>{{ bi('营业额', 'Doanh thu') }}</span>
          <span>{{ formatVND(data.shift.totalSales) }}</span>
        </div>
      </template>

      <template v-if="isReceipt">
        <div class="sep" />
        <div v-for="(line, i) in footerLines" :key="'f' + i" class="center footer">{{ line }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
  background: #f0f0f0;
  border-radius: 8px;
}
.ticket {
  background: #fff;
  color: #111;
  padding: 16px 14px 20px;
  font-family: 'Courier New', Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
</style>
