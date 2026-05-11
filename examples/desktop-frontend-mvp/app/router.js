import { t } from './i18n.js';

export function createRouter(store) {
  function navigate(targetRoute) {
    const state = store.getState();
    if (targetRoute === 'editor' && !state.currentPath) {
      store.setState({
        route: 'home',
        notice: t('notice.editorNeedsFile')
      });
      return false;
    }
    store.setState({ route: targetRoute, notice: '' });
    return true;
  }

  return { navigate };
}
