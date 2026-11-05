import { apiGet, apiPost } from './http';
import { getPublicStoreId } from '../utils/store-id';

export type MemberBenefitLevel = {
  id: string;
  nameZh: string;
  nameVi: string;
  minSpend: number;
  discountPercent: number;
  birthdayBonusPoints: number;
  deliveryFeeOff: number;
  priorityReserve: boolean;
  priorityDelivery: boolean;
  birthdayGift: boolean;
};

export type Membership = {
  joined: boolean;
  birthday: string | null;
  lifetimeSpend: number;
  birthdayToday: boolean;
  birthdayGiftPending: boolean;
  memberLevel: MemberBenefitLevel | null;
};

export function getMemberBenefits() {
  return apiGet<{ levels: MemberBenefitLevel[] }>('/public/member/benefits', {
    storeId: getPublicStoreId(),
  });
}

export function getMyMembership() {
  return apiGet<Membership>('/public/member/me');
}

export function joinMemberApi(dto: { birthday: string; agree: boolean }) {
  const storeId = encodeURIComponent(getPublicStoreId());
  return apiPost<Membership>(`/public/member/join?storeId=${storeId}`, dto);
}
