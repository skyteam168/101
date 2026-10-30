<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import { useCartStore, type CartItem } from '../../stores/cart';
import { getCustomerToken } from '../../utils/customer-storage';

const { t, locale } = useI18n();
const router = useRouter();
const cart = useCartStore();

const loc = () => (String(locale.value).startsWith('vi') ? 'vi' : 'zh');

function itemName(item: CartItem) {
  return localeField(item as unknown as Record<string, unknown>, 'name', loc());
}

function onQtyChange(item: CartItem, v: number | string) {
  const target = Number(v);
  if (target <= 0) {
    cart.removeAll(item.dishId, item.optionLabel);
    return;
  }
  const diff = target - item.qty;
  if (diff > 0) {
    cart.add({
      dishId: item.dishId,
      nameZh: item.nameZh,
      nameVi: item.nameVi,
      price: item.price,
      optionIds: item.optionIds,
      optionLabel: item.optionLabel,
      qty: diff,
    });
  } else {
    for (let i = 0; i < -diff; i++) cart.remove(item.dishId, item.optionLabel);
  }
}

function goShop() {
  router.push({ name: 'shop' });
}

function goCheckout() {
  if (cart.totalQty <= 0) {
    showToast(t('home.cartEmpty'));
    return;
  }
  if (!getCustomerToken()) {
    router.push({ name: 'shop-login', query: { redirect: '/shop/checkout' } });
    return;
  }
  router.push({ name: 'shop-checkout' });
}
</script>

<template>
  <div class="cart-page">
    <van-nav-bar :title="t('shop.cart.title')" />

    <van-empty v-if="cart.totalQty === 0" :description="t('home.cartEmpty')">
      <van-button type="primary" round color="#ff6a00" @click="goShop">
        {{ t('shop.cart.goMenu') }}
      </van-button>
    </van-empty>

    <template v-else>
      <div class="cart-list">
        <div v-for="item in cart.items" :key="`${item.dishId}-${item.optionLabel || ''}`" class="cart-item">
          <div class="item-info">
            <div class="item-name">{{ itemName(item) }}</div>
            <div v-if="item.optionLabel" class="item-opt">{{ item.optionLabel }}</div>
            <div class="item-price">{{ formatVND(item.price) }}</div>
          </div>
          <van-stepper :model-value="item.qty" :min="0" integer @change="(v) => onQtyChange(item, v)" />
        </div>
      </div>

      <div class="cart-footer">
        <div class="sum">
          <span>{{ t('shop.cart.total') }}</span>
          <strong>{{ formatVND(cart.totalAmount) }}</strong>
        </div>
        <van-button type="primary" round color="#ff6a00" @click="goCheckout">
          {{ t('shop.goCheckout') }}
        </van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cart-page {
  min-height: calc(100vh - 50px);
  background: #f7f8fa;
  padding-bottom: 80px;
}
.cart-list {
  margin: 12px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}
.cart-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.cart-item:last-child {
  border-bottom: none;
}
.item-name {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}
.item-opt {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.item-price {
  margin-top: 6px;
  color: #ff6a00;
  font-weight: 700;
  font-size: 14px;
}
.cart-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
  z-index: 10;
}
.sum {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: #6b7280;
}
.sum strong {
  margin-top: 2px;
  font-size: 18px;
  color: #ff6a00;
}
</style>
