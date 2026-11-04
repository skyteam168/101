import { createRouter, createWebHistory } from 'vue-router';
import { getCustomerToken } from '../utils/customer-storage';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../layouts/MainTabLayout.vue'),
      children: [
        { path: '', name: 'home', component: () => import('../views/HomeView.vue') },
        {
          path: 'shop',
          name: 'shop',
          component: () => import('../views/shop/ShopHomeView.vue'),
        },
        {
          path: 'shop/cart',
          name: 'shop-cart',
          component: () => import('../views/shop/CartView.vue'),
        },
        {
          path: 'shop/chat',
          name: 'shop-chat',
          component: () => import('../views/shop/ChatView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'shop/me',
          name: 'shop-me',
          component: () => import('../views/shop/MeView.vue'),
          meta: { requiresAuth: true },
        },
      ],
    },

    {
      path: '/reserve',
      name: 'reserve',
      component: () => import('../views/reserve/ReserveView.vue'),
    },
    {
      path: '/my-reservations',
      name: 'my-reservations',
      component: () => import('../views/reserve/MyReservationsView.vue'),
    },
    {
      path: '/group-meal',
      name: 'group-meal',
      component: () => import('../views/group/GroupMealView.vue'),
    },
    {
      path: '/shop/coupons',
      name: 'shop-coupons',
      component: () => import('../views/shop/CouponsView.vue'),
    },

    // 桌台扫码（保留原流程）
    { path: '/t/:token', name: 'table', component: () => import('../views/table/TableOrderView.vue') },

    // 认证（全屏，无底栏）
    { path: '/shop/login', name: 'shop-login', component: () => import('../views/shop/AuthLoginView.vue') },
    { path: '/shop/register', name: 'shop-register', component: () => import('../views/shop/AuthRegisterView.vue') },
    { path: '/shop/forgot', name: 'shop-forgot', component: () => import('../views/shop/AuthForgotView.vue') },
    {
      path: '/shop/change-password',
      name: 'shop-change-password',
      component: () => import('../views/shop/AuthChangePasswordView.vue'),
      meta: { requiresAuth: true },
    },

    // 购物车 / 结账
    {
      path: '/shop/checkout',
      name: 'shop-checkout',
      component: () => import('../views/shop/CheckoutView.vue'),
      meta: { requiresAuth: true },
    },

    // 地址管理
    {
      path: '/shop/addresses',
      name: 'shop-addresses',
      component: () => import('../views/shop/AddressListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shop/addresses/edit',
      name: 'shop-address-edit',
      component: () => import('../views/shop/AddressEditView.vue'),
      meta: { requiresAuth: true },
    },

    // 订单
    {
      path: '/shop/orders',
      name: 'shop-orders',
      component: () => import('../views/shop/OrdersView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/shop/orders/:id',
      name: 'shop-order-detail',
      component: () => import('../views/shop/OrderDetailView.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth && !getCustomerToken()) {
    next({ name: 'shop-login', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});
