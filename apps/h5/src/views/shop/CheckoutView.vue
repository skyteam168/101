<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND } from '@restaurant/shared';
import {
  getStoreInfo,
  listAddresses,
  listMyCoupons,
  placeOrder,
  quoteOrder,
  type CustomerAddress,
  type MyCoupon,
  type StoreInfo,
} from '../../api/delivery';
import { useCartStore } from '../../stores/cart';

const { t, locale } = useI18n();
const router = useRouter();
const cart = useCartStore();

const addresses = ref<CustomerAddress[]>([]);
const selectedAddressId = ref<string | null>(null);
const payMethod = ref<'cash' | 'bank_transfer'>('cash');
const remark = ref('');
const coupons = ref<MyCoupon[]>([]);
const couponId = ref<string | undefined>();
const quote = ref<{
  distanceKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  subtotalOk: boolean;
  subtotal?: number;
  discount?: number;
  coupon?: { id: string; nameZh: string; amount: number } | null;
  total: number;
} | null>(null);
const quoting = ref(false);
const submitting = ref(false);
const store = ref<StoreInfo | null>(null);
const showAddressPicker = ref(false);

const selectedAddress = computed(() =>
  addresses.value.find((a) => a.id === selectedAddressId.value) ?? null,
);

const emptyCart = computed(() => cart.totalQty === 0);

onMounted(async () => {
  if (emptyCart.value) return;
  try {
    const [addrList, storeInfo, couponList] = await Promise.all([
      listAddresses(),
      getStoreInfo(),
      listMyCoupons().catch(() => [] as MyCoupon[]),
    ]);
    addresses.value = addrList;
    store.value = storeInfo;
    coupons.value = couponList.filter((c) => c.status === 'unused');
    // 默认选第一个/默认地址
    const def = addrList.find((a) => a.isDefault) ?? addrList[0];
    if (def) {
      selectedAddressId.value = def.id;
      await doQuote(def);
    }
  } catch {
    // ignore
  }
});

async function doQuote(addr: CustomerAddress) {
  if (addr.lat == null || addr.lng == null) return;
  quoting.value = true;
  quote.value = null;
  try {
    quote.value = await quoteOrder({
      lat: addr.lat,
      lng: addr.lng,
      subtotal: cart.totalAmount,
      couponId: couponId.value,
    });
  } catch {
    // 券不可用时清空选择，避免带着无效券提交
    if (couponId.value) couponId.value = undefined;
  } finally {
    quoting.value = false;
  }
}

watch(couponId, async () => {
  const addr = selectedAddress.value;
  if (addr) await doQuote(addr);
});

async function selectAddress(addr: CustomerAddress) {
  selectedAddressId.value = addr.id;
  showAddressPicker.value = false;
  await doQuote(addr);
}

const storeOpen = computed(() => store.value?.openNow !== false);
const closedTip = computed(() => {
  if (storeOpen.value) return '';
  if (store.value?.closedReason === 'paused') return t('shop.storePaused');
  const h = store.value?.businessHours;
  if (h?.open && h?.close) return t('shop.storeClosedHours', { hours: `${h.open} - ${h.close}` });
  return t('shop.storeClosed');
});

async function handleSubmit() {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return;
  }
  if (!selectedAddressId.value) {
    showToast(t('shop.checkout.addressRequired'));
    return;
  }
  submitting.value = true;
  try {
    const order = await placeOrder({
      addressId: selectedAddressId.value,
      payMethod: payMethod.value,
      remark: remark.value || undefined,
      couponId: couponId.value,
      items: cart.items.map((i) => ({
        dishId: i.dishId,
        qty: i.qty,
        optionsSnapshot: i.optionsSnapshot,
      })),
    });
    cart.clear();
    showToast(t('shop.checkout.orderPlaced'));
    router.replace({ name: 'shop-order-detail', params: { id: String(order.id) } });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="checkout-page">
    <van-nav-bar
      :title="t('shop.checkout.title')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    />

    <van-empty v-if="emptyCart" :description="t('shop.checkout.emptyCart')">
      <van-button round type="danger" @click="router.replace({ name: 'shop' })">
        {{ t('shop.checkout.goMenu') }}
      </van-button>
    </van-empty>

    <div v-else style="padding-bottom: 70px">
      <!-- 收货地址 -->
      <van-cell-group :title="t('shop.checkout.address')" inset style="margin-top: 12px">
        <van-cell
          v-if="selectedAddress"
          :title="selectedAddress.contactName + '  ' + selectedAddress.phone"
          :label="selectedAddress.addressText + (selectedAddress.detail ? '  ' + selectedAddress.detail : '')"
          is-link
          @click="showAddressPicker = true"
        />
        <van-cell
          v-else
          :title="t('shop.checkout.selectAddress')"
          is-link
          @click="showAddressPicker = true"
        />
        <van-cell
          :title="t('shop.checkout.addAddress')"
          icon="plus"
          @click="router.push({ name: 'shop-address-edit' })"
        />
      </van-cell-group>

      <!-- 地址选择弹窗 -->
      <van-popup v-model:show="showAddressPicker" position="bottom" round style="max-height: 60vh; overflow-y: auto">
        <div style="padding: 16px 0">
          <div class="popup-title">{{ t('shop.checkout.selectAddress') }}</div>
          <van-cell
            v-for="addr in addresses"
            :key="addr.id"
            :title="addr.contactName + '  ' + addr.phone"
            :label="addr.addressText + (addr.detail ? '  ' + addr.detail : '')"
            :icon="addr.isDefault ? 'star' : 'location-o'"
            :class="{ 'addr-active': addr.id === selectedAddressId }"
            @click="selectAddress(addr)"
          >
            <template #right-icon>
              <van-icon v-if="addr.id === selectedAddressId" name="success" color="#ee0a24" />
            </template>
          </van-cell>
          <div style="padding: 12px 16px">
            <van-button block plain type="danger" @click="router.push({ name: 'shop-address-edit' }); showAddressPicker = false">
              + {{ t('shop.checkout.addAddress') }}
            </van-button>
          </div>
        </div>
      </van-popup>

      <!-- 支付方式 -->
      <van-cell-group :title="t('shop.checkout.payMethod')" inset style="margin-top: 12px">
        <van-cell :title="t('shop.checkout.cash')">
          <template #right-icon>
            <van-radio v-model="payMethod" name="cash" />
          </template>
        </van-cell>
        <van-cell :title="t('shop.checkout.bankTransfer')">
          <template #right-icon>
            <van-radio v-model="payMethod" name="bank_transfer" />
          </template>
        </van-cell>
        <!-- 转账二维码 -->
        <div v-if="payMethod === 'bank_transfer' && store?.bankTransferQr" class="qr-box">
          <p class="qr-hint">{{ t('shop.checkout.scanQr') }}</p>
          <img :src="store.bankTransferQr" class="qr-img" />
        </div>
      </van-cell-group>

      <!-- 优惠券 -->
      <van-cell-group v-if="coupons.length" :title="t('shop.checkout.coupon')" inset style="margin-top: 12px">
        <van-radio-group v-model="couponId">
          <van-cell clickable @click="couponId = undefined">
            <template #title>{{ t('shop.checkout.noCoupon') }}</template>
            <template #right-icon>
              <van-radio :name="undefined" />
            </template>
          </van-cell>
          <van-cell
            v-for="c in coupons"
            :key="c.id"
            clickable
            :title="locale.startsWith('zh') ? c.template.nameZh : c.template.nameVi"
            :label="c.code"
            @click="couponId = c.id"
          >
            <template #right-icon>
              <van-radio :name="c.id" />
            </template>
          </van-cell>
        </van-radio-group>
      </van-cell-group>

      <!-- 备注 -->
      <van-cell-group :title="t('shop.checkout.remark')" inset style="margin-top: 12px">
        <van-field
          v-model="remark"
          type="textarea"
          :placeholder="t('shop.checkout.remarkPlaceholder')"
          rows="2"
          autosize
        />
      </van-cell-group>

      <!-- 订单明细 -->
      <van-cell-group :title="t('shop.checkout.items')" inset style="margin-top: 12px">
        <van-cell
          v-for="item in cart.items"
          :key="item.dishId + (item.optionLabel ?? '')"
          :title="item.nameZh"
          :label="item.optionLabel"
          :value="`${formatVND(item.price)} × ${item.qty}`"
        />
      </van-cell-group>

      <!-- 费用汇总 -->
      <van-cell-group inset style="margin-top: 12px">
        <van-cell :title="t('shop.checkout.subtotal')" :value="formatVND(cart.totalAmount)" />
        <van-cell
          v-if="quote?.discount"
          :title="t('shop.checkout.discount')"
          :value="`- ${formatVND(quote.discount)}`"
        />
        <van-cell
          :title="t('shop.checkout.deliveryFee')"
          :value="quoting ? t('shop.checkout.calculating') : quote ? formatVND(quote.deliveryFee) : '-'"
        />
        <van-cell
          :title="t('shop.checkout.total')"
          :value="quoting ? t('shop.checkout.calculating') : quote ? formatVND(quote.total) : '-'"
          class="total-cell"
        />
      </van-cell-group>
    </div>

    <template v-if="!emptyCart">
      <div v-if="!storeOpen && closedTip" class="checkout-closed">
        {{ closedTip }}
      </div>

      <van-submit-bar
        :price="(quote ? quote.total : cart.totalAmount) * 100"
        :decimal-length="0"
        currency="₫"
        :label="`${t('shop.checkout.totalLabel')}:`"
        :button-text="storeOpen ? t('shop.checkout.submit') : t('shop.cannotOrder')"
        :loading="submitting"
        :disabled="!storeOpen || !quote"
        @submit="handleSubmit"
      />
    </template>
  </div>
</template>

<style scoped>
.checkout-page { min-height: 100vh; background: #f7f8fa; }
.checkout-closed {
  margin: 0 16px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7e8;
  color: #ed6a0c;
  font-size: 13px;
}
.popup-title { font-size: 16px; font-weight: 700; text-align: center; padding-bottom: 8px; }
.addr-active { background: #fff7f7; }
.qr-box { text-align: center; padding: 12px; }
.qr-hint { font-size: 13px; color: #969799; margin-bottom: 8px; }
.qr-img { max-width: 200px; border-radius: 8px; border: 1px solid #eee; }
.total-cell :deep(.van-cell__value) { color: #ee0a24; font-weight: 700; font-size: 15px; }
</style>
