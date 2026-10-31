<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const props = withDefaults(
  defineProps<{
    lat: number | null;
    lng: number | null;
    radiusKm: number;
  }>(),
  {
    lat: null,
    lng: null,
    radiusKm: 5,
  },
);

const emit = defineEmits<{
  'update:lat': [number];
  'update:lng': [number];
}>();

const { t } = useI18n();
const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;
let circle: L.Circle | null = null;
let resizeObserver: ResizeObserver | null = null;
const sizeTimers: ReturnType<typeof setTimeout>[] = [];

/** 默认：胡志明省 Thủ Dầu Một 餐厅附近 */
const FALLBACK = { lat: 10.9742806, lng: 106.6272538 };

function center() {
  return {
    lat: props.lat != null && Number.isFinite(props.lat) ? Number(props.lat) : FALLBACK.lat,
    lng: props.lng != null && Number.isFinite(props.lng) ? Number(props.lng) : FALLBACK.lng,
  };
}

function radiusMeters() {
  const km = Number(props.radiusKm);
  return Math.max(0.1, Number.isFinite(km) ? km : 5) * 1000;
}

/** 容器尺寸变化后必须 invalidate，否则只渲染左上角一块瓦片 */
function refreshSize(fit = false) {
  if (!map) return;
  map.invalidateSize(true);
  if (fit && circle) {
    map.fitBounds(circle.getBounds(), { padding: [28, 28] });
  }
}

function scheduleRefresh() {
  for (const ms of [0, 50, 150, 300, 600]) {
    sizeTimers.push(
      setTimeout(() => {
        refreshSize(ms === 150);
      }, ms),
    );
  }
}

function syncCircle() {
  if (!map) return;
  const c = center();
  if (!circle) {
    circle = L.circle([c.lat, c.lng], {
      radius: radiusMeters(),
      color: '#ee0a24',
      weight: 2,
      fillColor: '#ee0a24',
      fillOpacity: 0.12,
    }).addTo(map);
  } else {
    circle.setLatLng([c.lat, c.lng]);
    circle.setRadius(radiusMeters());
  }
}

function syncMarker() {
  if (!map) return;
  const c = center();
  if (!marker) {
    marker = L.marker([c.lat, c.lng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const ll = marker!.getLatLng();
      emit('update:lat', Number(ll.lat.toFixed(7)));
      emit('update:lng', Number(ll.lng.toFixed(7)));
    });
  } else {
    marker.setLatLng([c.lat, c.lng]);
  }
  syncCircle();
}

function fitZone() {
  refreshSize(true);
}

function setFromMap(lat: number, lng: number) {
  emit('update:lat', Number(lat.toFixed(7)));
  emit('update:lng', Number(lng.toFixed(7)));
}

onMounted(async () => {
  await nextTick();
  if (!mapEl.value) return;
  const c = center();
  map = L.map(mapEl.value, { fadeAnimation: false }).setView([c.lat, c.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
  map.on('click', (e: L.LeafletMouseEvent) => {
    setFromMap(e.latlng.lat, e.latlng.lng);
  });
  syncMarker();
  if (props.lat == null || props.lng == null) {
    setFromMap(c.lat, c.lng);
  }
  scheduleRefresh();

  if (typeof ResizeObserver !== 'undefined' && mapEl.value) {
    resizeObserver = new ResizeObserver(() => refreshSize(false));
    resizeObserver.observe(mapEl.value);
  }
  window.addEventListener('resize', onWinResize);
});

function onWinResize() {
  refreshSize(false);
}

onUnmounted(() => {
  window.removeEventListener('resize', onWinResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  for (const t of sizeTimers) clearTimeout(t);
  sizeTimers.length = 0;
  map?.remove();
  map = null;
  marker = null;
  circle = null;
});

watch(
  () => [props.lat, props.lng, props.radiusKm] as const,
  () => {
    syncMarker();
    refreshSize(false);
  },
);
</script>

<template>
  <div class="zone-map">
    <p class="zone-hint">{{ t('settings.deliveryZoneHint') }}</p>
    <div ref="mapEl" class="zone-map-el" />
    <div class="zone-toolbar">
      <span class="zone-meta">
        {{ t('settings.deliveryZoneMeta', { km: radiusKm || 0 }) }}
      </span>
      <el-button size="small" @click="fitZone">{{ t('settings.deliveryZoneFit') }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.zone-map {
  width: 100%;
  max-width: 720px;
}
.zone-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
.zone-map-el {
  width: 100%;
  height: 360px;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  overflow: hidden;
  background: #f5f5f5;
}
.zone-map-el :deep(.leaflet-container) {
  width: 100%;
  height: 100%;
}
.zone-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 12px;
}
.zone-meta {
  font-size: 12px;
  color: #606266;
}
</style>
