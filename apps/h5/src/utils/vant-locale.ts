import { Locale } from 'vant';
import zhCN from 'vant/es/locale/lang/zh-CN';
import viVN from 'vant/es/locale/lang/vi-VN';

/** 同步 Vant 组件文案（Picker 确认/取消、SubmitBar 合计等） */
export function applyVantLocale(lang: string) {
  if (String(lang).startsWith('vi')) {
    Locale.use('vi-VN', viVN);
  } else {
    Locale.use('zh-CN', zhCN);
  }
}
