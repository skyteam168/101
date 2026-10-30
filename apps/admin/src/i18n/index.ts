import { createI18n } from 'vue-i18n';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import vi from 'element-plus/es/locale/lang/vi';
import { ref } from 'vue';
import zhCN from './locales/zh-CN.json';
import viVN from './locales/vi-VN.json';

const saved = localStorage.getItem('locale') || 'zh-CN';

export const i18n = createI18n({
  legacy: false,
  locale: saved,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'vi-VN': viVN,
  },
});

export const elementLocale = ref(saved === 'vi-VN' ? vi : zhCn);

export function setElementLocale(locale: string) {
  elementLocale.value = locale === 'vi-VN' ? vi : zhCn;
}
