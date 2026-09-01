const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,
  selectDicomFolder: () => ipcRenderer.invoke('select-dicom-folder'),
  saveMeshFile: (filename, data) => ipcRenderer.invoke('save-mesh-file', { filename, data }),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
});
