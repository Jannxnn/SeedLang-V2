import { t } from './i18n.js';
import { renderHome } from './pages/home.js';
import { renderEditor } from './pages/editor.js';
import { renderSettings } from './pages/settings.js';

export function renderViews(route) {
  ['home', 'editor', 'settings'].forEach((name) => {
    const el = document.getElementById(`view-${name}`);
    if (!el) return;
    el.classList.toggle('hidden', name !== route);
  });
}

export function renderApp(state, refs) {
  renderViews(state.route);
  refs.title.textContent = t('app.title');
  refs.routeLabel.textContent = `${t('app.route')}: ${state.route}`;
  refs.routeNotice.textContent = state.notice || '';
  document.body.dataset.theme = state.theme;
  refs.navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === state.route);
  });
  renderHome(state, refs);
  renderEditor(state, refs);
  renderSettings(state, refs);
}
