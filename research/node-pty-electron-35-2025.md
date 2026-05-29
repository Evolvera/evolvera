# node-pty + Electron 35 Integration Guide (2025)

## Overview
Practical guide for integrating node-pty with Electron 35, focusing on PTY process spawning, IPC streaming, resize/kill operations, and native module rebuild.

**Key Compatibility (2025):**
- Electron 35: Node 22.x, V8 13.x, N-API 9+
- node-pty 1.x: N-API 8+ (compatible with Electron 35)
- @electron/rebuild 3.x: Full Electron 35 support

---

## 1. Installation & Dependencies

```bash
# Core dependencies
npm install node-pty@latest
npm install -D @electron/rebuild electron-builder

# xterm.js for renderer terminal UI
npm install xterm@5 xterm-addon-fit@0.8
```

### package.json configuration
```json
{
  "scripts": {
    "rebuild": "electron-rebuild -f -w node-pty",
    "postinstall": "electron-rebuild -f -w node-pty"
  },
  "build": {
    "appId": "com.example.app",
    "npmRebuild": true,
    "nativeRebuiltFromSource": true,
    "asar": true,
    "files": ["node_modules/node-pty/**/*"]
  }
}
```

### .npmrc
```
runtime=electron
target=35.0.0
disturl=https://electronjs.org/headers
```

### Manual rebuild
```bash
npx @electron/rebuild -f -w node-pty
```

---

## 2. node-pty API (2025)

### Spawn PTY
```javascript
const pty = require('node-pty');
const os = require('os');

// Linux/macOS
const ptyProcess = pty.spawn('bash', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

// Windows
const ptyProcess = pty.spawn('powershell.exe', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
});
```

### Events
```javascript
// Receive PTY output
ptyProcess.onData((data) => {
  console.log('Output:', data);
  // Send to renderer via IPC
});

// Process exit
ptyProcess.onExit(({ exitCode, signal }) => {
  console.log(`Exit: code=${exitCode}, signal=${signal}`);
});
```

### Operations
```javascript
// Write to PTY (user input)
ptyProcess.write('ls -la\r');

// Resize terminal
ptyProcess.resize(cols, rows);

// Kill process
ptyProcess.kill();

// Get PID
console.log('PID:', ptyProcess.pid);

// Dispose (cleanup)
ptyProcess.dispose();
```

---

## 3. Electron IPC Pattern for Terminal Streaming

### Main Process (main.js)
```javascript
const { ipcMain, BrowserWindow } = require('electron');
const pty = require('node-pty');
const os = require('os');

let terminals = new Map(); // Multiple terminal support

// ============================================
// CREATE PTY
// ============================================
ipcMain.handle('terminal:create', async (event, { id, cwd }) => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env: process.env
  });
  
  terminals.set(id, ptyProcess);
  
  // Stream data to renderer
  ptyProcess.onData((data) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:data', { id, data });
    }
  });
  
  // Handle exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:exit', { id, exitCode, signal });
    }
    terminals.delete(id);
  });
  
  return { success: true, pid: ptyProcess.pid };
});

// ============================================
// WRITE TO PTY (from renderer input)
// ============================================
ipcMain.handle('terminal:write', (event, { id, data }) => {
  const ptyProcess = terminals.get(id);
  if (ptyProcess) {
    ptyProcess.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// ============================================
// RESIZE
// ============================================
ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {
  const ptyProcess = terminals.get(id);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// ============================================
// KILL
// ============================================
ipcMain.handle('terminal:kill', (event, { id }) => {
  const ptyProcess = terminals.get(id);
  if (ptyProcess) {
    ptyProcess.kill();
    terminals.delete(id);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// ============================================
// CLEANUP
// ============================================
ipcMain.on('will-quit', () => {
  terminals.forEach((pty) => pty.kill());
  terminals.clear();
});
```

### Preload Script (preload.js)
```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer
contextBridge.exposeInMainWorld('terminal', {
  // Core operations
  create: (options) => ipcRenderer.invoke('terminal:create', options),
  write: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  
  // Event listeners with cleanup
  onData: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  
  onExit: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
});
```

### Renderer (React/Vue/Vanilla)
```javascript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

// Initialize xterm
const term = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  theme: { background: '#1e1e1e' }
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

// Generate unique ID
const terminalId = `term-${Date.now()}`;

// Setup listeners BEFORE creating PTY
const unsubData = window.terminal.onData(({ id, data }) => {
  if (id === terminalId) {
    term.write(data);
  }
});

const unsubExit = window.terminal.onExit(({ id, exitCode, signal }) => {
  if (id === terminalId) {
    term.write(`\r\n[Process exited: ${exitCode}]\r\n`);
  }
});

// Create PTY
await window.terminal.create({ id: terminalId, cwd: process.cwd() });

// Forward xterm input to PTY
term.onData((data) => {
  window.terminal.write(terminalId, data);
});

// Auto-resize on container change
const resizeObserver = new ResizeObserver(() => {
  const { cols, rows } = term;
  window.terminal.resize(terminalId, cols, rows);
});
resizeObserver.observe(document.getElementById('terminal'));

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  window.terminal.kill(terminalId);
  unsubData();
  unsubExit();
  resizeObserver.disconnect();
  term.dispose();
});
```

---

## 4. Terminal Manager Class (Multiple Terminals)

```javascript
// terminal-manager.js
const pty = require('node-pty');
const os = require('os');

class TerminalManager {
  constructor() {
    this.terminals = new Map();
  }
  
  create(id, options = {}) {
    // Kill existing if re-creating
    if (this.terminals.has(id)) {
      this.kill(id);
    }
    
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: options.name || 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || os.homedir(),
      env: options.env || process.env
    });
    
    this.terminals.set(id, ptyProcess);
    return ptyProcess;
  }
  
  get(id) {
    return this.terminals.get(id);
  }
  
  write(id, data) {
    const pty = this.get(id);
    if (pty) {
      pty.write(data);
      return true;
    }
    return false;
  }
  
  resize(id, cols, rows) {
    const pty = this.get(id);
    if (pty) {
      pty.resize(cols, rows);
      return true;
    }
    return false;
  }
  
  kill(id) {
    const pty = this.get(id);
    if (pty) {
      pty.kill();
      this.terminals.delete(id);
      return true;
    }
    return false;
  }
  
  killAll() {
    this.terminals.forEach((pty) => pty.kill());
    this.terminals.clear();
  }
  
  get size() {
    return this.terminals.size;
  }
}

module.exports = new TerminalManager();
```

### Usage in main.js
```javascript
const terminalManager = require('./terminal-manager');

ipcMain.handle('terminal:create', async (event, { id, cwd }) => {
  const ptyProcess = terminalManager.create(id, { cwd });
  
  ptyProcess.onData((data) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:data', { id, data });
    }
  });
  
  ptyProcess.onExit(() => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.send('terminal:exit', { id });
    }
  });
  
  return { success: true, pid: ptyProcess.pid };
});

ipcMain.handle('terminal:write', (event, { id, data }) => {
  return { success: terminalManager.write(id, data) };
});

ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {
  return { success: terminalManager.resize(id, cols, rows) };
});

ipcMain.handle('terminal:kill', (event, { id }) => {
  return { success: terminalManager.kill(id) };
});

// Cleanup
app.on('window-all-closed', () => {
  terminalManager.killAll();
  if (process.platform !== 'darwin') app.quit();
});
```

---

## 5. Electron 35+ Gotchas

### 1. contextIsolation MUST be true
```javascript
// WRONG - security vulnerability
webPreferences: {
  nodeIntegration: true,
  contextIsolation: false
}

// CORRECT - secure IPC pattern
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,        // Optional but recommended
  preload: path.join(__dirname, 'preload.js')
}
```

### 2. Memory Leaks - Critical Cleanup
```javascript
// Always cleanup on exit
process.on('exit', () => {
  terminalManager.killAll();
});

// Windows-specific cleanup
app.on('window-all-closed', () => {
  terminalManager.killAll();
  if (process.platform !== 'darwin') app.quit();
});

// macOS
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

### 3. N-API Compatibility
```javascript
// node-pty uses N-API - compatible with Electron 35
// BUT must rebuild for specific Electron version

// Verify module exists
const fs = require('fs');
const ptyPath = 'node_modules/node-pty/build/Release/node-pty.node';
console.log('Module exists:', fs.existsSync(ptyPath));

// Check build info
const buildInfo = require('node-pty/package.json');
console.log('node-pty version:', buildInfo.version);
```

### 4. Windows ConPTY (Electron 35+)
```javascript
// Electron 35 on Windows 11 uses ConPTY automatically
// node-pty detects and uses automatically

// Force specific mode if needed:
const ptyProcess = pty.spawn('powershell.exe', [], {
  useConpty: false, // Force legacy mode
  conptyInheritCursorStyle: true
});
```

### 5. macOS Universal Binary
```bash
# Rebuild for Apple Silicon + Intel
npx @electron/rebuild -f -w node-pty -m .

# Verify in:
# node_modules/node-pty/build/Release/
# Should have .node files for each arch
```

### 6. Sandbox Issues
```javascript
// If you get sandbox errors:
app.commandLine.appendSwitch('no-sandbox');

// Or disable sandbox for node-pty process only
// (in preload, NOT in main process security settings)
```

### 7. Fork Operations
```javascript
// For shell fork/sudo patterns:
const ptyProcess = pty.spawn('sudo', ['-s'], {
  // ...
});

// Or with env variables for specific forks:
pty.spawn('bash', ['-c', 'some command'], {
  env: { ...process.env, SPECIAL_VAR: 'value' }
});
```

---

## 6. Complete Minimal Example

### Project Structure
```
project/
├── package.json
├── main.js
├── preload.js
├── renderer.html
├── renderer.js
└── node_modules/
```

### package.json
```json
{
  "name": "electron-pty-minimal",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "rebuild": "electron-rebuild -f -w node-pty"
  },
  "dependencies": {
    "node-pty": "^1.0.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  },
  "devDependencies": {
    "electron": "^35.0.0",
    "@electron/rebuild": "^3.6.0"
  }
}
```

### main.js
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const pty = require('node-pty');
const path = require('path');

let mainWindow;
let ptyProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('renderer.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', createWindow);
});

app.on('window-all-closed', () => {
  if (ptyProcess) ptyProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('pty:spawn', async () => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  ptyProcess = pty.spawn(shell, [], { cols: 80, rows: 24 });
  
  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', data);
    }
  });
  
  ptyProcess.onExit(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit');
    }
    ptyProcess = null;
  });
  
  return { pid: ptyProcess.pid };
});

ipcMain.handle('pty:write', (event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
    return true;
  }
  return false;
});

ipcMain.handle('pty:resize', (event, { cols, rows }) => {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return true;
  }
  return false;
});

ipcMain.handle('pty:kill', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
    return true;
  }
  return false;
});
```

### preload.js
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pty', {
  spawn: () => ipcRenderer.invoke('pty:spawn'),
  write: (data) => ipcRenderer.invoke('pty:write', data),
  resize: (cols, rows) => ipcRenderer.invoke('pty:resize', { cols, rows }),
  kill: () => ipcRenderer.invoke('pty:kill'),
  onData: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('pty:data', listener);
    return () => ipcRenderer.removeListener('pty:data', listener);
  },
  onExit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('pty:exit', listener);
    return () => ipcRenderer.removeListener('pty:exit', listener);
  }
});
```

### renderer.html
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="node_modules/xterm/css/xterm.css">
  <style>
    body { margin: 0; padding: 0; background: #1e1e1e; }
    #terminal { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="node_modules/xterm/lib/xterm.js"></script>
  <script src="node_modules/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <script src="renderer.js"></script>
</body>
</html>
```

### renderer.js
```javascript
const term = new Terminal();
term.open(document.getElementById('terminal'));

// Setup listeners first
window.pty.onData((data) => term.write(data));
window.pty.onExit(() => term.write('\r\n[Disconnected]\r\n'));

// Spawn PTY
window.pty.spawn();

// Forward input
term.onData((data) => window.pty.write(data));

// Auto-resize
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
fitAddon.fit();

const observer = new ResizeObserver(() => {
  fitAddon.fit();
  window.pty.resize(term.cols, term.rows);
});
observer.observe(document.getElementById('terminal'));
```

---

## 7. Debugging Common Issues

### "node-pty.node: invalid ELF header"
```bash
# Rebuild for Electron
npx @electron/rebuild -f -w node-pty

# Verify Electron version
npx electron -v
```

### "Failed to load native module"
```javascript
// Check module exists
const fs = require('fs');
const path = require('path');
const ptyPath = path.join(__dirname, 'node_modules/node-pty/build/Release/node-pty.node');
console.log('Exists:', fs.existsSync(ptyPath));
```

### "Segmentation fault" on Windows
```javascript
// Use ConPTY mode explicitly
const ptyProcess = pty.spawn('powershell.exe', [], {
  conpty: true,
  conptyInheritCursorStyle: true
});
```

### "Permission denied" on macOS
```javascript
// May need to handle iTerm2/macOS Terminal
// node-pty handles this automatically
// If issues: check Terminal permissions in System Preferences
```

### IPC not working
```javascript
// Verify preload is loaded
console.log('terminal API:', window.terminal);

// Check if IPC handlers are registered
// (add logs in main process handlers)
```

---

## 8. Testing the Integration

```bash
# 1. Install dependencies
npm install

# 2. Rebuild for Electron
npm run rebuild

# 3. Start app
npm start
```

### Verify native module
```javascript
// In main process
try {
  const pty = require('node-pty');
  console.log('node-pty loaded:', pty);
  console.log('Process version:', process.version);
  console.log('Electron version:', process.versions.electron);
} catch (err) {
  console.error('Failed to load node-pty:', err);
}
```

---

## Sources

1. https://github.com/node-pty/node-pty
2. https://github.com/electron/rebuild
3. https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
4. https://github.com/xtermjs/xterm.js

---

*Generated: 2026-05-21*
