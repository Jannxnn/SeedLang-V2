import { t } from '../i18n.js';

export function renderEditor(state, refs) {
  refs.pathLabel.textContent = state.currentPath || t('editor.noFile');
}
