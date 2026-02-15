# MonitorR Desktop Agent — Technical Specification

> **Purpose**: This document provides everything needed to build the Electron-based desktop monitoring agent for MonitorR.
> A developer can follow this spec to build the agent from scratch.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Setup](#project-setup)
4. [Architecture](#architecture)
5. [API Endpoints](#api-endpoints)
6. [Authentication Flow](#authentication-flow)
7. [Core Features](#core-features)
8. [File Structure](#file-structure)
9. [Step-by-Step Implementation](#step-by-step-implementation)
10. [Build & Distribution](#build--distribution)
11. [Configuration](#configuration)

---

## 1. Overview

The MonitorR Desktop Agent is a **background system tray application** that:
- Connects to the MonitorR server using employee email
- Captures periodic screenshots silently (no browser permission needed)
- Tracks active application usage (window titles, app names)
- Tracks website usage from browsers
- Sends heartbeats to keep the session alive
- Receives dynamic configuration from the server (intervals, toggles)
- Auto-starts on system boot
- Runs silently in the system tray (no visible window)

**Supported Platforms**: Windows, macOS, Linux

---

## 2. Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | [Electron](https://www.electronjs.org/) v28+ |
| Language | TypeScript |
| Screenshot | `electron.desktopCapturer` (built-in, no permission prompt) |
| Active Window | [`active-win`](https://www.npmjs.com/package/active-win) npm package |
| HTTP Client | `node-fetch` or Electron's `net` module |
| Auto-launch | [`auto-launch`](https://www.npmjs.com/package/auto-launch) npm package |
| Storage | `electron-store` for persistent config/token |
| Build Tool | [`electron-builder`](https://www.electron.build/) |
| Tray Icon | Electron's `Tray` + `Menu` API |

---

## 3. Project Setup

```bash
# Create project
mkdir monitorr-agent && cd monitorr-agent
npm init -y

# Install dependencies
npm install electron electron-builder typescript --save-dev
npm install active-win auto-launch electron-store node-fetch

# Install types
npm install @types/node --save-dev
```

### package.json scripts
```json
{
  "name": "men-agent",
  "productName": "MEN Agent",
  "version": "2.4.1",
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsc && electron .",
    "build": "tsc && electron-builder",
    "build:win": "tsc && electron-builder --win",
    "build:mac": "tsc && electron-builder --mac",
    "build:linux": "tsc && electron-builder --linux"
  },
  "build": {
    "appId": "com.monitorr.agent",
    "productName": "MEN Agent",
    "files": ["dist/**/*", "assets/**/*"],
    "win": {
      "target": ["nsis"],
      "icon": "assets/icon.ico"
    },
    "mac": {
      "target": ["dmg"],
      "icon": "assets/icon.icns"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "assets/icon.png"
    },
    "nsis": {
      "oneClick": true,
      "installerIcon": "assets/icon.ico",
      "artifactName": "MEN-${version}.${ext}"
    }
  }
}
```

---

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│              Electron Main Process           │
│                                              │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│  │ TrayMgr  │  │ AuthMgr   │  │ ConfigMgr │ │
│  └──────────┘  └───────────┘  └───────────┘ │
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │           Scheduler (Timers)             ││
│  │  ┌────────┐ ┌────────┐ ┌──────────────┐ ││
│  │  │Heartbt │ │Screensht│ │ActivityTrack │ ││
│  │  │60s     │ │dynamic  │ │30s           │ ││
│  │  └────────┘ └────────┘ └──────────────┘ ││
│  └──────────────────────────────────────────┘│
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │           API Client                     ││
│  │  POST /agent-connect                     ││
│  │  POST /agent-heartbeat                   ││
│  │  POST /agent-screenshot                  ││
│  │  POST /agent-app-log                     ││
│  │  POST /agent-website-log                 ││
│  │  POST /agent-activity                    ││
│  │  POST /agent-recording  (optional)       ││
│  │  POST /agent-disconnect                  ││
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
         │
         │ HTTPS
         ▼
┌─────────────────────┐
│  MonitorR Server    │
│  (Supabase Edge Fn) │
└─────────────────────┘
```

---

## 5. API Endpoints

**Base URL**: Configured per installation (e.g., `https://zzbpdvmoibyyrjntkdda.supabase.co/functions/v1`)

All authenticated endpoints require header: `X-Agent-Token: <session_token>`

### 5.1 Connect (Login)
```
POST /agent-connect
Content-Type: application/json

Body:
{
  "email": "employee@company.com",
  "device_info": {
    "os": "Windows 11",
    "hostname": "DESKTOP-ABC123",
    "version": "2.4.1"
  }
}

Response (200):
{
  "success": true,
  "data": {
    "employee_id": "uuid",
    "session_id": "uuid",
    "session_token": "uuid",        // ← STORE THIS! Used for all subsequent requests
    "employee_name": "John Doe",
    "company_id": "uuid",
    "settings": {
      "screenshot_interval": 5,
      "screenshot_interval_seconds": 300,
      "track_apps": true,
      "track_websites": true,
      "track_screenshots": true,
      "idle_threshold_minutes": 5,
      "blur_screenshots": false,
      "work_start_time": "09:00:00",
      "work_end_time": "18:00:00"
    }
  }
}
```

### 5.2 Heartbeat (Keep alive + get updated settings)
```
POST /agent-heartbeat
X-Agent-Token: <session_token>

Response (200):
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "employee_id": "uuid",
    "status": "active",
    "duration_minutes": 45,
    "server_time": "2026-02-06T10:30:00Z",
    "settings": {
      "screenshot_interval_seconds": 300,
      "track_screenshots": true,
      "track_apps": true,
      "track_websites": true,
      "blur_screenshots": false,
      "idle_threshold_minutes": 5
    }
  }
}
```

### 5.3 Screenshot Upload
```
POST /agent-screenshot
X-Agent-Token: <session_token>
Content-Type: application/json

Body:
{
  "screenshot_base64": "data:image/png;base64,iVBORw0KGgo...",
  "active_window": "Visual Studio Code - project.ts",
  "is_blurred": false
}

Response (200):
{
  "success": true,
  "data": { "id": "uuid", ... }
}
```

### 5.4 App Log
```
POST /agent-app-log
X-Agent-Token: <session_token>
Content-Type: application/json

Body:
{
  "app_name": "Visual Studio Code",
  "window_title": "main.ts - monitorr-agent",
  "started_at": "2026-02-06T10:00:00Z",
  "duration_seconds": 300,
  "category": "development",
  "is_productive": true
}
```

### 5.5 Website Log
```
POST /agent-website-log
X-Agent-Token: <session_token>
Content-Type: application/json

Body:
{
  "domain": "github.com",
  "full_url": "https://github.com/user/repo",
  "page_title": "Repository - GitHub",
  "visited_at": "2026-02-06T10:00:00Z",
  "duration_seconds": 120,
  "category": "development",
  "is_productive": true
}
```

### 5.6 Activity Log
```
POST /agent-activity
X-Agent-Token: <session_token>
Content-Type: application/json

Body:
{
  "keyboard_count": 150,
  "mouse_count": 200,
  "productivity_score": 85,
  "recorded_at": "2026-02-06T10:00:00Z"
}
```

### 5.7 Screen Recording Upload
```
POST /agent-recording
X-Agent-Token: <session_token>
Content-Type: multipart/form-data

Form Fields:
  video        — (File, required) The recorded video file (.webm format)
  duration_seconds — (string) Total recording duration in seconds
  started_at   — (string, ISO 8601) When recording started
  ended_at     — (string, ISO 8601) When recording ended

Response (200):
{
  "success": true,
  "data": {
    "id": "uuid",
    "employee_id": "uuid",
    "session_id": "uuid",
    "video_url": "employee_id/timestamp.webm",
    "duration_seconds": 300,
    "file_size_mb": 12.5,
    "status": "completed",
    ...
  }
}
```

> **Note**: Screen recording is optional and controlled by admin settings. The agent should only record when `enable_recording` is true (check via heartbeat or connect response). Use `MediaRecorder` or Electron's `desktopCapturer` to capture video as WebM.

### 5.8 Disconnect
```
POST /agent-disconnect
X-Agent-Token: <session_token>
Content-Type: application/json

Body: {} (empty)

Response (200):
{
  "success": true,
  "message": "Session ended successfully",
  "duration_minutes": 45
}
```

---

## 6. Authentication Flow

```
┌──────────┐          ┌──────────────┐
│  Agent   │          │   Server     │
└────┬─────┘          └──────┬───────┘
     │                       │
     │ 1. POST /agent-connect│
     │    {email, device_info}│
     │──────────────────────>│
     │                       │
     │ 2. Validates email    │
     │    Checks employee    │
     │    Creates session    │
     │                       │
     │ 3. Returns session_token
     │<──────────────────────│
     │                       │
     │ 4. Store token locally│
     │    (electron-store)   │
     │                       │
     │ 5. All subsequent     │
     │    requests use       │
     │    X-Agent-Token header
     │──────────────────────>│
     │                       │
```

### Token Persistence
- Store `session_token` using `electron-store`
- On app restart, try heartbeat with stored token
- If heartbeat returns 401 → token expired → show login again
- Token expires after 24 hours of inactivity (heartbeat extends it)

---

## 7. Core Features

### 7.1 Screenshot Capture (Silent, No Permission Prompt)

```typescript
// Uses Electron's desktopCapturer - NO user permission needed
import { desktopCapturer, screen } from 'electron';

async function captureScreenshot(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  });

  if (sources.length === 0) throw new Error('No screen source found');

  // Get the primary screen
  const primarySource = sources[0];
  
  // Convert to base64 PNG
  const image = primarySource.thumbnail;
  const base64 = image.toPNG().toString('base64');
  
  return `data:image/png;base64,${base64}`;
}
```

**Key Point**: `desktopCapturer` works silently in the main process. No browser permission dialog!

### 7.2 Active Window Tracking

```typescript
// Uses active-win package
import activeWin from 'active-win';
import { apiClient } from '../api/client';

interface AppUsage {
  appName: string;
  windowTitle: string;
  startedAt: Date;
  durationSeconds: number;
}

let currentApp: { name: string; title: string; since: Date } | null = null;
const appLog: AppUsage[] = [];

export async function trackActiveWindow() {
  const window = await activeWin();
  if (!window) return;

  const appName = window.owner.name;
  const windowTitle = window.title;

  if (currentApp && currentApp.name !== appName) {
    // App changed - log the previous one
    const duration = Math.floor((Date.now() - currentApp.since.getTime()) / 1000);
    appLog.push({
      appName: currentApp.name,
      windowTitle: currentApp.title,
      startedAt: currentApp.since,
      durationSeconds: duration
    });
    currentApp = { name: appName, title: windowTitle, since: new Date() };
  } else if (!currentApp) {
    currentApp = { name: appName, title: windowTitle, since: new Date() };
  } else {
    // Same app, update title
    currentApp.title = windowTitle;
  }
}

// Flush accumulated app logs to the server and clear the buffer
export async function flushAppLogs() {
  if (appLog.length === 0) return;

  const logsToSend = appLog.splice(0, appLog.length); // drain the buffer

  for (const log of logsToSend) {
    try {
      await apiClient.post('/agent-app-log', {
        app_name: log.appName,
        window_title: log.windowTitle,
        started_at: log.startedAt.toISOString(),
        duration_seconds: log.durationSeconds,
      });
    } catch (err) {
      console.error('Failed to send app log:', err);
    }
  }
}
```

### 7.3 Idle Detection

```typescript
import { powerMonitor } from 'electron';

function getIdleSeconds(): number {
  return powerMonitor.getSystemIdleTime(); // Returns seconds
}

function isIdle(thresholdMinutes: number): boolean {
  return getIdleSeconds() > thresholdMinutes * 60;
}
```

### 7.4 System Tray

```typescript
import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { apiClient } from './api/client';
import { scheduler } from './scheduler';

let tray: Tray | null = null;
let isPaused = false;

// Pause/resume all monitoring (screenshots, app tracking, activity, recording)
function pauseMonitoring() {
  isPaused = true;
  scheduler.pauseAll(); // Stop all capture timers
  updateTrayMenu();
}

function resumeMonitoring() {
  isPaused = false;
  scheduler.resumeAll(); // Restart all capture timers with current settings
  updateTrayMenu();
}

// Disconnect from server and clean up
async function disconnect() {
  try {
    scheduler.stopAll();        // Stop all timers
    scheduler.endWebRTC();      // End any active WebRTC stream
    scheduler.stopRecording();  // Stop any active recording
    await apiClient.post('/agent-disconnect', {});
  } catch (err) {
    console.error('Disconnect error:', err);
  }
}

// Rebuild tray menu with current state (call after status changes)
function updateTrayMenu() {
  if (!tray) return;

  const employeeName = apiClient.getEmployeeName() || 'Unknown';
  const isConnected = apiClient.isConnected();

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: `Status: ${isConnected ? 'Connected ✅' : 'Disconnected ❌'}`, 
      enabled: false 
    },
    { 
      label: `Employee: ${employeeName}`, 
      enabled: false 
    },
    { type: 'separator' },
    { 
      label: isPaused ? 'Resume Monitoring' : 'Pause Monitoring', 
      click: () => isPaused ? resumeMonitoring() : pauseMonitoring()
    },
    { 
      label: 'Disconnect', 
      click: async () => {
        await disconnect();
        updateTrayMenu(); // Refresh to show disconnected state
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: async () => {
        await disconnect();
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`MEN Agent - ${isPaused ? 'Paused' : isConnected ? 'Monitoring Active' : 'Disconnected'}`);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray-icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  updateTrayMenu();
}

// Export for use by other modules (e.g., auth flow updates tray after login)
export { createTray, updateTrayMenu, isPaused };
```

### 7.5 Auto-Launch on Boot

```typescript
import AutoLaunch from 'auto-launch';

const autoLauncher = new AutoLaunch({
  name: 'MEN Agent',
  isHidden: true, // Start minimized to tray
});

async function enableAutoLaunch() {
  const isEnabled = await autoLauncher.isEnabled();
  if (!isEnabled) {
    await autoLauncher.enable();
  }
}
```

### 7.6 Screen Recording (Optional)

```typescript
import { desktopCapturer } from 'electron';

// Only record when settings.enable_recording is true
// Use desktopCapturer to get a MediaStream, then MediaRecorder to capture WebM

async function startRecording(maxDurationMinutes: number): Promise<void> {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  if (sources.length === 0) return;

  // In a hidden BrowserWindow with access to MediaRecorder:
  // 1. navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } } })
  // 2. Create MediaRecorder with mimeType: 'video/webm;codecs=vp9'
  // 3. Collect chunks, stop after maxDurationMinutes
  // 4. Upload the Blob as FormData to /agent-recording

  // Quality mapping from server settings:
  // "low" → 480p, "medium" → 720p, "high" → 1080p
}
```

> **Important**: Recording is controlled by server settings (`enable_recording`, `recording_quality`, `max_recording_duration_minutes`). Only start recording when enabled. Upload completed recordings as multipart/form-data to `POST /agent-recording`.

### 7.7 Dynamic Settings (via Heartbeat)

The heartbeat response contains updated settings. The agent MUST update its behavior accordingly:

```typescript
let settings = {
  screenshotIntervalSeconds: 300,
  trackScreenshots: true,
  trackApps: true,
  trackWebsites: true,
  blurScreenshots: false,
  idleThresholdMinutes: 5,
};

async function heartbeat() {
  const response = await apiClient.post('/agent-heartbeat');
  
  if (response.data?.settings) {
    const newSettings = response.data.settings;
    
    // Update screenshot interval if changed
    if (newSettings.screenshot_interval_seconds !== settings.screenshotIntervalSeconds) {
      settings.screenshotIntervalSeconds = newSettings.screenshot_interval_seconds;
      restartScreenshotTimer(); // Restart with new interval
    }
    
    // Update all toggles
    settings.trackScreenshots = newSettings.track_screenshots;
    settings.trackApps = newSettings.track_apps;
    settings.trackWebsites = newSettings.track_websites;
    settings.blurScreenshots = newSettings.blur_screenshots;
    settings.idleThresholdMinutes = newSettings.idle_threshold_minutes;
  }
}
```

---

## 8. File Structure

```
monitorr-agent/
├── assets/
│   ├── icon.ico          # Windows icon
│   ├── icon.icns         # macOS icon
│   ├── icon.png          # Linux icon (512x512)
│   └── tray-icon.png     # System tray icon (16x16, 32x32)
├── src/
│   ├── main.ts           # Electron main entry point
│   ├── config.ts         # Server URL, app settings
│   ├── api/
│   │   └── client.ts     # HTTP client with X-Agent-Token header
│   ├── auth/
│   │   ├── login.ts      # Login window / email input
│   │   └── store.ts      # Token persistence (electron-store)
│   ├── capture/
│   │   ├── screenshot.ts # desktopCapturer screenshot logic
│   │   ├── recording.ts  # Screen recording (WebM capture + upload)
│   │   ├── activeWin.ts  # Active window tracking
│   │   └── idle.ts       # Idle detection
│   ├── scheduler/
│   │   └── index.ts      # Timer management for all periodic tasks
│   ├── tray/
│   │   └── index.ts      # System tray setup
│   └── utils/
│       └── logger.ts     # File-based logging
├── tsconfig.json
├── package.json
└── electron-builder.yml
```

---

## 9. Step-by-Step Implementation

### Step 1: Main Process Entry (`src/main.ts`)

```typescript
import { app, BrowserWindow } from 'electron';
import { createTray } from './tray';
import { checkStoredToken, showLoginWindow } from './auth/login';
import { startScheduler, stopScheduler, scheduler } from './scheduler';
import { enableAutoLaunch } from './config';

// Hide from dock (macOS)
app.dock?.hide();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  // Enable auto-launch
  await enableAutoLaunch();
  
  // Create system tray
  createTray();
  
  // Check for stored session
  const hasValidSession = await checkStoredToken();
  
  if (hasValidSession) {
    // Resume monitoring
    startScheduler();
  } else {
    // Show login
    showLoginWindow();
  }
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault(); // Don't quit when windows close - stay in tray
});
```

### Step 2: API Client (`src/api/client.ts`)

```typescript
import fetch from 'node-fetch';
import { getToken, getServerUrl } from '../auth/store';

class ApiClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    const token = getToken();
    if (token) {
      headers['X-Agent-Token'] = token;
    }
    
    return headers;
  }

  async post(endpoint: string, body?: any): Promise<any> {
    const serverUrl = getServerUrl();
    const url = `${serverUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : '{}',
    });

    if (response.status === 401) {
      // Token expired - trigger re-login
      this.onAuthExpired();
      throw new Error('Session expired');
    }

    return response.json();
  }

  private onAuthExpired() {
    const { stopScheduler } = require('../scheduler');
    const { showLoginWindow } = require('../auth/login');
    stopScheduler();
    showLoginWindow();
  }
}

export const apiClient = new ApiClient();
```

### Step 3: Login Window (`src/auth/login.ts`)

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import { apiClient } from '../api/client';
import { saveToken, saveEmployeeInfo } from './store';
import { startScheduler } from '../scheduler';
import os from 'os';
import path from 'path';

let loginWindow: BrowserWindow | null = null;

export function showLoginWindow() {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  loginWindow.loadFile('src/auth/login.html');
  
  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

// Handle login from renderer
ipcMain.handle('agent-login', async (_, email: string) => {
  try {
    const result = await apiClient.post('/agent-connect', {
      email,
      device_info: {
        os: `${os.platform()} ${os.release()}`,
        hostname: os.hostname(),
        version: app.getVersion(),
      }
    });

    if (result.success) {
      // Save credentials
      saveToken(result.data.session_token);
      saveEmployeeInfo({
        employeeId: result.data.employee_id,
        sessionId: result.data.session_id,
        name: result.data.employee_name,
        companyId: result.data.company_id,
      });

      // Close login window
      loginWindow?.close();
      
      // Start monitoring
      startScheduler();
      
      return { success: true, name: result.data.employee_name };
    } else {
      return { success: false, error: result.error };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});
```

### Step 4: Login HTML (`src/auth/login.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <title>MEN Agent - Login</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0; background: #1a1a2e;
      color: #e0e0e0;
    }
    .container {
      text-align: center; padding: 40px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
    p { color: #888; margin-bottom: 24px; }
    input {
      width: 280px; padding: 12px 16px;
      border: 1px solid #333; border-radius: 8px;
      background: #16213e; color: #fff;
      font-size: 14px; outline: none;
    }
    input:focus { border-color: #0f3460; }
    button {
      width: 280px; padding: 12px;
      background: #0f3460; color: white;
      border: none; border-radius: 8px;
      font-size: 14px; cursor: pointer;
      margin-top: 12px;
    }
    button:hover { background: #1a4a7a; }
    .error { color: #e74c3c; font-size: 12px; margin-top: 8px; }
    .loading { opacity: 0.6; pointer-events: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MEN Agent</h1>
    <p>Enter your work email to connect</p>
    <form id="loginForm">
      <input type="email" id="email" placeholder="your@company.com" required />
      <br>
      <button type="submit" id="loginBtn">Connect</button>
      <div id="error" class="error"></div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const btn = document.getElementById('loginBtn');
      const errorEl = document.getElementById('error');
      
      btn.textContent = 'Connecting...';
      btn.classList.add('loading');
      errorEl.textContent = '';
      
      const result = await window.electronAPI.login(email);
      
      if (!result.success) {
        errorEl.textContent = result.error;
        btn.textContent = 'Connect';
        btn.classList.remove('loading');
      }
    });
  </script>
</body>
</html>
```

### Step 5: Scheduler (`src/scheduler/index.ts`)

```typescript
import { captureAndUploadScreenshot } from '../capture/screenshot';
import { trackActiveWindow, flushAppLogs } from '../capture/activeWin';
import { getIdleSeconds } from '../capture/idle';
import { startRecording, stopRecording as stopActiveRecording } from '../capture/recording';
import { apiClient } from '../api/client';
import { stopCurrentStream } from '../streaming/manager';

let heartbeatTimer: NodeJS.Timer | null = null;
let screenshotTimer: NodeJS.Timer | null = null;
let activityTimer: NodeJS.Timer | null = null;
let windowTracker: NodeJS.Timer | null = null;
let appLogFlusher: NodeJS.Timer | null = null;
let recordingTimer: NodeJS.Timer | null = null;
let isPaused = false;

let settings = {
  screenshotIntervalSeconds: 300,
  trackScreenshots: true,
  trackApps: true,
  trackWebsites: true,
  blurScreenshots: false,
  idleThresholdMinutes: 5,
  enableRecording: false,
  recordingQuality: 'medium',
  maxRecordingDurationMinutes: 30,
};

let activityCounters = {
  keyboardCount: 0,
  mouseCount: 0,
};

// --- Productivity calculation ---
// Simple heuristic based on input activity within the reporting interval.
function calculateProductivity(): number {
  const total = activityCounters.keyboardCount + activityCounters.mouseCount;
  if (total === 0) return 0;
  // Cap at 100; scale linearly — 350+ combined events/min ≈ 100 %
  return Math.min(100, Math.round((total / 350) * 100));
}

// --- Timer helpers ---
function clearAllTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (screenshotTimer) { clearInterval(screenshotTimer); screenshotTimer = null; }
  if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
  if (windowTracker) { clearInterval(windowTracker); windowTracker = null; }
  if (appLogFlusher) { clearInterval(appLogFlusher); appLogFlusher = null; }
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
}

function startCaptureTimers() {
  // Screenshot based on settings
  startScreenshotTimer();

  // Track active window every 5 seconds
  windowTracker = setInterval(trackActiveWindow, 5000);

  // Send activity log every 60 seconds
  activityTimer = setInterval(sendActivityLog, 60 * 1000);

  // Flush app logs every 30 seconds
  appLogFlusher = setInterval(flushAppLogs, 30 * 1000);

  // Start recording if enabled by server settings
  if (settings.enableRecording) {
    startRecordingSession();
  }
}

// --- Public scheduler API (used by tray and main process) ---

export function startScheduler() {
  isPaused = false;

  // Heartbeat every 60 seconds
  heartbeatTimer = setInterval(doHeartbeat, 60 * 1000);
  doHeartbeat(); // Immediate first heartbeat

  startCaptureTimers();
}

export function stopScheduler() {
  clearAllTimers();
}

// The scheduler object exposes granular control methods for the tray menu
export const scheduler = {
  /** Pause all capture timers (heartbeat keeps running) */
  pauseAll() {
    isPaused = true;
    if (screenshotTimer) { clearInterval(screenshotTimer); screenshotTimer = null; }
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    if (windowTracker) { clearInterval(windowTracker); windowTracker = null; }
    if (appLogFlusher) { clearInterval(appLogFlusher); appLogFlusher = null; }
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  },

  /** Resume capture timers after a pause */
  resumeAll() {
    isPaused = false;
    startCaptureTimers();
  },

  /** Stop everything including heartbeat */
  stopAll() {
    clearAllTimers();
  },

  /** End any active WebRTC live-stream */
  endWebRTC() {
    stopCurrentStream(); // delegates to streaming/manager.ts
  },

  /** Stop any active screen recording session */
  stopRecording() {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    stopActiveRecording(); // stop & upload the current recording chunk
  },
};

// --- Internal functions ---

function startScreenshotTimer() {
  if (screenshotTimer) clearInterval(screenshotTimer);

  if (settings.trackScreenshots) {
    screenshotTimer = setInterval(() => {
      // Don't capture if idle or paused
      if (!isIdle() && !isPaused) {
        captureAndUploadScreenshot(settings.blurScreenshots);
      }
    }, settings.screenshotIntervalSeconds * 1000);
  }
}

let isRecording = false;

// Start a recording session: record for maxRecordingDurationMinutes, upload, repeat
function startRecordingSession() {
  if (isRecording) return;
  isRecording = true;

  const durationMs = settings.maxRecordingDurationMinutes * 60 * 1000;

  // Start the first recording chunk immediately
  startRecording(settings.recordingQuality, settings.maxRecordingDurationMinutes);

  // Set up a recurring timer to cycle recording chunks
  recordingTimer = setInterval(() => {
    if (!isPaused && !isIdle()) {
      // stopActiveRecording triggers upload of the completed chunk
      stopActiveRecording();
      // Start a new chunk
      startRecording(settings.recordingQuality, settings.maxRecordingDurationMinutes);
    }
  }, durationMs);
}

function stopRecordingSession() {
  isRecording = false;
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  stopActiveRecording(); // stop & upload final chunk
}

async function doHeartbeat() {
  try {
    const result = await apiClient.post('/agent-heartbeat');

    if (result.success && result.data?.settings) {
      const newSettings = result.data.settings;

      // Check if screenshot interval changed
      const intervalChanged = newSettings.screenshot_interval_seconds !== settings.screenshotIntervalSeconds;

      // Update settings
      settings.screenshotIntervalSeconds = newSettings.screenshot_interval_seconds;
      settings.trackScreenshots = newSettings.track_screenshots;
      settings.trackApps = newSettings.track_apps;
      settings.trackWebsites = newSettings.track_websites;
      settings.blurScreenshots = newSettings.blur_screenshots;
      settings.idleThresholdMinutes = newSettings.idle_threshold_minutes;

      // Recording settings (from server)
      const wasRecording = settings.enableRecording;
      settings.enableRecording = newSettings.enable_recording ?? false;
      settings.recordingQuality = newSettings.recording_quality ?? 'medium';
      settings.maxRecordingDurationMinutes = newSettings.max_recording_duration_minutes ?? 30;

      // Restart screenshot timer if interval changed
      if (intervalChanged && !isPaused) {
        startScreenshotTimer();
      }

      // Dynamically toggle recording based on server settings
      if (settings.enableRecording && !wasRecording && !isPaused) {
        startRecordingSession();
      } else if (!settings.enableRecording && wasRecording) {
        stopRecordingSession();
      }

      // Handle pending WebRTC stream request
      if (result.data.pending_stream_request) {
        const req = result.data.pending_stream_request;
        if (req.status === 'pending') {
          // Import dynamically to avoid circular deps
          const { handlePendingStreamRequest } = require('../streaming/manager');
          const { getToken, getServerUrl } = require('../auth/store');
          handlePendingStreamRequest(req.id, getServerUrl(), getToken());
        }
      }
    }
  } catch (err) {
    console.error('Heartbeat failed:', err);
  }
}

function isIdle(): boolean {
  return getIdleSeconds() > settings.idleThresholdMinutes * 60;
}

async function sendActivityLog() {
  if (activityCounters.keyboardCount === 0 && activityCounters.mouseCount === 0) return;

  try {
    await apiClient.post('/agent-activity', {
      keyboard_count: activityCounters.keyboardCount,
      mouse_count: activityCounters.mouseCount,
      productivity_score: calculateProductivity(),
      recorded_at: new Date().toISOString(),
    });

    // Reset counters
    activityCounters.keyboardCount = 0;
    activityCounters.mouseCount = 0;
  } catch (err) {
    console.error('Activity log failed:', err);
  }
}
```

### Step 6: Token Storage (`src/auth/store.ts`)

```typescript
import Store from 'electron-store';

const store = new Store({
  encryptionKey: 'monitorr-agent-v1', // Basic encryption
});

export function saveToken(token: string) {
  store.set('sessionToken', token);
}

export function getToken(): string | null {
  return store.get('sessionToken') as string | null;
}

export function clearToken() {
  store.delete('sessionToken');
}

export function saveServerUrl(url: string) {
  store.set('serverUrl', url);
}

export function getServerUrl(): string {
  return store.get('serverUrl') as string || '';
}

export function saveEmployeeInfo(info: {
  employeeId: string;
  sessionId: string;
  name: string;
  companyId: string;
}) {
  store.set('employeeInfo', info);
}

export function getEmployeeInfo() {
  return store.get('employeeInfo') as any;
}
```

---

## 10. Build & Distribution

### Build Commands

```bash
# Windows (.exe installer)
npm run build:win
# Output: dist/MEN-2.4.1.exe

# macOS (.dmg)
npm run build:mac
# Output: dist/MEN-2.4.1.dmg

# Linux (.AppImage + .deb)
npm run build:linux
# Output: dist/MEN-2.4.1.AppImage, dist/MEN-2.4.1.deb
```

### Hosting Binaries
Upload built files to any file hosting:
- GitHub Releases (free)
- AWS S3
- Google Cloud Storage
- Your own server

Then update the `agent_versions` table in MonitorR dashboard with download URLs.

---

## 11. Configuration

### Server URL Configuration (via `config.json`)

The agent connects to the server using a `config.json` file that is **automatically generated** by the MonitorR web dashboard when an employee downloads the agent. The employee never manually creates or edits this file — they just extract the ZIP and install.

**`config.json` format:**
```json
{
  "serverUrl": "https://your-project.supabase.co/functions/v1"
}
```

**The agent MUST look for `config.json` in these locations (in order of priority):**

1. **Same directory as the executable** (primary — this is where the download ZIP places it)
2. **OS-specific app data directory** (fallback):
   - **Windows**: `%APPDATA%/MonitorR/config.json`
   - **macOS**: `~/Library/Application Support/MonitorR/config.json`
   - **Linux**: `~/.config/MonitorR/config.json`

```typescript
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

function loadConfig(): { serverUrl: string } {
  const locations = [
    // 1. Same directory as executable
    path.join(path.dirname(process.execPath), 'config.json'),
    // 2. Resources directory (for packaged apps)
    path.join(process.resourcesPath || '', 'config.json'),
    // 3. OS-specific app data
    path.join(app.getPath('userData'), 'config.json'),
  ];

  for (const loc of locations) {
    try {
      if (fs.existsSync(loc)) {
        const data = JSON.parse(fs.readFileSync(loc, 'utf-8'));
        if (data.serverUrl) {
          console.log('Config loaded from:', loc);
          return data;
        }
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('config.json not found. Please re-download the agent from your dashboard.');
}
```

> **Important**: If no `config.json` is found, show an error dialog telling the employee to re-download the agent from their company dashboard. Do NOT prompt for manual URL entry — the config is always auto-generated.

### Required Permissions (macOS)

Add to `Info.plist` via electron-builder:
```json
{
  "mac": {
    "extendInfo": {
      "NSScreenCaptureUsageDescription": "MEN Agent needs screen capture permission to take periodic screenshots for productivity monitoring."
    }
  }
}
```

> **Note**: macOS requires one-time Screen Recording permission grant in System Preferences → Privacy & Security → Screen Recording. The agent should guide users to enable this on first run.

### Required Permissions (Windows)
No special permissions needed. Screenshots work out of the box.

### Required Permissions (Linux)
No special permissions needed on X11. Wayland may require `xdg-desktop-portal` for screen capture.

---

## 12. WebRTC Live Video Streaming

### Overview

In addition to periodic screenshot capture, the agent supports **real-time video streaming** when requested by an admin. This uses WebRTC for peer-to-peer video transmission — no extra servers needed (except STUN/TURN for NAT traversal).

### How it works

1. Admin clicks "Start Live Stream" on dashboard → creates a `stream_request` record
2. Agent's **heartbeat response** includes a `pending_stream_request` field
3. Agent detects the request → captures screen via `desktopCapturer` as MediaStream → creates WebRTC offer
4. Signaling happens via REST endpoint: `POST /agent-signal`
5. Admin receives offer via Supabase Realtime → sends answer back
6. WebRTC peer connection established → direct video stream from agent to admin

### Heartbeat Response (new field)

```json
{
  "data": {
    "settings": { ... },
    "pending_stream_request": {
      "id": "uuid",
      "status": "pending"
    }
  }
}
```

### Signaling Endpoint: `POST /agent-signal`

**Headers**: `X-Agent-Token: <session_token>`

#### Poll for requests and admin signals:
```json
{
  "action": "poll"
}
```
**Response**:
```json
{
  "data": {
    "stream_request": { "id": "uuid", "status": "pending" },
    "admin_signals": [
      { "signal_type": "answer", "signal_data": { "type": "answer", "sdp": "..." } },
      { "signal_type": "ice-candidate", "signal_data": { ... } }
    ]
  }
}
```

#### Send SDP offer or ICE candidate:
```json
{
  "action": "signal",
  "stream_request_id": "uuid",
  "signal_type": "offer",
  "signal_data": {
    "type": "offer",
    "sdp": "v=0\r\no=- ..."
  }
}
```

#### Reject a stream request:
```json
{
  "action": "reject",
  "stream_request_id": "uuid"
}
```

#### End an active stream:
```json
{
  "action": "end",
  "stream_request_id": "uuid"
}
```

### Agent Implementation

> **IMPORTANT**: WebRTC APIs (`RTCPeerConnection`, `MediaStream`, `navigator.mediaDevices`) are only
> available in Electron's **renderer process**. The streaming logic must run inside a hidden
> `BrowserWindow`. The main process coordinates via IPC.

#### Architecture

```
Main Process                          Hidden BrowserWindow (Renderer)
─────────────                         ──────────────────────────────
heartbeat detects                     
  pending_stream_request  ──IPC──►   startStream(requestId, serverUrl, token)
                                       │
                                       ├─ desktopCapturer.getSources()
                                       ├─ getUserMedia({ chromeMediaSource: 'desktop' })
                                       ├─ new RTCPeerConnection(config)
                                       ├─ pc.addTrack(videoTrack)
                                       ├─ pc.createOffer() → POST /agent-signal {action:'signal'}
                                       ├─ poll /agent-signal {action:'poll'} every 1s
                                       │    └─ on answer → pc.setRemoteDescription(answer)
                                       │    └─ on ice-candidate → pc.addIceCandidate(candidate)
                                       └─ connected ✓ → stop polling
                                     
stopStream()            ──IPC──►     stopStream() → tracks.stop(), pc.close()
                                       POST /agent-signal {action:'end'}
```

#### Main Process: `src/streaming/manager.ts`

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let streamWindow: BrowserWindow | null = null;
let currentStreamRequestId: string | null = null;

export function handlePendingStreamRequest(
  requestId: string,
  serverUrl: string,
  sessionToken: string
) {
  if (currentStreamRequestId === requestId) return; // Already handling
  currentStreamRequestId = requestId;

  const payload = { requestId, serverUrl, sessionToken };

  if (!streamWindow) {
    streamWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    streamWindow.loadFile(path.join(__dirname, '../streaming/stream.html'));
    streamWindow.on('closed', () => {
      streamWindow = null;
      currentStreamRequestId = null;
    });

    // First time — wait for page to load, then send start-stream
    streamWindow.webContents.once('did-finish-load', () => {
      streamWindow?.webContents.send('start-stream', payload);
    });
  } else {
    // Window already exists and is loaded — send start-stream immediately
    streamWindow.webContents.send('start-stream', payload);
  }
}

export function stopCurrentStream() {
  if (streamWindow) {
    streamWindow.webContents.send('stop-stream');
  }
  currentStreamRequestId = null;
}

// Listen for stream status updates from renderer
ipcMain.on('stream-status', (_event, status: string) => {
  console.log('[WebRTC] Stream status:', status);
  if (status === 'ended' || status === 'failed') {
    currentStreamRequestId = null;
    streamWindow?.close();
    streamWindow = null;
  }
});
```

#### Preload Script Addition: `src/preload.ts`

```typescript
// Add to your existing preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentStream', {
  onStartStream: (callback: (data: any) => void) =>
    ipcRenderer.on('start-stream', (_e, data) => callback(data)),
  onStopStream: (callback: () => void) =>
    ipcRenderer.on('stop-stream', () => callback()),
  sendStatus: (status: string) =>
    ipcRenderer.send('stream-status', status),
});
```

#### Hidden Renderer: `src/streaming/stream.html`

```html
<!DOCTYPE html>
<html><head><title>WebRTC Stream</title></head>
<body>
<script src="stream-renderer.js"></script>
</body></html>
```

#### Renderer Logic: `src/streaming/stream-renderer.ts`

```typescript
// This runs in the hidden BrowserWindow renderer process
// where WebRTC APIs are available natively

declare global {
  interface Window {
    agentStream: {
      onStartStream: (cb: (data: any) => void) => void;
      onStopStream: (cb: () => void) => void;
      sendStatus: (status: string) => void;
    };
  }
}

let pc: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Add TURN server for corporate firewalls:
  // { urls: 'turn:your-turn-server.com', username: '...', credential: '...' }
];

async function startStream(requestId: string, serverUrl: string, token: string) {
  try {
    window.agentStream.sendStatus('connecting');

    // 1. Capture screen via desktopCapturer constraint
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 15,
        },
      } as any,
    });

    // 2. Create peer connection
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // 3. Add video tracks
    stream.getTracks().forEach(track => {
      pc!.addTrack(track, stream!);
    });

    // 4. Send ICE candidates to server
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await fetch(`${serverUrl}/agent-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
          body: JSON.stringify({
            action: 'signal',
            stream_request_id: requestId,
            signal_type: 'ice-candidate',
            signal_data: event.candidate.toJSON(),
          }),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState;
      window.agentStream.sendStatus(state || 'unknown');
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        cleanup(requestId, serverUrl, token);
      }
    };

    // 5. Create and send SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await fetch(`${serverUrl}/agent-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
      body: JSON.stringify({
        action: 'signal',
        stream_request_id: requestId,
        signal_type: 'offer',
        signal_data: { type: offer.type, sdp: offer.sdp },
      }),
    });

    // 6. Poll for admin answer and ICE candidates
    const processedSignals = new Set<string>();
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${serverUrl}/agent-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
          body: JSON.stringify({ action: 'poll' }),
        });
        const data = await res.json();
        const signals = data.data?.admin_signals || [];

        for (const signal of signals) {
          if (processedSignals.has(signal.id)) continue;
          processedSignals.add(signal.id);

          if (signal.signal_type === 'answer' && pc && !pc.remoteDescription) {
            await pc.setRemoteDescription(signal.signal_data);
          } else if (signal.signal_type === 'ice-candidate' && pc) {
            try {
              await pc.addIceCandidate(signal.signal_data);
            } catch (e) {
              console.warn('Failed to add ICE candidate:', e);
            }
          }
        }

        // Stop polling once connected
        if (pc?.connectionState === 'connected' && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
          window.agentStream.sendStatus('connected');
        }
      } catch (e) {
        console.warn('Signal poll error:', e);
      }
    }, 1000);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pc && pc.connectionState !== 'connected') {
        console.warn('WebRTC connection timed out');
        cleanup(requestId, serverUrl, token);
        window.agentStream.sendStatus('failed');
      }
    }, 30000);

  } catch (err) {
    console.error('WebRTC start error:', err);
    window.agentStream.sendStatus('failed');
  }
}

function cleanup(requestId: string, serverUrl: string, token: string) {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  stream?.getTracks().forEach(t => t.stop());
  pc?.close();
  pc = null;
  stream = null;

  // Notify server
  fetch(`${serverUrl}/agent-signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
    body: JSON.stringify({ action: 'end', stream_request_id: requestId }),
  }).catch(() => {});

  window.agentStream.sendStatus('ended');
}

// Listen for IPC commands
let currentRequestId = '';
let currentServerUrl = '';
let currentToken = '';

window.agentStream.onStartStream((data) => {
  currentRequestId = data.requestId;
  currentServerUrl = data.serverUrl;
  currentToken = data.sessionToken;
  startStream(data.requestId, data.serverUrl, data.sessionToken);
});

window.agentStream.onStopStream(() => {
  cleanup(currentRequestId, currentServerUrl, currentToken);
});
```

### Integration with Heartbeat

In the heartbeat handler, check for pending stream requests:

```typescript
// In heartbeat callback
if (heartbeatData.pending_stream_request) {
  const request = heartbeatData.pending_stream_request;
  if (request.status === 'pending' && !currentlyStreaming) {
    console.log('Admin requested live stream, starting WebRTC...');
    webrtcStreamer.startStream(request.id);
  }
}
```

### TURN Server (Recommended for Production)

For agents behind corporate firewalls/NAT, you'll need a TURN server. Options:
- **Metered.ca** — free tier with 500MB/month
- **Twilio TURN** — ~$0.40/GB
- **Self-hosted coturn** — free but requires server

---

## Error Handling Checklist

- [ ] Network offline → Queue data locally, retry when online
- [ ] Token expired (401) → Clear token, show login
- [ ] Server unreachable → Retry with exponential backoff
- [ ] Screenshot capture fails → Log error, skip this cycle
- [ ] Disk space low → Warn user via tray notification
- [ ] Multiple instances → Use `app.requestSingleInstanceLock()`
- [ ] WebRTC stream request → Attempt connection, timeout after 30s if TURN unavailable

---

## Testing Checklist

- [ ] Login with valid employee email
- [ ] Login with invalid email → shows error
- [ ] Login with inactive account → shows error
- [ ] Screenshots captured at configured interval
- [ ] Screenshot interval changes via dashboard → agent updates
- [ ] App tracking logs correct app names
- [ ] Idle detection pauses screenshots
- [ ] Tray icon shows correct status
- [ ] Disconnect from tray menu
- [ ] Auto-start on system boot
- [ ] Token persistence across restarts
- [ ] Heartbeat keeps session alive
- [ ] Graceful handling when server is down
- [ ] Screen recording starts when enable_recording is true
- [ ] Recording respects max_recording_duration_minutes
- [ ] Recording quality matches server setting (low/medium/high)
- [ ] Recording uploads successfully as WebM to /agent-recording
- [ ] Recording stops gracefully on disconnect
- [ ] WebRTC stream starts on admin request via heartbeat
- [ ] WebRTC signaling completes (offer → answer → ICE)
- [ ] Live video streams to admin dashboard
- [ ] Stream ends cleanly on admin disconnect or agent stop
