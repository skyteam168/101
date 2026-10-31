import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { Events } from '@restaurant/shared';
import { getChatUnreadCountApi } from '../api/chat';
import { getPendingDeliveryCountApi } from '../api/delivery';
import { getPendingGroupMealCountApi } from '../api/group-meal';
import { getPendingConfirmCountApi } from '../api/order';
import { getPendingReservationCountApi } from '../api/reservation';
import { getAccessToken } from '../utils/auth-storage';
import { useUserStore } from './user';
import { io, type Socket } from 'socket.io-client';

/** 后台运营角标：扫码/预定/外卖/消息/团购询单 */
export const useOpsAlertStore = defineStore('opsAlert', () => {
  const pendingConfirmCount = ref(0);
  const pendingReservationCount = ref(0);
  const pendingDeliveryCount = ref(0);
  const chatUnreadCount = ref(0);
  const pendingGroupMealCount = ref(0);
  let socket: Socket | null = null;
  let started = false;

  const hasPendingConfirm = computed(() => pendingConfirmCount.value > 0);
  const hasPendingReservation = computed(() => pendingReservationCount.value > 0);

  function clamp(n: number) {
    return Math.max(0, Math.floor(Number(n) || 0));
  }

  function setConfirmCount(n: number) {
    pendingConfirmCount.value = clamp(n);
  }
  function setReservationCount(n: number) {
    pendingReservationCount.value = clamp(n);
  }
  function setDeliveryCount(n: number) {
    pendingDeliveryCount.value = clamp(n);
  }
  function setChatUnreadCount(n: number) {
    chatUnreadCount.value = clamp(n);
  }
  function setGroupMealCount(n: number) {
    pendingGroupMealCount.value = clamp(n);
  }

  /** @deprecated 兼容旧调用名 */
  function setCount(n: number) {
    setConfirmCount(n);
  }

  async function refreshConfirm() {
    try {
      const data = await getPendingConfirmCountApi();
      setConfirmCount(data.count);
    } catch {
      /* 无权限忽略 */
    }
  }

  async function refreshReservation() {
    try {
      const data = await getPendingReservationCountApi();
      setReservationCount(data.count);
    } catch {
      /* ignore */
    }
  }

  async function refreshDelivery() {
    try {
      const data = await getPendingDeliveryCountApi();
      setDeliveryCount(data.count);
    } catch {
      /* ignore */
    }
  }

  async function refreshChat() {
    try {
      const data = await getChatUnreadCountApi();
      setChatUnreadCount(data.count);
    } catch {
      /* ignore */
    }
  }

  async function refreshGroupMeal() {
    try {
      const data = await getPendingGroupMealCountApi();
      setGroupMealCount(data.count);
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    await Promise.all([
      refreshConfirm(),
      refreshReservation(),
      refreshDelivery(),
      refreshChat(),
      refreshGroupMeal(),
    ]);
  }

  /** 按菜单 path 取角标数字 */
  function badgeForPath(path?: string | null) {
    if (!path) return 0;
    if (path === '/tables' || path === '/orders') return pendingConfirmCount.value;
    if (path === '/reservations') return pendingReservationCount.value;
    if (path === '/delivery') return pendingDeliveryCount.value;
    if (path === '/chat') return chatUnreadCount.value;
    if (path === '/group-meals') return pendingGroupMealCount.value;
    return 0;
  }

  function bind(s: Socket) {
    s.on(Events.QR_PENDING_CHANGED, (payload: { count?: number }) => {
      if (typeof payload?.count === 'number') setConfirmCount(payload.count);
      else void refreshConfirm();
    });
    s.on(Events.ORDER_BATCH_ADDED, (payload: { pendingConfirmCount?: number }) => {
      if (typeof payload?.pendingConfirmCount === 'number') {
        setConfirmCount(payload.pendingConfirmCount);
      } else {
        void refreshConfirm();
      }
    });
    s.on(Events.TABLE_STATUS_CHANGED, () => {
      void refreshConfirm();
    });
    s.on(Events.RESERVATION_PENDING_CHANGED, (payload: { count?: number }) => {
      if (typeof payload?.count === 'number') setReservationCount(payload.count);
      else void refreshReservation();
    });
    s.on(Events.RESERVATION_CREATED, (payload: { pendingCount?: number }) => {
      if (typeof payload?.pendingCount === 'number') setReservationCount(payload.pendingCount);
      else void refreshReservation();
    });
    s.on(Events.DELIVERY_NEW, () => {
      void refreshDelivery();
    });
    s.on(Events.DELIVERY_STATUS_CHANGED, () => {
      void refreshDelivery();
    });
    s.on(Events.CHAT_MESSAGE, () => {
      void refreshChat();
    });
    s.on(Events.CHAT_READ, () => {
      void refreshChat();
    });
    s.on(Events.GROUP_MEAL_INQUIRY_CREATED, (payload: { pendingCount?: number }) => {
      if (typeof payload?.pendingCount === 'number') setGroupMealCount(payload.pendingCount);
      else void refreshGroupMeal();
    });
  }

  function start() {
    if (started) return;
    started = true;
    const userStore = useUserStore();
    const storeId = userStore.profile?.storeId;
    if (!storeId) return;
    void refresh();
    socket?.disconnect();
    socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: getAccessToken() },
    });
    socket.on('connect', () => {
      socket?.emit('join', { room: `store:${storeId}:front` });
    });
    bind(socket);
  }

  function stop() {
    started = false;
    socket?.disconnect();
    socket = null;
    pendingConfirmCount.value = 0;
    pendingReservationCount.value = 0;
    pendingDeliveryCount.value = 0;
    chatUnreadCount.value = 0;
    pendingGroupMealCount.value = 0;
  }

  return {
    pendingConfirmCount,
    pendingReservationCount,
    pendingDeliveryCount,
    chatUnreadCount,
    pendingGroupMealCount,
    hasPendingConfirm,
    hasPendingReservation,
    badgeForPath,
    refresh,
    refreshConfirm,
    refreshReservation,
    refreshDelivery,
    refreshChat,
    refreshGroupMeal,
    setCount,
    setConfirmCount,
    setReservationCount,
    setDeliveryCount,
    setChatUnreadCount,
    setGroupMealCount,
    start,
    stop,
  };
});
