import { t } from '../i18n.js';

export function renderHome(state, refs) {
  refs.stateInfo.textContent = t('home.stateInfo')(state.theme, state.autoSave);
}
