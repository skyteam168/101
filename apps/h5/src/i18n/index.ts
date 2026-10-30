import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import viVN from './locales/vi-VN.json';

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'vi-VN': viVN,
  },
});
