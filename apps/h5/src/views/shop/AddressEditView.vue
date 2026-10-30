<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createAddress, listAddresses, updateAddress, type CustomerAddress } from '../../api/delivery';

// 修复 Vite 环境下 Leaflet 默认图标路径问题
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// 覆盖 Leaflet 默认图标
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const editId = ref<number | null>(null);
const form = reactive({
  contactName: '',
  phone: '',
  addressText: '',
  detail: '',
  lat: 10.754, // 默认门店附近（HCM Q5）
  lng: 106.666,
  isDefault: false,
});
const saving = ref(false);
const locating = ref(false);
const mapContainer = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;

onMounted(async () => {
  // 判断是编辑还是新增
  const idParam = route.query.id ? String(route.query.id) : null;
  if (idParam) {
    editId.value = idParam as unknown as number;
    const addrs = await listAddresses();
    const addr = addrs.find((a: CustomerAddress) => String(a.id) === idParam);
    if (addr) {
      form.contactName = addr.contactName;
      form.phone = addr.phone;
      form.addressText = addr.addressText;
      form.detail = addr.detail ?? '';
      form.lat = addr.lat ?? 10.754;
      form.lng = addr.lng ?? 106.666;
      form.isDefault = addr.isDefault;
    }
  }
  initMap();
});

onUnmounted(() => {
  map?.remove();
  map = null;
});

function initMap() {
  if (!mapContainer.value) return;
  map = L.map(mapContainer.value).setView([form.lat, form.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  marker = L.marker([form.lat, form.lng], { draggable: true }).addTo(map);
  marker.on('dragend', (e: L.LeafletEvent) => {
    const latlng = (e as L.DragEndEvent).target.getLatLng();
    form.lat = latlng.lat;
    form.lng = latlng.lng;
    reverseGeocode(latlng.lat, latlng.lng);
  });
  map.on('click', (e: L.LeafletMouseEvent) => {
    form.lat = e.latlng.lat;
    form.lng = e.latlng.lng;
    marker?.setLatLng(e.latlng);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
  });
}

function updateMarker(lat: number, lng: number) {
  if (!map || !marker) return;
  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], 16);
}

// 反向地理编码（Nominatim）
async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'vi,zh' } },
    );
    const data = await res.json();
    if (data?.display_name) {
      form.addressText = data.display_name;
    }
  } catch {
    // 反向编码失败时保持用户已输入内容
  }
}

// 定位按钮
function handleGeolocate() {
  if (!navigator.geolocation) {
    showToast(t('shop.address.geoNotSupported'));
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false;
      form.lat = pos.coords.latitude;
      form.lng = pos.coords.longitude;
      updateMarker(form.lat, form.lng);
      reverseGeocode(form.lat, form.lng);
    },
    () => {
      locating.value = false;
      showToast(t('shop.address.geoFailed'));
    },
    { timeout: 10000 },
  );
}

async function handleSave() {
  if (!form.contactName || !form.phone || !form.addressText) {
    showToast(t('shop.address.fillRequired'));
    return;
  }
  // 越南手机号基本验证 (03x/07x/08x/09x)
  if (!/^0[3-9]\d{8}$/.test(form.phone.replace(/\s/g, ''))) {
    showToast(t('shop.address.phoneInvalid'));
    return;
  }
  saving.value = true;
  try {
    const dto = {
      contactName: form.contactName,
      phone: form.phone,
      addressText: form.addressText,
      detail: form.detail || undefined,
      lat: form.lat,
      lng: form.lng,
      isDefault: form.isDefault,
    };
    if (editId.value) {
      await updateAddress(editId.value, dto);
    } else {
      await createAddress(dto);
    }
    showToast(t('shop.address.saved'));
    router.back();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="addr-edit-page">
    <van-nav-bar
      :title="editId ? t('shop.address.edit') : t('shop.address.add')"
      left-arrow
      @click-left="router.back()"
    />

    <van-cell-group inset style="margin-top: 12px">
      <van-field
        v-model="form.contactName"
        :label="t('shop.address.contactName')"
        :placeholder="t('shop.address.contactNamePlaceholder')"
      />
      <van-field
        v-model="form.phone"
        type="tel"
        :label="t('shop.address.phone')"
        :placeholder="t('shop.address.phonePlaceholder')"
      />
      <van-field
        v-model="form.addressText"
        :label="t('shop.address.address')"
        :placeholder="t('shop.address.addressPlaceholder')"
        type="textarea"
        rows="2"
        autosize
      />
      <van-field
        v-model="form.detail"
        :label="t('shop.address.detail')"
        :placeholder="t('shop.address.detailPlaceholder')"
      />
      <van-cell>
        <template #title>{{ t('shop.address.setAsDefault') }}</template>
        <template #right-icon>
          <van-switch v-model="form.isDefault" size="20" />
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 地图选点 -->
    <div class="map-section">
      <div class="map-header">
        <span class="map-title">{{ t('shop.address.mapTitle') }}</span>
        <van-button
          size="small"
          type="primary"
          :loading="locating"
          @click="handleGeolocate"
          icon="aim"
        >
          {{ t('shop.address.locate') }}
        </van-button>
      </div>
      <div ref="mapContainer" class="map-container" />
      <div class="map-hint">{{ t('shop.address.mapHint') }}</div>
    </div>

    <div style="padding: 16px">
      <van-button block type="danger" round :loading="saving" @click="handleSave">
        {{ t('shop.address.save') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.addr-edit-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 24px; }
.map-section { margin: 12px 16px; }
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.map-title { font-size: 14px; font-weight: 600; color: #323233; }
.map-container { height: 240px; border-radius: 8px; overflow: hidden; border: 1px solid #eee; }
.map-hint { font-size: 12px; color: #969799; margin-top: 4px; }
</style>
