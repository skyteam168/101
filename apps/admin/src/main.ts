import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/theme.css';
import App from './App.vue';
import { elementLocale, i18n } from './i18n';
import { router } from './router';
import { setupPermDirective } from './directives/perm';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(ElementPlus, { locale: elementLocale.value });
setupPermDirective(app);
app.mount('#app');
