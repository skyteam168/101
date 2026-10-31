import type { RouteRecordRaw } from 'vue-router';

/** path → 懒加载组件（动态菜单按 path 匹配） */
export const viewModules: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../views/DashboardView.vue'),
  '/system/users': () => import('../views/system/UsersView.vue'),
  '/system/roles': () => import('../views/system/RolesView.vue'),
  '/system/settings': () => import('../views/system/SettingsView.vue'),
  '/system/audit': () => import('../views/system/AuditView.vue'),
  '/cashier': () => import('../views/cashier/CashierView.vue'),
  '/tables': () => import('../views/tables/TablesView.vue'),
  '/orders': () => import('../views/orders/OrdersView.vue'),
  '/members': () => import('../views/members/MembersView.vue'),
  '/marketing': () => import('../views/marketing/MarketingView.vue'),
  '/menu': () => import('../views/menu/MenuView.vue'),
  '/delivery': () => import('../views/delivery/DeliveryView.vue'),
  '/print': () => import('../views/print/PrintView.vue'),
  '/assets': () => import('../views/assets/AssetsView.vue'),
  '/inventory': () => import('../views/inventory/InventoryView.vue'),
  '/reports': () => import('../views/reports/ReportsView.vue'),
  '/system': () => import('../views/PlaceholderView.vue'),
  '/combos': () => import('../views/combo/CombosView.vue'),
  '/reservations': () => import('../views/reservation/ReservationsView.vue'),
  '/group-meals': () => import('../views/group-meal/GroupMealsView.vue'),
  '/chat': () => import('../views/chat/ChatView.vue'),
};

export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'layout',
    component: () => import('../layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { titleZh: '工作台', titleVi: 'Tổng quan', affix: true },
      },
      {
        path: 'tables/:tableId/order',
        name: 'table-order',
        component: () => import('../views/tables/OrderingView.vue'),
        meta: { titleZh: '点餐', titleVi: 'Gọi món', hidden: true },
      },
      {
        path: 'orders/:id',
        name: 'order-detail',
        component: () => import('../views/orders/OrderDetailView.vue'),
        meta: { titleZh: '订单详情', titleVi: 'Chi tiết đơn', hidden: true },
      },
      {
        path: 'assets/:id',
        name: 'asset-detail',
        component: () => import('../views/assets/AssetDetailView.vue'),
        meta: { titleZh: '资产详情', titleVi: 'Chi tiết tài sản', hidden: true },
      },
    ],
  },
];

/** 必须在动态路由之后注册，避免刷新深链被 404 抢先匹配 */
export const notFoundRoute: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('../views/NotFoundView.vue'),
  meta: { public: true },
};
