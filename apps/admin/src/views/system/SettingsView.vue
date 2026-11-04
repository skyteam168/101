<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  createNoticeApi,
  deleteNoticeApi,
  getStoreSettingsApi,
  listNoticesApi,
  pushMessageApi,
  updateNoticeApi,
  updateStoreSettingsApi,
  uploadStoreImageApi,
  type AiSettings,
  type AnnounceClips,
  type AnnounceSettings,
  type DeliveryFeeRule,
  type EnvGalleryItem,
  type HomeBanner,
  type MailSettings,
  type StoreNotice,
  type StoreSettings,
} from '../../api/store';
import { searchMembersApi, type Member } from '../../api/member';
import { useVoiceAlert } from '../../composables/useVoiceAlert';
import { useBrandStore } from '../../stores/brand';
import DeliveryZoneMap from '../../components/delivery/DeliveryZoneMap.vue';
import { ElMessageBox } from 'element-plus';

const { t } = useI18n();
const { reloadSettings } = useVoiceAlert();
const brandStore = useBrandStore();
const loading = ref(false);
const activeTab = ref('store');
const saving = ref(false);
const pushing = ref(false);

const form = reactive({
  nameZh: '',
  nameVi: '',
  address: '',
  phone: '',
  announceLang: 'zh' as 'zh' | 'vi',
  qrOrderNeedConfirm: false,
  qrAutoOpen: true,
  qrRequirePin: true,
  printSplitItem: false,
  deliveryRadiusKm: 5,
  minOrderAmount: 0,
  lat: null as number | null,
  lng: null as number | null,
  bankTransferQr: '',
  businessDayCutHour: 4,
  businessOpen: '09:00',
  businessClose: '22:00',
  businessPaused: false,
  feeRules: [
    { maxKm: 2, fee: 15000 },
    { maxKm: 5, fee: 25000 },
  ] as DeliveryFeeRule[],
  homeBanners: [] as HomeBanner[],
  storefrontImage: '',
  adminLogo: '',
  envGallery: [] as EnvGalleryItem[],
  aiSettings: {
    enabled: false,
    provider: 'openai',
    apiBase: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  } as AiSettings,
  wifiSsid: '',
  wifiPassword: '',
  announceSettings: {
    dineInNew: true,
    addItem: true,
    deliveryNew: true,
    callWaiter: true,
    requestBill: true,
    orderCancel: true,
    printFailed: true,
    reservationNew: true,
    qrNeedConfirm: true,
    checkout: true,
    chatMessage: true,
  } as AnnounceSettings,
  announceClips: {} as AnnounceClips,
  mailSettings: {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
  } as MailSettings,
});

const pushForm = reactive({
  subject: '',
  content: '',
  emailsText: '',
  memberIds: [] as string[],
});
const members = ref<Member[]>([]);

const notices = ref<StoreNotice[]>([]);
const noticeDialog = ref(false);
const noticeSaving = ref(false);
const editingNoticeId = ref<string | null>(null);
const noticeForm = reactive({
  titleZh: '',
  titleVi: '',
  contentZh: '',
  contentVi: '',
  level: 'info' as 'info' | 'warn' | 'important',
  isActive: true,
  sort: 0,
  expiresAt: '' as string,
});

const keys: (keyof AnnounceSettings)[] = [
  'dineInNew',
  'addItem',
  'qrNeedConfirm',
  'deliveryNew',
  'checkout',
  'reservationNew',
  'chatMessage',
  'callWaiter',
  'requestBill',
  'orderCancel',
  'printFailed',
];

function clipUrl(kind: keyof AnnounceSettings, lang: 'zh' | 'vi') {
  return form.announceClips[kind]?.[lang] || '';
}

async function uploadClip(kind: keyof AnnounceSettings, lang: 'zh' | 'vi', file: File) {
  const res = await uploadStoreImageApi(file);
  if (!form.announceClips[kind]) form.announceClips[kind] = {};
  form.announceClips[kind]![lang] = res.url;
  ElMessage.success(t('settings.clipUploaded'));
  return false;
}

function clearClip(kind: keyof AnnounceSettings, lang: 'zh' | 'vi') {
  if (!form.announceClips[kind]) return;
  delete form.announceClips[kind]![lang];
  if (!form.announceClips[kind]!.zh && !form.announceClips[kind]!.vi) {
    delete form.announceClips[kind];
  }
}

async function loadNotices() {
  notices.value = await listNoticesApi();
}

function openCreateNotice() {
  editingNoticeId.value = null;
  Object.assign(noticeForm, {
    titleZh: '',
    titleVi: '',
    contentZh: '',
    contentVi: '',
    level: 'info',
    isActive: true,
    sort: notices.value.length,
    expiresAt: '',
  });
  noticeDialog.value = true;
}

function openEditNotice(n: StoreNotice) {
  editingNoticeId.value = n.id;
  Object.assign(noticeForm, {
    titleZh: n.titleZh,
    titleVi: n.titleVi,
    contentZh: n.contentZh,
    contentVi: n.contentVi,
    level: (n.level as 'info' | 'warn' | 'important') || 'info',
    isActive: n.isActive,
    sort: n.sort,
    expiresAt: n.expiresAt ? n.expiresAt.slice(0, 16) : '',
  });
  noticeDialog.value = true;
}

async function saveNotice() {
  noticeSaving.value = true;
  try {
    const payload = {
      titleZh: noticeForm.titleZh,
      titleVi: noticeForm.titleVi,
      contentZh: noticeForm.contentZh,
      contentVi: noticeForm.contentVi,
      level: noticeForm.level,
      isActive: noticeForm.isActive,
      sort: noticeForm.sort,
      expiresAt: noticeForm.expiresAt ? new Date(noticeForm.expiresAt).toISOString() : null,
    };
    if (editingNoticeId.value) await updateNoticeApi(editingNoticeId.value, payload);
    else await createNoticeApi(payload);
    noticeDialog.value = false;
    await loadNotices();
    ElMessage.success(t('common.saved'));
  } finally {
    noticeSaving.value = false;
  }
}

async function removeNotice(n: StoreNotice) {
  await ElMessageBox.confirm(t('settings.noticeDeleteConfirm'), { type: 'warning' });
  await deleteNoticeApi(n.id);
  await loadNotices();
  ElMessage.success(t('common.saved'));
}

async function load() {
  loading.value = true;
  try {
    const s: StoreSettings = await getStoreSettingsApi();
    form.nameZh = s.nameZh;
    form.nameVi = s.nameVi;
    form.address = s.address || '';
    form.phone = s.phone || '';
    form.announceLang = s.announceLang;
    form.announceClips = { ...(s.announceClips || {}) };
    form.qrOrderNeedConfirm = s.qrOrderNeedConfirm;
    form.qrAutoOpen = s.qrAutoOpen;
    form.qrRequirePin = s.qrRequirePin;
    form.printSplitItem = s.printSplitItem;
    form.deliveryRadiusKm = s.deliveryRadiusKm;
    form.minOrderAmount = s.minOrderAmount;
    form.lat = s.lat;
    form.lng = s.lng;
    form.bankTransferQr = s.bankTransferQr || '';
    form.businessDayCutHour = s.businessDayCutHour ?? 4;
    form.businessOpen = s.businessHours?.open || '09:00';
    form.businessClose = s.businessHours?.close || '22:00';
    form.businessPaused = !!s.businessHours?.paused;
    form.feeRules = (s.deliveryFeeRules || []).map((r) => ({
      maxKm: Number(r.maxKm) || 0,
      fee: Number(r.fee) || 0,
    }));
    form.homeBanners = (s.homeBanners || []).map((b) => ({
      image: b.image,
      link: b.link || '',
      titleZh: b.titleZh || '',
      titleVi: b.titleVi || '',
    }));
    form.storefrontImage = s.storefrontImage || '';
    form.adminLogo = s.adminLogo || '';
    form.envGallery = (s.envGallery || []).map((g) => ({
      image: g.image,
      captionZh: g.captionZh || '',
      captionVi: g.captionVi || '',
    }));
    Object.assign(form.aiSettings, s.aiSettings || {});
    Object.assign(
      form.announceSettings,
      { qrNeedConfirm: true, checkout: true, chatMessage: true },
      s.announceSettings || {},
    );
    Object.assign(form.mailSettings, s.mailSettings || {});
    form.wifiSsid = s.guestWifi?.ssid || '';
    form.wifiPassword = s.guestWifi?.password || '';
    await loadNotices();
  } finally {
    loading.value = false;
  }
}

async function onUploadStorefront(file: File) {
  try {
    const { url } = await uploadStoreImageApi(file);
    form.storefrontImage = url;
    ElMessage.success(t('common.saved'));
  } catch {
    /* http 已提示 */
  }
  return false;
}

async function onUploadAdminLogo(file: File) {
  try {
    const { url } = await uploadStoreImageApi(file);
    form.adminLogo = url;
    ElMessage.success(t('common.saved'));
  } catch {
    /* http 已提示 */
  }
  return false;
}

const PAGE_LINKS = ['', '/shop', '/reserve', '/group-meal', '/shop/coupons'];

function bannerLinkSelect(link?: string) {
  if (!link) return '';
  return PAGE_LINKS.includes(link) ? link : 'custom';
}

function setBannerLink(banner: HomeBanner, value: string) {
  if (value === 'custom') {
    if (bannerLinkSelect(banner.link) !== 'custom') banner.link = 'https://';
    return;
  }
  banner.link = value;
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1) {
  const next = index + dir;
  if (next < 0 || next >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item!);
}

async function onUploadEnv(file: File) {
  try {
    const { url } = await uploadStoreImageApi(file);
    form.envGallery.push({ image: url, captionZh: '', captionVi: '' });
    ElMessage.success(t('settings.uploadedHint'));
  } catch {
    /* http 已提示 */
  }
  return false;
}

async function onUploadBanner(file: File) {
  try {
    const { url } = await uploadStoreImageApi(file);
    form.homeBanners.push({ image: url, link: '/shop', titleZh: '', titleVi: '' });
    ElMessage.success(t('settings.uploadedHint'));
  } catch {
    /* http 已提示 */
  }
  return false;
}

async function replaceImage(file: File, assign: (url: string) => void) {
  try {
    const { url } = await uploadStoreImageApi(file);
    assign(url);
    ElMessage.success(t('settings.uploadedHint'));
  } catch {
    /* http 已提示 */
  }
  return false;
}

async function onUploadBankQr(file: File) {
  return replaceImage(file, (url) => {
    form.bankTransferQr = url;
  });
}

async function save() {
  const deliveryFeeRules = form.feeRules
    .filter((r) => Number(r.maxKm) > 0)
    .map((r) => ({ maxKm: Number(r.maxKm), fee: Math.max(0, Math.round(Number(r.fee) || 0)) }))
    .sort((a, b) => a.maxKm - b.maxKm);
  const homeBanners = form.homeBanners
    .filter((b) => b.image)
    .map((b) => ({
      image: b.image,
      link: b.link || undefined,
      titleZh: b.titleZh || undefined,
      titleVi: b.titleVi || undefined,
    }));
  const envGallery = form.envGallery
    .filter((g) => g.image)
    .map((g) => ({
      image: g.image,
      captionZh: g.captionZh || undefined,
      captionVi: g.captionVi || undefined,
    }));
  saving.value = true;
  try {
    await updateStoreSettingsApi({
      nameZh: form.nameZh,
      nameVi: form.nameVi,
      address: form.address,
      phone: form.phone,
      announceLang: form.announceLang,
      qrOrderNeedConfirm: form.qrOrderNeedConfirm,
      qrAutoOpen: form.qrAutoOpen,
      qrRequirePin: form.qrRequirePin,
      printSplitItem: form.printSplitItem,
      announceSettings: { ...form.announceSettings },
      announceClips: { ...form.announceClips },
      deliveryRadiusKm: form.deliveryRadiusKm,
      minOrderAmount: form.minOrderAmount,
      lat: form.lat,
      lng: form.lng,
      bankTransferQr: form.bankTransferQr || null,
      businessDayCutHour: form.businessDayCutHour,
      businessHours: {
        open: form.businessOpen,
        close: form.businessClose,
        days: [0, 1, 2, 3, 4, 5, 6],
        paused: form.businessPaused,
      },
      deliveryFeeRules,
      mailSettings: { ...form.mailSettings },
      homeBanners,
      storefrontImage: form.storefrontImage || null,
      adminLogo: form.adminLogo || null,
      envGallery,
      aiSettings: { ...form.aiSettings },
      guestWifi: { ssid: form.wifiSsid, password: form.wifiPassword },
    });
    await reloadSettings();
    await brandStore.fetchBrand();
    ElMessage.success(t('common.saved'));
  } finally {
    saving.value = false;
  }
}

async function searchMembers(q: string) {
  members.value = await searchMembersApi(q || undefined);
}

async function doPush() {
  const emails = pushForm.emailsText
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!emails.length && !pushForm.memberIds.length) {
    ElMessage.warning(t('settings.pushNeedTarget'));
    return;
  }
  if (!pushForm.subject || !pushForm.content) {
    ElMessage.warning(t('settings.pushNeedContent'));
    return;
  }
  pushing.value = true;
  try {
    const res = await pushMessageApi({
      emails,
      customerIds: pushForm.memberIds,
      subject: pushForm.subject,
      content: pushForm.content,
    });
    ElMessage.success(t('settings.pushSent', { n: res.sent }));
  } finally {
    pushing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <h3>{{ t('settings.title') }}</h3>
      <p class="sub">{{ t('settings.subtitle') }}</p>
    </div>

    <el-tabs v-model="activeTab" class="tabs">
      <el-tab-pane :label="t('settings.tabStore')" name="store" />
      <el-tab-pane :label="t('settings.tabCashier')" name="cashier" />
      <el-tab-pane :label="t('settings.tabDelivery')" name="delivery" />
      <el-tab-pane :label="t('settings.tabVoice')" name="voice" />
      <el-tab-pane :label="t('settings.tabNotice')" name="notice" />
      <el-tab-pane :label="t('settings.tabMail')" name="mail" />
      <el-tab-pane :label="t('settings.tabPush')" name="push" />
      <el-tab-pane :label="t('settings.tabAi')" name="ai" />
    </el-tabs>

    <div v-show="activeTab === 'store'" class="panel">
      <h4>{{ t('settings.basic') }}</h4>
      <p class="hint">{{ t('settings.basicHint') }}</p>
      <el-form label-width="140px" style="max-width: 860px">
        <el-form-item :label="t('settings.nameZh')">
          <el-input v-model="form.nameZh" :placeholder="t('settings.nameBrandPh')" />
        </el-form-item>
        <el-form-item :label="t('settings.nameVi')">
          <el-input v-model="form.nameVi" :placeholder="t('settings.nameBrandPh')" />
        </el-form-item>
        <el-form-item :label="t('settings.adminLogo')">
          <div class="upload-row">
            <el-input v-model="form.adminLogo" :placeholder="t('settings.adminLogoPh')" />
            <el-upload :show-file-list="false" accept="image/*" :before-upload="onUploadAdminLogo">
              <el-button>{{ t('settings.upload') }}</el-button>
            </el-upload>
          </div>
          <img v-if="form.adminLogo" :src="form.adminLogo" class="preview preview-logo" alt="" />
          <p class="hint">{{ t('settings.adminLogoHint') }}</p>
        </el-form-item>
        <el-form-item :label="t('settings.address')"><el-input v-model="form.address" /></el-form-item>
        <el-form-item :label="t('settings.phone')"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item :label="t('settings.wifiSsid')">
          <el-input v-model="form.wifiSsid" :placeholder="t('settings.wifiSsidPh')" />
        </el-form-item>
        <el-form-item :label="t('settings.wifiPassword')">
          <el-input v-model="form.wifiPassword" :placeholder="t('settings.wifiPasswordPh')" show-password />
        </el-form-item>
        <p class="hint wifi-hint">{{ t('settings.wifiHint') }}</p>
        <el-form-item :label="t('settings.storefrontImage')">
          <div class="upload-row">
            <el-input v-model="form.storefrontImage" :placeholder="t('settings.storefrontImagePh')" />
            <el-upload :show-file-list="false" accept="image/*" :before-upload="onUploadStorefront">
              <el-button>{{ t('settings.upload') }}</el-button>
            </el-upload>
          </div>
          <img v-if="form.storefrontImage" :src="form.storefrontImage" class="preview" alt="" />
        </el-form-item>
        <el-form-item :label="t('settings.envGallery')">
          <p class="hint">{{ t('settings.envGalleryHint') }}</p>
          <div v-for="(item, i) in form.envGallery" :key="item.image + i" class="media-card">
            <img :src="item.image" alt="" />
            <div class="media-fields">
              <el-input v-model="item.captionZh" :placeholder="t('settings.captionZh')" />
              <el-input v-model="item.captionVi" :placeholder="t('settings.captionVi')" />
              <div class="media-actions">
                <el-button size="small" :disabled="i === 0" @click="moveItem(form.envGallery, i, -1)">
                  {{ t('settings.moveUp') }}
                </el-button>
                <el-button
                  size="small"
                  :disabled="i === form.envGallery.length - 1"
                  @click="moveItem(form.envGallery, i, 1)"
                >
                  {{ t('settings.moveDown') }}
                </el-button>
                <el-button size="small" type="danger" plain @click="form.envGallery.splice(i, 1)">
                  {{ t('common.delete') }}
                </el-button>
              </div>
            </div>
          </div>
          <el-upload :show-file-list="false" accept="image/*" :before-upload="onUploadEnv">
            <el-button>{{ t('settings.addPhoto') }}</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item :label="t('settings.homeBanners')">
          <p class="hint">{{ t('settings.homeBannersHint') }}</p>
          <div v-for="(item, i) in form.homeBanners" :key="item.image + i" class="media-card">
            <img :src="item.image" alt="" />
            <div class="media-fields">
              <el-input v-model="item.titleZh" :placeholder="t('settings.bannerTitleZh')" />
              <el-input v-model="item.titleVi" :placeholder="t('settings.bannerTitleVi')" />
              <el-select
                :model-value="bannerLinkSelect(item.link)"
                @change="(v: string) => setBannerLink(item, v)"
              >
                <el-option value="" :label="t('settings.linkNone')" />
                <el-option value="/shop" :label="t('settings.linkMenu')" />
                <el-option value="/reserve" :label="t('settings.linkReserve')" />
                <el-option value="/group-meal" :label="t('settings.linkGroup')" />
                <el-option value="/shop/coupons" :label="t('settings.linkCoupons')" />
                <el-option value="custom" :label="t('settings.linkCustom')" />
              </el-select>
              <el-input
                v-if="bannerLinkSelect(item.link) === 'custom'"
                v-model="item.link"
                :placeholder="t('settings.linkCustomPh')"
              />
              <div class="media-actions">
                <el-upload
                  :show-file-list="false"
                  accept="image/*"
                  :before-upload="(f: File) => replaceImage(f, (url) => (item.image = url))"
                >
                  <el-button size="small">{{ t('settings.replaceImage') }}</el-button>
                </el-upload>
                <el-button size="small" :disabled="i === 0" @click="moveItem(form.homeBanners, i, -1)">
                  {{ t('settings.moveUp') }}
                </el-button>
                <el-button
                  size="small"
                  :disabled="i === form.homeBanners.length - 1"
                  @click="moveItem(form.homeBanners, i, 1)"
                >
                  {{ t('settings.moveDown') }}
                </el-button>
                <el-button size="small" type="danger" plain @click="form.homeBanners.splice(i, 1)">
                  {{ t('common.delete') }}
                </el-button>
              </div>
            </div>
          </div>
          <el-upload :show-file-list="false" accept="image/*" :before-upload="onUploadBanner">
            <el-button>{{ t('settings.addBanner') }}</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'ai'" class="panel">
      <h4>{{ t('settings.tabAi') }}</h4>
      <p class="hint">{{ t('settings.aiHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.aiEnabled')">
          <el-switch v-model="form.aiSettings.enabled" />
        </el-form-item>
        <el-form-item :label="t('settings.aiProvider')">
          <el-input v-model="form.aiSettings.provider" placeholder="openai / custom" />
        </el-form-item>
        <el-form-item :label="t('settings.aiApiBase')">
          <el-input v-model="form.aiSettings.apiBase" placeholder="https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item :label="t('settings.aiApiKey')">
          <el-input
            v-model="form.aiSettings.apiKey"
            type="password"
            show-password
            :placeholder="t('settings.aiApiKeyPh')"
          />
        </el-form-item>
        <el-form-item :label="t('settings.aiModel')">
          <el-input v-model="form.aiSettings.model" placeholder="gpt-4o-mini" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'cashier'" class="panel">
      <h4>{{ t('settings.tabCashier') }}</h4>
      <p class="hint">{{ t('settings.cashierHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.qrAutoOpen')"><el-switch v-model="form.qrAutoOpen" /></el-form-item>
        <el-form-item :label="t('settings.qrRequirePin')"><el-switch v-model="form.qrRequirePin" /></el-form-item>
        <el-form-item :label="t('settings.qrNeedConfirm')"><el-switch v-model="form.qrOrderNeedConfirm" /></el-form-item>
        <el-form-item :label="t('settings.printSplitItem')"><el-switch v-model="form.printSplitItem" /></el-form-item>
        <el-form-item :label="t('settings.businessDayCutHour')">
          <el-input-number v-model="form.businessDayCutHour" :min="0" :max="23" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'delivery'" class="panel">
      <h4>{{ t('settings.delivery') }}</h4>
      <el-form label-width="168px" style="max-width: 860px">
        <el-form-item :label="t('settings.businessOpen')">
          <el-input v-model="form.businessOpen" style="width: 120px" placeholder="09:00" />
          <span style="margin: 0 8px">-</span>
          <el-input v-model="form.businessClose" style="width: 120px" placeholder="22:00" />
        </el-form-item>
        <el-form-item :label="t('settings.businessPaused')">
          <el-switch v-model="form.businessPaused" />
          <span class="form-hint">{{ t('settings.businessPausedHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('settings.minOrderAmount')">
          <el-input-number v-model="form.minOrderAmount" :min="0" :step="1000" />
        </el-form-item>
        <el-form-item :label="t('settings.deliveryRadiusKm')">
          <el-input-number v-model="form.deliveryRadiusKm" :min="0.5" :max="50" :step="0.5" />
        </el-form-item>
        <el-form-item :label="t('settings.deliveryZone')">
          <!-- v-if：仅在外卖 Tab 可见时挂载，避免 Leaflet 在 display:none 下半屏瓦片 -->
          <DeliveryZoneMap
            v-if="activeTab === 'delivery'"
            v-model:lat="form.lat"
            v-model:lng="form.lng"
            :radius-km="form.deliveryRadiusKm"
          />
        </el-form-item>
        <el-form-item :label="t('settings.storeLat')">
          <el-input-number v-model="form.lat" :step="0.0001" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('settings.storeLng')">
          <el-input-number v-model="form.lng" :step="0.0001" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('settings.feeRules')">
          <p class="hint">{{ t('settings.feeRulesHint') }}</p>
          <div v-for="(rule, i) in form.feeRules" :key="i" class="fee-row">
            <span>{{ t('settings.feeWithin') }}</span>
            <el-input-number v-model="rule.maxKm" :min="0.1" :step="0.5" :precision="1" />
            <span>km</span>
            <span>{{ t('settings.feeAmount') }}</span>
            <el-input-number v-model="rule.fee" :min="0" :step="1000" />
            <el-button size="small" type="danger" plain @click="form.feeRules.splice(i, 1)">
              {{ t('common.delete') }}
            </el-button>
          </div>
          <el-button @click="form.feeRules.push({ maxKm: 3, fee: 20000 })">
            {{ t('settings.addFeeRule') }}
          </el-button>
        </el-form-item>
        <el-form-item :label="t('settings.bankTransferQr')">
          <div class="upload-row">
            <el-input v-model="form.bankTransferQr" :placeholder="t('settings.bankTransferQrPh')" />
            <el-upload :show-file-list="false" accept="image/*" :before-upload="onUploadBankQr">
              <el-button>{{ t('settings.upload') }}</el-button>
            </el-upload>
          </div>
          <img v-if="form.bankTransferQr" :src="form.bankTransferQr" class="preview" alt="" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'voice'" class="panel">
      <h4>{{ t('settings.voice') }}</h4>
      <p class="hint">{{ t('settings.voiceHint') }}</p>
      <el-form label-width="150px" style="max-width: 860px">
        <el-form-item :label="t('settings.announceLang')">
          <el-radio-group v-model="form.announceLang">
            <el-radio label="zh">中文</el-radio>
            <el-radio label="vi">Tiếng Việt</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-for="k in keys" :key="k" :label="t(`settings.announce.${k}`)">
          <div class="voice-row">
            <el-switch v-model="form.announceSettings[k]" />
            <div class="clip-pair">
              <div class="clip-line">
                <span class="clip-lang">ZH</span>
                <audio v-if="clipUrl(k, 'zh')" :src="clipUrl(k, 'zh')" controls preload="none" />
                <el-upload
                  :show-file-list="false"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg"
                  :before-upload="(f: File) => uploadClip(k, 'zh', f)"
                >
                  <el-button size="small">{{ t('settings.clipUpload') }}</el-button>
                </el-upload>
                <el-button
                  v-if="clipUrl(k, 'zh')"
                  size="small"
                  text
                  type="danger"
                  @click="clearClip(k, 'zh')"
                >
                  {{ t('settings.clipClear') }}
                </el-button>
              </div>
              <div class="clip-line">
                <span class="clip-lang">VI</span>
                <audio v-if="clipUrl(k, 'vi')" :src="clipUrl(k, 'vi')" controls preload="none" />
                <el-upload
                  :show-file-list="false"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg"
                  :before-upload="(f: File) => uploadClip(k, 'vi', f)"
                >
                  <el-button size="small">{{ t('settings.clipUpload') }}</el-button>
                </el-upload>
                <el-button
                  v-if="clipUrl(k, 'vi')"
                  size="small"
                  text
                  type="danger"
                  @click="clearClip(k, 'vi')"
                >
                  {{ t('settings.clipClear') }}
                </el-button>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'notice'" class="panel">
      <div class="notice-head">
        <div>
          <h4>{{ t('settings.noticeTitle') }}</h4>
          <p class="hint">{{ t('settings.noticeHint') }}</p>
        </div>
        <el-button type="primary" @click="openCreateNotice">{{ t('settings.noticeAdd') }}</el-button>
      </div>
      <el-table :data="notices" stripe empty-text="-">
        <el-table-column prop="sort" :label="t('settings.noticeSort')" width="70" />
        <el-table-column :label="t('settings.noticeTitleZh')" min-width="140">
          <template #default="{ row }">{{ row.titleZh }}</template>
        </el-table-column>
        <el-table-column :label="t('settings.noticeLevel')" width="100">
          <template #default="{ row }">
            {{ t(`settings.noticeLevel${row.level === 'warn' ? 'Warn' : row.level === 'important' ? 'Important' : 'Info'}`) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.noticeActive')" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? t('common.yes') : t('common.no') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditNotice(row)">{{ t('common.edit') }}</el-button>
            <el-button link type="danger" @click="removeNotice(row)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog
        v-model="noticeDialog"
        :title="editingNoticeId ? t('settings.noticeEdit') : t('settings.noticeAdd')"
        width="560px"
      >
        <el-form label-width="120px">
          <el-form-item :label="t('settings.noticeTitleZh')">
            <el-input v-model="noticeForm.titleZh" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeTitleVi')">
            <el-input v-model="noticeForm.titleVi" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeContentZh')">
            <el-input v-model="noticeForm.contentZh" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeContentVi')">
            <el-input v-model="noticeForm.contentVi" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeLevel')">
            <el-radio-group v-model="noticeForm.level">
              <el-radio label="info">{{ t('settings.noticeLevelInfo') }}</el-radio>
              <el-radio label="warn">{{ t('settings.noticeLevelWarn') }}</el-radio>
              <el-radio label="important">{{ t('settings.noticeLevelImportant') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('settings.noticeActive')">
            <el-switch v-model="noticeForm.isActive" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeSort')">
            <el-input-number v-model="noticeForm.sort" :min="0" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeExpires')">
            <el-input v-model="noticeForm.expiresAt" type="datetime-local" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="noticeDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="noticeSaving" @click="saveNotice">
            {{ t('common.save') }}
          </el-button>
        </template>
      </el-dialog>
    </div>

    <div v-show="activeTab === 'mail'" class="panel">
      <h4>{{ t('settings.mailTitle') }}</h4>
      <p class="hint">{{ t('settings.mailHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.mailEnabled')">
          <el-switch v-model="form.mailSettings.enabled" />
        </el-form-item>
        <el-form-item label="SMTP Host">
          <el-input v-model="form.mailSettings.host" placeholder="smtp.example.com" />
        </el-form-item>
        <el-form-item label="Port">
          <el-input-number v-model="form.mailSettings.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item :label="t('settings.mailSecure')">
          <el-switch v-model="form.mailSettings.secure" />
        </el-form-item>
        <el-form-item :label="t('settings.mailUser')">
          <el-input v-model="form.mailSettings.user" />
        </el-form-item>
        <el-form-item :label="t('settings.mailPass')">
          <el-input v-model="form.mailSettings.pass" type="password" show-password placeholder="********" />
        </el-form-item>
        <el-form-item :label="t('settings.mailFrom')">
          <el-input v-model="form.mailSettings.from" placeholder="noreply@example.com" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'push'" class="panel">
      <h4>{{ t('settings.pushTitle') }}</h4>
      <p class="hint">{{ t('settings.pushHint') }}</p>
      <el-form label-width="140px" style="max-width: 720px">
        <el-form-item :label="t('settings.pushEmails')">
          <el-input
            v-model="pushForm.emailsText"
            type="textarea"
            :rows="2"
            :placeholder="t('settings.pushEmailsPh')"
          />
        </el-form-item>
        <el-form-item :label="t('settings.pushMembers')">
          <el-select
            v-model="pushForm.memberIds"
            multiple
            filterable
            remote
            :remote-method="searchMembers"
            style="width: 100%"
            :placeholder="t('cashier.selectMember')"
          >
            <el-option
              v-for="m in members"
              :key="m.id"
              :label="`${m.name || m.email} · ${m.email}`"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('settings.pushSubject')">
          <el-input v-model="pushForm.subject" />
        </el-form-item>
        <el-form-item :label="t('settings.pushContent')">
          <el-input v-model="pushForm.content" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="pushing" @click="doPush">
            {{ t('settings.pushSend') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 32px; }
.head h3 { margin: 0; }
.sub { margin: 4px 0 12px; color: #888; font-size: 13px; }
.tabs :deep(.el-tabs__item.is-active) { color: #e6a23c; }
.tabs :deep(.el-tabs__active-bar) { background: #e6a23c; }
.panel {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 16px 18px 8px;
}
.panel h4 { margin: 0 0 4px; }
.hint { margin: 0 0 16px; color: #888; font-size: 13px; }
.wifi-hint { margin: -8px 0 16px 140px; }
.form-hint { margin-left: 12px; color: #909399; font-size: 12px; }
.notice-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.notice-head .hint { margin-bottom: 0; }
.upload-row {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: center;
}
.preview {
  margin-top: 8px;
  max-width: 220px;
  max-height: 140px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}
.preview-logo {
  max-width: 64px;
  max-height: 64px;
  border-radius: 12px;
}
.media-card {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 10px;
  background: #fafafa;
}
.media-card img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: #eee;
}
.media-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.media-actions,
.fee-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.fee-row { margin-bottom: 8px; }
.voice-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.clip-pair {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.clip-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.clip-lang {
  width: 28px;
  font-size: 12px;
  color: #909399;
  font-weight: 600;
}
.clip-line audio {
  height: 32px;
  max-width: 220px;
}
</style>
