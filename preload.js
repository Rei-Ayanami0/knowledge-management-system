const { contextBridge, ipcRenderer, webFrame } = require('electron');

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.1;

document.addEventListener('wheel', event => {
  if (!event.ctrlKey || event.target.closest('input, textarea, select')) return;
  event.preventDefault();
  const current = window.visualZoomFactor || webFrame.getZoomFactor() || 1;
  const direction = event.deltaY < 0 ? 1 : -1;
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((current + direction * ZOOM_STEP) * 100) / 100));
  window.visualZoomFactor = next;
  webFrame.setZoomFactor(next);
}, { capture: true, passive: false });

document.addEventListener('keydown', event => {
  if (!event.target.closest('input, textarea, select') && event.ctrlKey && event.key === '0') {
    event.preventDefault();
    window.visualZoomFactor = 1;
    webFrame.setZoomFactor(1);
  }
}, { capture: true });

contextBridge.exposeInMainWorld('desktopStorage', {
  readData: () => ipcRenderer.sendSync('storage:read-data'),
  writeData: content => ipcRenderer.sendSync('storage:write-data', content),
  writeImage: (id, bytes, mimeType) => ipcRenderer.invoke('storage:write-image', id, bytes, mimeType),
  readImage: id => ipcRenderer.invoke('storage:read-image', id)
});
