import { t } from '../i18n.js';

export function renderSettings(state, refs) {
  refs.themeSelect.value = state.theme;
  refs.autoSaveToggle.checked = state.autoSave;
}
