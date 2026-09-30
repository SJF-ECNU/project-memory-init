const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { AgentRunner, detectAgents, active } = require('./agent-runner.cjs');
const { scanProject, saveFile } = require('./project-files.cjs');
let window, projects = [];
const runner = new AgentRunner({
  skillRoot: process.env.DESKTOP_DEV === '1' ? path.join(__dirname, '../..') : path.join(__dirname, '../dist/initializer'),
  onUpdate: job => { if (window && !window.isDestroyed()) window.webContents.send('initialization:update', job); },
});
const storePath = () => path.join(app.getPath('userData'), 'projects.json');
async function loadProjects() {
  try { projects = JSON.parse(await fs.readFile(storePath(), 'utf8')).filter(p => typeof p.path === 'string' && typeof p.name === 'string'); }
  catch (error) { if (error.code !== 'ENOENT') console.warn('项目列表无法恢复:', error.message); }
}
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无权访问项目');
}
async function openWindow() {
  window = new BrowserWindow({ width: 1380, height: 920, minWidth: 760, minHeight: 560, title: '项目工作台', backgroundColor: '#f8f9fb', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(window, { type: 'question', message: '有未保存的修改，仍要关闭吗？', buttons: ['继续编辑', '放弃修改并关闭'], defaultId: 0, cancelId: 0 });
    if (response === 1) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.DESKTOP_DEV === '1') await window.loadURL('http://localhost:5173');
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await loadProjects();
  // Explicit CLI project is also used by the desktop integration test.
  const projectArg = process.argv.find(arg => arg.startsWith('--project='));
  if (projectArg) {
    const root = await fs.realpath(projectArg.slice('--project='.length));
    if (!projects.some(p => p.path === root)) {
      projects.push({ path: root, name: path.basename(root) });
      await fs.writeFile(storePath(), JSON.stringify(projects, null, 2));
    }
  }
  ipcMain.handle('projects:list', event => { trusted(event); return projects; });
  ipcMain.handle('projects:choose', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(window, { title: '选择项目目录', properties: ['openDirectory'] });
    if (result.canceled) return null;
    const root = await fs.realpath(result.filePaths[0]);
    const project = { path: root, name: path.basename(root) };
    if (!projects.some(p => p.path === root)) projects.push(project);
    await fs.writeFile(storePath(), JSON.stringify(projects, null, 2));
    return project;
  });
  ipcMain.handle('projects:scan', (event, root) => {
    trusted(event);
    if (!projects.some(p => p.path === root)) throw new Error('请先选择项目目录');
    return scanProject(root);
  });
  ipcMain.handle('projects:save', (event, root, relative, content, original) => {
    trusted(event);
    if (!projects.some(p => p.path === root)) throw new Error('请先选择项目目录');
    return saveFile(root, relative, content, original);
  });
  ipcMain.handle('projects:discard', async event => {
    trusted(event);
    const { response } = await dialog.showMessageBox(window, { type: 'question', message: '有未保存的修改，要放弃吗？', buttons: ['继续编辑', '放弃修改'], defaultId: 0, cancelId: 0 });
    return response === 1;
  });
  ipcMain.handle('initialization:agents', event => { trusted(event); return detectAgents(); });
  ipcMain.handle('initialization:status', event => { trusted(event); return runner.snapshot(); });
  ipcMain.handle('initialization:start', (event, root, agent, model) => {
    trusted(event);
    if (!projects.some(p => p.path === root)) throw new Error('请先选择项目目录');
    return runner.start(root, agent, model);
  });
  ipcMain.handle('initialization:stop', event => { trusted(event); return runner.stop(); });
  await openWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', event => {
  if (active(runner.job?.state)) {
    event.preventDefault();
    runner.stop();
    const timer = setInterval(() => { if (!active(runner.job?.state)) { clearInterval(timer); app.quit(); } }, 100);
  }
});
