<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  createAddress,
  getStoreInfo,
  listAddresses,
  updateAddress,
  uploadCustomerImage,
  type CustomerAddress,
} from '../../api/delivery';

// 修复 Vite 环境下 Leaflet 默认图标路径问题
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

type PlaceSuggestion = {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
};

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();

const editId = ref<string | null>(null);
/** 默认：餐厅附近（胡志明省 Thủ Dầu Một） */
const DEFAULT_CENTER = { lat: 10.9742806, lng: 106.6272538 };

const form = reactive({
  contactName: '',
  phone: '',
  addressText: '',
  detail: '',
  landmarkPhoto: '' as string,
  lat: DEFAULT_CENTER.lat,
  lng: DEFAULT_CENTER.lng,
  isDefault: false,
});
const saving = ref(false);
const locating = ref(false);
const uploadingLandmark = ref(false);
const landmarkInput = ref<HTMLInputElement | null>(null);
const mapContainer = ref<HTMLDivElement | null>(null);
const storeLat = ref(DEFAULT_CENTER.lat);
const storeLng = ref(DEFAULT_CENTER.lng);
const storeRadiusKm = ref(5);
let map: L.Map | null = null;
let marker: L.Marker | null = null;
let deliveryCircle: L.Circle | null = null;

/** 位置搜索 */
const searchQuery = ref('');
const searchResults = ref<PlaceSuggestion[]>([]);
const searching = ref(false);
const showSearchDropdown = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchAbort: AbortController | null = null;
/** 选中建议后避免立刻再触发搜索 */
let suppressSearch = false;

onMounted(async () => {
  try {
    const store = await getStoreInfo();
    if (store.lat != null && store.lng != null) {
      storeLat.value = Number(store.lat);
      storeLng.value = Number(store.lng);
      if (!route.query.id) {
        form.lat = storeLat.value;
        form.lng = storeLng.value;
      }
    }
    if (store.deliveryRadiusKm > 0) storeRadiusKm.value = Number(store.deliveryRadiusKm);
  } catch {
    // 无门店信息时用默认中心
  }

  const idParam = route.query.id ? String(route.query.id) : null;
  if (idParam) {
    editId.value = idParam;
    const addrs = await listAddresses();
    const addr = addrs.find((a: CustomerAddress) => String(a.id) === idParam);
    if (addr) {
      form.contactName = addr.contactName;
      form.phone = addr.phone;
      form.addressText = addr.addressText;
      form.detail = addr.detail ?? '';
      form.landmarkPhoto = addr.landmarkPhoto ?? '';
      form.lat = addr.lat ?? storeLat.value;
      form.lng = addr.lng ?? storeLng.value;
      form.isDefault = addr.isDefault;
      searchQuery.value = addr.addressText;
    }
  }
  await nextTick();
  initMap();
  // 新建地址：尝试定位到用户当前位置（仍显示配送圈）
  if (!idParam) handleGeolocate();
});

let resizeObserver: ResizeObserver | null = null;
const sizeTimers: ReturnType<typeof setTimeout>[] = [];

function refreshMapSize(fit = false) {
  if (!map) return;
  map.invalidateSize(true);
  if (fit && deliveryCircle) {
    map.fitBounds(deliveryCircle.getBounds(), { padding: [24, 24] });
  }
}

function scheduleMapRefresh() {
  for (const ms of [0, 50, 150, 300, 600]) {
    sizeTimers.push(setTimeout(() => refreshMapSize(ms === 150), ms));
  }
}

function onWinResize() {
  refreshMapSize(false);
}

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer);
  searchAbort?.abort();
  window.removeEventListener('resize', onWinResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  for (const t of sizeTimers) clearTimeout(t);
  sizeTimers.length = 0;
  map?.remove();
  map = null;
  marker = null;
  deliveryCircle = null;
});

function acceptLang() {
  return String(locale.value).startsWith('vi') ? 'vi,en' : 'zh,vi,en';
}

function initMap() {
  if (!mapContainer.value) return;
  map = L.map(mapContainer.value, { fadeAnimation: false }).setView([form.lat, form.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  // 门店配送范围（红圈）
  deliveryCircle = L.circle([storeLat.value, storeLng.value], {
    radius: Math.max(0.1, storeRadiusKm.value) * 1000,
    color: '#ee0a24',
    weight: 2,
    fillColor: '#ee0a24',
    fillOpacity: 0.1,
  }).addTo(map);
  L.circleMarker([storeLat.value, storeLng.value], {
    radius: 6,
    color: '#ee0a24',
    fillColor: '#ee0a24',
    fillOpacity: 1,
  })
    .addTo(map)
    .bindTooltip(t('shop.address.storeMarker'), { permanent: false });

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
  scheduleMapRefresh();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => refreshMapSize(false));
    resizeObserver.observe(mapContainer.value);
  }
  window.addEventListener('resize', onWinResize);
}

function updateMarker(lat: number, lng: number) {
  if (!map || !marker) return;
  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], 16);
  refreshMapSize(false);
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': acceptLang() } },
    );
    const data = await res.json();
    if (data?.display_name) {
      suppressSearch = true;
      form.addressText = data.display_name;
      searchQuery.value = data.display_name;
      searchResults.value = [];
      showSearchDropdown.value = false;
    }
  } catch {
    // 反向编码失败时保持用户已输入内容
  }
}

function onSearchInput(val: string) {
  searchQuery.value = val;
  form.addressText = val;
  if (suppressSearch) {
    suppressSearch = false;
    return;
  }
  if (searchTimer) clearTimeout(searchTimer);
  const q = val.trim();
  if (q.length < 2) {
    searchResults.value = [];
    showSearchDropdown.value = false;
    searching.value = false;
    searchAbort?.abort();
    return;
  }
  searchTimer = setTimeout(() => {
    void searchPlaces(q);
  }, 400);
}

async function searchPlaces(q: string) {
  searchAbort?.abort();
  const ctrl = new AbortController();
  searchAbort = ctrl;
  searching.value = true;
  showSearchDropdown.value = true;
  try {
    // 偏置门店周边（约 ±0.25° ≈ 25km），优先本地结果
    const d = 0.25;
    const left = storeLng.value - d;
    const right = storeLng.value + d;
    const top = storeLat.value + d;
    const bottom = storeLat.value - d;
    const params = new URLSearchParams({
      q,
      format: 'json',
      addressdetails: '0',
      limit: '8',
      countrycodes: 'vn',
      viewbox: `${left},${top},${right},${bottom}`,
      bounded: '0',
      'accept-language': acceptLang(),
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept-Language': acceptLang() },
      signal: ctrl.signal,
    });
    const data = (await res.json()) as {
      place_id?: number | string;
      display_name?: string;
      lat?: string;
      lon?: string;
    }[];
    if (!Array.isArray(data)) {
      searchResults.value = [];
      return;
    }
    searchResults.value = data
      .filter((x) => x.display_name && x.lat && x.lon)
      .map((x) => ({
        placeId: String(x.place_id ?? `${x.lat},${x.lon}`),
        displayName: x.display_name as string,
        lat: Number(x.lat),
        lng: Number(x.lon),
      }));
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    searchResults.value = [];
  } finally {
    if (searchAbort === ctrl) searching.value = false;
  }
}

function selectPlace(item: PlaceSuggestion) {
  suppressSearch = true;
  searchQuery.value = item.displayName;
  form.addressText = item.displayName;
  form.lat = item.lat;
  form.lng = item.lng;
  searchResults.value = [];
  showSearchDropdown.value = false;
  updateMarker(item.lat, item.lng);
}

function onSearchBlur() {
  // 稍延迟，保证点击下拉项先生效
  setTimeout(() => {
    showSearchDropdown.value = false;
  }, 180);
}

function onSearchFocus() {
  if (searchResults.value.length) showSearchDropdown.value = true;
}

function pickLandmark() {
  landmarkInput.value?.click();
}

async function onLandmarkChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast(t('shop.address.photoTypeInvalid'));
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast(t('shop.address.photoTooLarge'));
    return;
  }
  uploadingLandmark.value = true;
  try {
    const { url } = await uploadCustomerImage(file);
    form.landmarkPhoto = url;
    showToast(t('shop.address.photoUploaded'));
  } catch {
    /* 拦截器已 toast */
  } finally {
    uploadingLandmark.value = false;
  }
}

function clearLandmark() {
  form.landmarkPhoto = '';
}

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
      landmarkPhoto: form.landmarkPhoto || null,
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
      fixed
      placeholder
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

    <!-- 大门 / 门牌参照照：方便骑手找楼 -->
    <div class="landmark-section">
      <div class="landmark-title">{{ t('shop.address.landmarkTitle') }}</div>
      <div class="landmark-hint">{{ t('shop.address.landmarkHint') }}</div>
      <div class="landmark-row">
        <div v-if="form.landmarkPhoto" class="landmark-preview">
          <img :src="form.landmarkPhoto" alt="" />
          <button type="button" class="landmark-remove" @click="clearLandmark">
            <van-icon name="cross" size="12" />
          </button>
        </div>
        <button
          type="button"
          class="landmark-add"
          :disabled="uploadingLandmark"
          @click="pickLandmark"
        >
          <van-loading v-if="uploadingLandmark" size="20" />
          <template v-else>
            <van-icon name="photograph" size="22" />
            <span>{{ t('shop.address.landmarkTake') }}</span>
          </template>
        </button>
      </div>
      <input
        ref="landmarkInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="file-hidden"
        @change="onLandmarkChange"
      />
    </div>

    <!-- 位置搜索 + 地图 -->
    <div class="map-section">
      <div class="map-header">
        <span class="map-title">{{ t('shop.address.mapTitle') }}</span>
        <van-button
          size="small"
          type="primary"
          :loading="locating"
          icon="aim"
          @click="handleGeolocate"
        >
          {{ t('shop.address.locate') }}
        </van-button>
      </div>

      <div class="search-wrap">
        <van-field
          :model-value="searchQuery"
          class="search-field"
          clearable
          left-icon="search"
          :placeholder="t('shop.address.searchPlaceholder')"
          @update:model-value="onSearchInput"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
        />
        <div v-if="showSearchDropdown" class="search-dropdown">
          <div v-if="searching" class="search-status">{{ t('shop.address.searching') }}</div>
          <div v-else-if="!searchResults.length" class="search-status">
            {{ t('shop.address.searchEmpty') }}
          </div>
          <button
            v-for="item in searchResults"
            :key="item.placeId"
            type="button"
            class="search-item"
            @mousedown.prevent="selectPlace(item)"
          >
            <van-icon name="location-o" class="search-item-icon" />
            <span class="search-item-text">{{ item.displayName }}</span>
          </button>
        </div>
      </div>

      <div ref="mapContainer" class="map-container" />
      <div class="map-hint">{{ t('shop.address.mapHint') }}</div>
      <div class="map-hint">{{ t('shop.address.radiusHint', { km: storeRadiusKm }) }}</div>
    </div>

    <div style="padding: 16px">
      <van-button block type="danger" round :loading="saving" @click="handleSave">
        {{ t('shop.address.save') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.addr-edit-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 24px;
}
.map-section {
  margin: 12px 16px;
}
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.map-title {
  font-size: 14px;
  font-weight: 600;
  color: #323233;
}
.search-wrap {
  position: relative;
  margin-bottom: 8px;
  /* Leaflet 地图 pane z-index 常达 400~1000，搜索层需更高 */
  z-index: 2500;
}
.search-field {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  padding: 4px 8px;
  position: relative;
  z-index: 1;
}
.search-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  max-height: 240px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  border: 1px solid #ebedf0;
  z-index: 2501;
}
.search-status {
  padding: 14px 12px;
  font-size: 13px;
  color: #969799;
  text-align: center;
}
.search-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid #f5f6f7;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.search-item:last-child {
  border-bottom: 0;
}
.search-item:active {
  background: #f7f8fa;
}
.search-item-icon {
  color: #ff6a00;
  margin-top: 2px;
  flex-shrink: 0;
}
.search-item-text {
  font-size: 13px;
  color: #323233;
  line-height: 1.4;
}
.map-container {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 260px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
  background: #f5f5f5;
}
.map-container :deep(.leaflet-container) {
  z-index: 1;
  width: 100%;
  height: 100%;
}
.map-hint {
  font-size: 12px;
  color: #969799;
  margin-top: 4px;
}
.landmark-section {
  margin: 12px 16px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
}
.landmark-title {
  font-size: 14px;
  font-weight: 600;
  color: #323233;
}
.landmark-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #969799;
  line-height: 1.4;
}
.landmark-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.landmark-preview {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
}
.landmark-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.landmark-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.landmark-add {
  width: 96px;
  height: 96px;
  border: 1px dashed #dcdee0;
  border-radius: 8px;
  background: #fafafa;
  color: #969799;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}
.landmark-add:disabled {
  opacity: 0.6;
}
.file-hidden {
  display: none;
}
</style>
