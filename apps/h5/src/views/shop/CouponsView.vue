<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import {
  claimCoupon,
  listCouponTemplates,
  listMyCoupons,
  type CouponTemplatePublic,
  type MyCoupon,
} from '../../api/delivery';
import { getCustomerToken } from '../../utils/customer-storage';

const { t, locale } = useI18n();
const router = useRouter();

const tab = ref(0);
const templates = ref<CouponTemplatePublic[]>([]);
const mine = ref<MyCoupon[]>([]);
const claiming = ref<string | null>(null);

const loc = computed(() => (String(locale.value).startsWith('vi') ? 'vi' : 'zh'));

function tplName(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

function valueText(row: { type: string; value: number }) {
  if (row.type === 'percent') return `${row.value}%`;
  return formatVND(row.value);
}

async function loadTemplates() {
  templates.value = await listCouponTemplates().catch(() => []);
}

async function loadMine() {
  if (!getCustomerToken()) {
    mine.value = [];
    return;
  }
  mine.value = await listMyCoupons().catch(() => []);
}

async function onClaim(id: string) {
  if (!getCustomerToken()) {
    router.push({ name: 'shop-login', query: { redirect: '/shop/coupons' } });
    return;
  }
  claiming.value = id;
  try {
    await claimCoupon(id);
    showToast(t('shop.coupons.claimed'));
    await Promise.all([loadTemplates(), loadMine()]);
    tab.value = 1;
  } catch {
    // toast by interceptor
  } finally {
    claiming.value = null;
  }
}

onMounted(async () => {
  await Promise.all([loadTemplates(), loadMine()]);
});
</script>

<template>
  <div class="coupons-page">
    <van-nav-bar :title="t('shop.coupons.title')" left-arrow @click-left="router.back()" />
    <van-tabs v-model:active="tab" color="#ff6a00">
      <van-tab :title="t('shop.coupons.claimable')">
        <van-empty v-if="!templates.length" :description="t('shop.coupons.emptyClaim')" />
        <div v-for="tpl in templates" :key="tpl.id" class="coupon-card">
          <div class="left">
            <div class="value">{{ valueText(tpl) }}</div>
            <div class="min">{{ t('shop.coupons.minSpend', { n: formatVND(tpl.minSpend) }) }}</div>
          </div>
          <div class="right">
            <div class="name">{{ tplName(tpl) }}</div>
            <van-button
              size="small"
              round
              color="#ff6a00"
              :loading="claiming === tpl.id"
              @click="onClaim(tpl.id)"
            >
              {{ t('shop.coupons.claim') }}
            </van-button>
          </div>
        </div>
      </van-tab>
      <van-tab :title="t('shop.coupons.mine')">
        <van-empty v-if="!mine.length" :description="t('shop.coupons.emptyMine')" />
        <div v-for="c in mine" :key="c.id" class="coupon-card" :class="c.status">
          <div class="left">
            <div class="value">{{ valueText(c.template) }}</div>
            <div class="min">{{ t('shop.coupons.minSpend', { n: formatVND(c.template.minSpend) }) }}</div>
          </div>
          <div class="right">
            <div class="name">{{ tplName(c.template) }}</div>
            <div class="meta">{{ c.status }} · {{ t('shop.coupons.expires', { d: c.expiresAt.slice(0, 10) }) }}</div>
          </div>
        </div>
      </van-tab>
    </van-tabs>
  </div>
</template>

<style scoped>
.coupons-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.coupon-card {
  margin: 12px 16px;
  background: #fff;
  border-radius: 12px;
  display: flex;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}
.coupon-card.used,
.coupon-card.expired {
  opacity: 0.55;
}
.left {
  width: 110px;
  background: linear-gradient(135deg, #ff9a4d, #ff6a00);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 8px;
  text-align: center;
}
.value {
  font-size: 16px;
  font-weight: 700;
}
.min {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.right {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}
.meta {
  font-size: 12px;
  color: #9ca3af;
}
</style>
