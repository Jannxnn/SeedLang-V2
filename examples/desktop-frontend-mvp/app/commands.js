import { t } from '../i18n.js';

export function createCommands(actions, navigate) {
  return [
    { id: 'go-home', title: t('palette.goHome'), run: () => navigate('home') },
    { id: 'go-editor', title: t('palette.goEditor'), run: () => navigate('editor') },
    { id: 'go-settings', title: t('palette.goSettings'), run: () => navigate('settings') },
    { id: 'open-file', title: t('palette.fileOpen'), run: () => actions.openFile() },
    { id: 'save-file', title: t('palette.fileSave'), run: () => actions.saveFile() },
    { id: 'notify', title: t('palette.appNotify'), run: () => actions.notify() }
  ];
}
