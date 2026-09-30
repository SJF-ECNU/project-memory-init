const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('projects', {
  save: (root, relative, content, original) => ipcRenderer.invoke('projects:save', root, relative, content, original),
  discard: () => ipcRenderer.invoke('projects:discard'),
  list: () => ipcRenderer.invoke('projects:list'),
  choose: () => ipcRenderer.invoke('projects:choose'),
  scan: (projectPath) => ipcRenderer.invoke('projects:scan', projectPath),
});

contextBridge.exposeInMainWorld('initialization', {
  agents: () => ipcRenderer.invoke('initialization:agents'),
  status: () => ipcRenderer.invoke('initialization:status'),
  start: (projectPath, agent, model) => ipcRenderer.invoke('initialization:start', projectPath, agent, model),
  stop: () => ipcRenderer.invoke('initialization:stop'),
  onUpdate: callback => {
    const listener = (_event, job) => callback(job);
    ipcRenderer.on('initialization:update', listener);
    return () => ipcRenderer.removeListener('initialization:update', listener);
  },
});
