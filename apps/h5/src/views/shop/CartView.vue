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
    <header class="page-head">
      <h1>{{ t('shop.cart.title') }}</h1>
      <span v-if="cart.totalQty" class="count">{{ cart.totalQty }}</span>
    </header>

    <div class="cart-body">
      <van-empty v-if="cart.totalQty === 0" :description="t('home.cartEmpty')">
        <van-button type="primary" round color="#ff6a00" @click="goShop">
          {{ t('shop.cart.goMenu') }}
        </van-button>
      </van-empty>

      <div v-else class="cart-list">
        <div v-for="item in cart.items" :key="`${item.dishId}-${item.optionLabel || ''}`" class="cart-item">
          <div class="item-info">
            <div class="item-name">{{ itemName(item) }}</div>
            <div v-if="item.optionLabel" class="item-opt">{{ item.optionLabel }}</div>
            <div class="item-price">{{ formatVND(item.price) }}</div>
          </div>
          <van-stepper
            :model-value="item.qty"
            :min="0"
            theme="round"
            integer
            button-size="28px"
            @change="(v) => onQtyChange(item, v)"
          />
        </div>
      </div>
    </div>

    <footer v-if="cart.totalQty" class="cart-footer">
      <div class="sum">
        <span>{{ t('shop.cart.total') }}</span>
        <strong>{{ formatVND(cart.totalAmount) }}</strong>
      </div>
      <button type="button" class="checkout" @click="goCheckout">
        {{ t('shop.goCheckout') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.cart-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f6f7f9;
}
.page-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 8px;
  background: #f6f7f9;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #1c1917;
}
.count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ff6a00;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cart-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 16px 16px;
}
.cart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cart-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.04);
}
.item-info {
  min-width: 0;
  flex: 1;
}
.item-name {
  font-size: 15px;
  font-weight: 700;
  color: #1c1917;
}
.item-opt {
  font-size: 12px;
  color: #a8a29e;
  margin-top: 2px;
}
.cart-item :deep(.van-stepper--round .van-stepper__minus),
.cart-item :deep(.van-stepper--round .van-stepper__plus) {
  box-sizing: border-box;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border-radius: 50% !important;
  flex-shrink: 0;
}
.cart-item :deep(.van-stepper--round .van-stepper__plus) {
  background: #ff6a00;
  color: #fff;
  border: none;
}
.cart-item :deep(.van-stepper--round .van-stepper__minus) {
  background: #fff;
  color: #646566;
  border: 1px solid #ebedf0;
}
.item-price {
  margin-top: 6px;
  color: #ea580c;
  font-weight: 800;
  font-size: 14px;
}
.cart-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  box-shadow: 0 -6px 18px rgba(28, 25, 23, 0.05);
}
.sum {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #78716c;
}
.sum strong {
  margin-top: 2px;
  font-size: 18px;
  color: #ea580c;
}
.checkout {
  border: 0;
  height: 44px;
  padding: 0 22px;
  border-radius: 999px;
  background: #ff6a00;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}
</style>
