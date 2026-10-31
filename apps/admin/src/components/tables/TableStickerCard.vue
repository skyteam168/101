<script setup lang="ts">
import QrcodeVue from 'qrcode.vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  storeNameZh: string;
  storeNameVi?: string;
  tableCode: string;
  qrUrl: string;
  wifiSsid?: string;
  wifiPassword?: string;
}>();

const { t } = useI18n();
const scanChars = ['扫', '码', '点', '单'];
</script>

<template>
  <div class="sticker">
    <div class="left">
      <div class="qr-wrap">
        <QrcodeVue :value="qrUrl" :size="138" level="M" render-as="svg" />
      </div>
      <div class="scan-block">
        <div class="scan-row">
          <span v-for="ch in scanChars" :key="ch" class="scan-dot">{{ ch }}</span>
        </div>
        <div class="scan-sub">Quét mã gọi món</div>
        <div class="scan-sub-en">Scan to order</div>
      </div>
    </div>
    <div class="divider" />
    <div class="right">
      <div class="brand">
        <div class="name-zh">{{ storeNameZh }}</div>
        <div v-if="storeNameVi && storeNameVi !== storeNameZh" class="name-vi">{{ storeNameVi }}</div>
      </div>
      <div class="table-code">{{ tableCode }}</div>
      <div class="wifi">
        <div class="wifi-title">WIFI</div>
        <div class="wifi-body">
          <div v-if="wifiSsid" class="wifi-line">
            <span class="ico wifi-ico" aria-hidden="true" />
            <span>{{ wifiSsid }}</span>
          </div>
          <div v-if="wifiPassword" class="wifi-line">
            <span class="ico lock-ico" aria-hidden="true" />
            <span>{{ wifiPassword }}</span>
          </div>
          <div v-if="!wifiSsid && !wifiPassword" class="wifi-empty">{{ t('tables.wifiNotConfigured') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticker {
  display: flex;
  width: 420px;
  height: 300px;
  background: #fff;
  border: 1.5px solid #111;
  border-radius: 12px;
  overflow: hidden;
  box-sizing: border-box;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.left {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 10px 12px;
}
.qr-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}
.scan-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.scan-row {
  display: flex;
  gap: 10px;
}
.scan-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #111;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.scan-sub {
  font-size: 12px;
  font-weight: 700;
  color: #111;
  letter-spacing: 0.2px;
  line-height: 1.2;
}
.scan-sub-en {
  font-size: 10px;
  font-weight: 600;
  color: #666;
  letter-spacing: 0.3px;
  line-height: 1.2;
  text-transform: uppercase;
}
.divider {
  width: 1px;
  align-self: stretch;
  margin: 16px 0;
  background: #222;
}
.right {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 16px 18px;
  box-sizing: border-box;
}
.brand {
  text-align: center;
  min-height: 40px;
}
.name-zh {
  font-size: 17px;
  font-weight: 800;
  color: #111;
  line-height: 1.2;
}
.name-vi {
  margin-top: 2px;
  font-size: 11px;
  color: #888;
  max-width: 180px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.25;
}
.table-code {
  margin-top: auto;
  margin-bottom: auto;
  font-size: 48px;
  font-weight: 900;
  color: #e11d2e;
  letter-spacing: 1px;
  line-height: 1;
  padding: 8px 0;
}
.wifi {
  margin-top: auto;
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding-top: 8px;
}
.wifi-title {
  font-size: 15px;
  font-weight: 800;
  color: #111;
  padding-top: 2px;
}
.wifi-body {
  flex: 1;
  min-width: 0;
}
.wifi-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #222;
  line-height: 1.45;
  word-break: break-all;
}
.ico {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: inline-block;
  background: #111;
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}
.wifi-ico {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 18.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0-5.2c2.1 0 4 1 5.3 2.5l-1.5 1.5A5.5 5.5 0 0 0 12 15.3a5.5 5.5 0 0 0-3.8 1.5L6.7 15.3A7.7 7.7 0 0 1 12 13.3Zm0-4.5c3.4 0 6.5 1.5 8.6 4l-1.5 1.5A9.8 9.8 0 0 0 12 10.8a9.8 9.8 0 0 0-7.1 2.9L3.4 12.2A12.3 12.3 0 0 1 12 8.8Z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 18.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0-5.2c2.1 0 4 1 5.3 2.5l-1.5 1.5A5.5 5.5 0 0 0 12 15.3a5.5 5.5 0 0 0-3.8 1.5L6.7 15.3A7.7 7.7 0 0 1 12 13.3Zm0-4.5c3.4 0 6.5 1.5 8.6 4l-1.5 1.5A9.8 9.8 0 0 0 12 10.8a9.8 9.8 0 0 0-7.1 2.9L3.4 12.2A12.3 12.3 0 0 1 12 8.8Z'/%3E%3C/svg%3E");
}
.lock-ico {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm7 12H7v-8h10v8Z'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm7 12H7v-8h10v8Z'/%3E%3C/svg%3E");
}
.wifi-empty {
  font-size: 11px;
  color: #999;
}
</style>
