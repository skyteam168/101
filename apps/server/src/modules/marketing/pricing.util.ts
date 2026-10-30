import { CouponDiscountType, PromoChannel, PromoScope } from '@prisma/client';

export type PriceLine = {
  dishId: string | null;
  amount: number;
  status: string;
  isGift?: boolean;
};

export type DiscountSpec = {
  id: string;
  nameZh: string;
  nameVi: string;
  type: CouponDiscountType;
  value: number;
  minSpend: number;
  scope: PromoScope;
  dishIds: string[] | null;
  channel: PromoChannel;
};

export type PricingInput = {
  lines: PriceLine[];
  channel: PromoChannel | 'delivery' | 'dine_in' | 'takeaway';
  rules: DiscountSpec[];
  coupon?: DiscountSpec | null;
  manualDiscount?: number;
  roundOff?: number;
  serviceCharge?: number;
  deliveryFee?: number;
  memberPercent?: number;
};

export type PricingResult = {
  subtotal: number;
  promoDiscount: number;
  couponDiscount: number;
  memberDiscount: number;
  manualDiscount: number;
  roundOff: number;
  discount: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  snapshot: {
    rules: { id: string; nameZh: string; amount: number }[];
    coupon: { id: string; nameZh: string; amount: number } | null;
    memberPercent: number;
  };
};

function channelMatch(ruleChannel: PromoChannel, orderChannel: string) {
  if (ruleChannel === PromoChannel.all) return true;
  if (orderChannel === 'takeaway') return ruleChannel === PromoChannel.dine_in;
  return ruleChannel === orderChannel;
}

function calcOne(
  spec: DiscountSpec,
  lines: PriceLine[],
  base: number,
): number {
  if (base < spec.minSpend) return 0;
  let eligible = base;
  if (spec.scope === PromoScope.dish && spec.dishIds?.length) {
    const set = new Set(spec.dishIds);
    eligible = lines
      .filter((l) => l.status !== 'voided' && !l.isGift && l.dishId && set.has(l.dishId))
      .reduce((s, l) => s + l.amount, 0);
    if (eligible <= 0) return 0;
  }
  if (spec.type === CouponDiscountType.amount) {
    return Math.min(spec.value, eligible);
  }
  return Math.min(Math.floor((eligible * spec.value) / 100), eligible);
}

/** 计价：小计 → 规则 → 券 → 会员折扣 → 手动折扣/抹零 → 服务费 */
export function computePricing(input: PricingInput): PricingResult {
  const lines = input.lines.filter((l) => l.status !== 'voided');
  const subtotal = lines.reduce((s, l) => s + (l.isGift ? 0 : l.amount), 0);

  const matchedRules: { id: string; nameZh: string; amount: number }[] = [];
  let promoDiscount = 0;
  for (const rule of input.rules) {
    if (!channelMatch(rule.channel, input.channel)) continue;
    const amt = calcOne(rule, lines, subtotal);
    if (amt > 0) {
      matchedRules.push({ id: rule.id, nameZh: rule.nameZh, amount: amt });
      promoDiscount += amt;
    }
  }
  promoDiscount = Math.min(promoDiscount, subtotal);

  let remain = subtotal - promoDiscount;
  let couponDiscount = 0;
  let couponSnap: PricingResult['snapshot']['coupon'] = null;
  if (input.coupon && channelMatch(input.coupon.channel, input.channel)) {
    const amt = calcOne(input.coupon, lines, remain);
    if (amt > 0) {
      couponDiscount = Math.min(amt, remain);
      remain -= couponDiscount;
      couponSnap = {
        id: input.coupon.id,
        nameZh: input.coupon.nameZh,
        amount: couponDiscount,
      };
    }
  }

  const memberPercent = Math.max(0, Math.min(100, input.memberPercent ?? 0));
  let memberDiscount = 0;
  if (memberPercent > 0 && remain > 0) {
    memberDiscount = Math.min(Math.floor((remain * memberPercent) / 100), remain);
    remain -= memberDiscount;
  }

  const manualDiscount = Math.min(Math.max(0, input.manualDiscount ?? 0), remain);
  remain -= manualDiscount;
  const roundOff = Math.min(Math.max(0, input.roundOff ?? 0), remain);
  remain -= roundOff;

  const discount = promoDiscount + couponDiscount + memberDiscount + manualDiscount + roundOff;
  const serviceCharge = Math.max(0, input.serviceCharge ?? 0);
  const deliveryFee = Math.max(0, input.deliveryFee ?? 0);
  const total = Math.max(0, remain + serviceCharge + deliveryFee);

  return {
    subtotal,
    promoDiscount,
    couponDiscount,
    memberDiscount,
    manualDiscount,
    roundOff,
    discount,
    serviceCharge,
    deliveryFee,
    total,
    snapshot: {
      rules: matchedRules,
      coupon: couponSnap,
      memberPercent,
    },
  };
}
