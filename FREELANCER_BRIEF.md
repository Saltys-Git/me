# MonitorR Desktop Agent — Freelancer Project Brief

> **Last Updated**: February 2026
> **Full Technical Spec**: See `ELECTRON_AGENT_SPEC.md` (included with this brief)

---

## 📋 Project Summary

Build an **Electron.js desktop agent** (system tray app) for our employee monitoring platform **MonitorR**. The agent runs silently in the background, captures productivity data, and sends it to our existing REST API. The server-side is already fully built — you only need to build the desktop client.

**Platforms**: Windows, macOS, and Linux
**Budget**: [Your budget here]
**Timeline**: [Your timeline here]

---

## 🎯 What the Agent Does

The agent is a **background system tray application** — no visible window after login. It:

1. **Authenticates** the employee via email
2. **Captures screenshots** silently at configurable intervals
3. **Records screen video** (optional, when admin enables it)
4. **Tracks active applications** (which app, how long)
5. **Tracks website usage** (from browser window titles)
6. **Monitors keyboard/mouse activity** (counts only, NOT keylogging)
7. **Streams live video** to admin dashboard via WebRTC (on-demand)
8. **Auto-launches** on system boot
9. **Runs silently** in system tray with minimal UI

---

## 🛠️ Tech Stack (Required)

| Component | Technology |
|-----------|-----------|
| Framework | **Electron** v28+ |
| Language | **TypeScript** |
| Screenshot | `electron.desktopCapturer` (built-in, no permission prompt) |
| Active Window | [`active-win`](https://www.npmjs.com/package/active-win) |
| HTTP Client | `node-fetch` or Electron's `net` module |
| Auto-launch | [`auto-launch`](https://www.npmjs.com/package/auto-launch) |
| Token Storage | [`electron-store`](https://www.npmjs.com/package/electron-store) |
| Build Tool | [`electron-builder`](https://www.electron.build/) |
| Tray Icon | Electron's `Tray` + `Menu` API |
| WebRTC | Built-in Chromium WebRTC (for live streaming) |

---

## 🔌 API Endpoints (All Pre-Built)

**Base URL**: Read from `config.json` (auto-generated, see Configuration section below)

All authenticated endpoints require header: `X-Agent-Token: <session_token>`

| # | Endpoint | Purpose | Auth |
|---|----------|---------|------|
| 1 | `POST /agent-connect` | Login with email → get session token | No |
| 2 | `POST /agent-heartbeat` | Keep alive + get updated settings (every 60s) | Yes |
| 3 | `POST /agent-screenshot` | Upload captured screenshot (base64 JSON) | Yes |
| 4 | `POST /agent-app-log` | Report active application usage | Yes |
| 5 | `POST /agent-website-log` | Report website visits | Yes |
| 6 | `POST /agent-activity` | Report keyboard/mouse activity counts | Yes |
| 7 | `POST /agent-recording` | Upload screen recording (multipart/form-data) | Yes |
| 8 | `POST /agent-signal` | WebRTC signaling for live video streaming | Yes |
| 9 | `POST /agent-disconnect` | End session on quit | Yes |

> **Complete request/response formats with code samples are in `ELECTRON_AGENT_SPEC.md`** — please read it thoroughly.

---

## 📱 Feature Details

### Feature 1: Login (Email-Only Authentication)

- Show a simple login window with email field
- `POST /agent-connect` with email + device info (OS, hostname, app version)
- Server returns `session_token` → store locally with `electron-store`
- On app restart, validate stored token via heartbeat. If 401 → show login again
- **No password needed** — the server authenticates by email + employee record

### Feature 2: Heartbeat (Every 60 Seconds)

- `POST /agent-heartbeat` with `X-Agent-Token` header
- Server returns updated **settings** that control agent behavior:
  - `screenshot_interval_seconds` — how often to capture (minimum 10s)
  - `track_screenshots` — enable/disable screenshot capture
  - `track_apps` — enable/disable app tracking
  - `track_websites` — enable/disable website tracking
  - `blur_screenshots` — whether to blur captured images
  - `idle_threshold_minutes` — idle time before pausing capture
  - `enable_recording` — whether to record video
  - `recording_quality` — low (480p) / medium (720p) / high (1080p)
  - `max_recording_duration_minutes` — max video length per clip
- **Also returns** `pending_stream_request` — if present, start WebRTC live stream (see Feature 8)
- **CRITICAL**: Agent MUST dynamically update its behavior when settings change. If admin changes screenshot interval from 300s to 30s, the agent should apply it on next heartbeat without restart.

### Feature 3: Screenshot Capture

- Use `electron.desktopCapturer` — **silent, no permission prompt on Windows/Linux**
- macOS requires one-time Screen Recording permission (guide user on first run)
- Capture at the interval specified by `screenshot_interval_seconds` from heartbeat
- Skip capture when user is idle (no keyboard/mouse activity)
- Send as base64 JSON to `POST /agent-screenshot`:
  ```json
  {
    "screenshot_base64": "data:image/png;base64,...",
    "active_window": "Visual Studio Code - main.ts",
    "is_blurred": false
  }
  ```
- If `blur_screenshots` is true, apply a Gaussian blur before sending

### Feature 4: App Tracking

- Use `active-win` package to detect the currently focused application
- Track: app name, window title, start time, duration
- When the user switches to a different app, log the previous one
- Send to `POST /agent-app-log` every 30 seconds (batch)
- Only track when `track_apps` is true

### Feature 5: Website Tracking

- Detect browser URLs from **window titles** (most browsers show "Page Title — Browser Name")
- Extract domain from title when possible
- Send to `POST /agent-website-log`
- Only track when `track_websites` is true

### Feature 6: Activity Tracking

- Count keyboard events and mouse events (counts only — **never log keystrokes**)
- Calculate a simple productivity score (e.g., based on activity level)
- Send to `POST /agent-activity` every 60 seconds
- Reset counters after each send

### Feature 7: Screen Recording (Optional)

- **Only activate when** `enable_recording` is `true` in heartbeat settings
- Use `desktopCapturer` to get MediaStream + `MediaRecorder` to capture WebM video
- Quality mapping: `"low"` → 480p, `"medium"` → 720p, `"high"` → 1080p
- Stop recording after `max_recording_duration_minutes` (then start a new clip)
- Upload completed videos as multipart/form-data to `POST /agent-recording`
- Fields: `video` (WebM file), `duration_seconds`, `started_at`, `ended_at`

### Feature 8: WebRTC Live Video Streaming (On-Demand)

This is the most advanced feature. When an admin requests a live stream:

1. Heartbeat response includes `pending_stream_request: { id: "uuid", status: "pending" }`
2. Agent captures screen as a live `MediaStream` via `desktopCapturer`
3. Agent creates `RTCPeerConnection` with STUN servers
4. Agent sends SDP offer via `POST /agent-signal` with `action: "signal"`
5. Agent polls `POST /agent-signal` with `action: "poll"` to receive admin's SDP answer and ICE candidates
6. WebRTC peer-to-peer connection established — video streams directly to admin browser
7. Stream ends when admin disconnects or agent calls `action: "end"`

**STUN Servers** (free, built-in):
```javascript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
```

**TURN server** configuration should be supported for corporate firewalls (can be added later).

> **Complete WebRTC implementation code is in `ELECTRON_AGENT_SPEC.md` Section 12.**

### Feature 9: Disconnect

- `POST /agent-disconnect` when user quits from tray menu
- Clean up all timers, stop recording, end any WebRTC stream
- Keep stored token for next launch (unless user explicitly logs out)

---

## 🔧 Configuration (`config.json`)

The agent gets its server URL from a `config.json` file that is **auto-generated** by our web dashboard. Employees download a ZIP that includes the binary + this config file. **They never manually edit it.**

```json
{
  "serverUrl": "https://example-project.supabase.co/functions/v1"
}
```

**The agent MUST look for `config.json` in these locations (in order):**

1. **Same directory as the executable** (primary — where the ZIP extracts it)
2. **Resources path** (`process.resourcesPath`) for packaged apps
3. **OS-specific app data** (fallback):
   - Windows: `%APPDATA%/MonitorR/config.json`
   - macOS: `~/Library/Application Support/MonitorR/config.json`
   - Linux: `~/.config/MonitorR/config.json`

If no config found → show error dialog: "Please re-download the agent from your company dashboard."

**Do NOT hardcode the server URL. Do NOT prompt for manual URL entry.**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Electron Main Process              │
│                                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ TrayMgr  │  │ AuthMgr   │  │ ConfigLoader │ │
│  └──────────┘  └───────────┘  └──────────────┘ │
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │           Scheduler (Timers)                ││
│  │  ┌────────┐ ┌──────────┐ ┌──────────────┐  ││
│  │  │Heartbt │ │Screenshot│ │ActivityTrack │  ││
│  │  │60s     │ │dynamic   │ │30s           │  ││
│  │  └────────┘ └──────────┘ └──────────────┘  ││
│  │                                             ││
│  │  ┌──────────────┐ ┌──────────────────────┐  ││
│  │  │ Recording    │ │ WebRTC Streamer      │  ││
│  │  │ (optional)   │ │ (on-demand)          │  ││
│  │  └──────────────┘ └──────────────────────┘  ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─────────────────────────────────────────────┐│
│  │           API Client                        ││
│  │  POST /agent-connect                        ││
│  │  POST /agent-heartbeat                      ││
│  │  POST /agent-screenshot                     ││
│  │  POST /agent-app-log                        ││
│  │  POST /agent-website-log                    ││
│  │  POST /agent-activity                       ││
│  │  POST /agent-recording  (optional)          ││
│  │  POST /agent-signal     (WebRTC)            ││
│  │  POST /agent-disconnect                     ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
         │
         │ HTTPS (REST only — no WebSockets needed from agent)
         ▼
┌─────────────────────┐
│  MonitorR Server    │
│  (Pre-built)        │
└─────────────────────┘
```

---

## 📁 Expected File Structure

```
monitorr-agent/
├── assets/
│   ├── icon.ico              # Windows icon
│   ├── icon.icns             # macOS icon
│   ├── icon.png              # Linux icon (512x512)
│   └── tray-icon.png         # System tray icon (16x16 / 32x32)
├── src/
│   ├── main.ts               # Electron main entry point
│   ├── config.ts             # config.json loader
│   ├── api/
│   │   └── client.ts         # HTTP client with X-Agent-Token header
│   ├── auth/
│   │   ├── login.ts          # Login window management
│   │   ├── login.html        # Login form UI
│   │   └── store.ts          # Token persistence (electron-store)
│   ├── capture/
│   │   ├── screenshot.ts     # desktopCapturer screenshot logic
│   │   ├── recording.ts      # Screen recording (WebM + upload)
│   │   ├── activeWin.ts      # Active window tracking
│   │   ├── webrtc.ts         # WebRTC live streaming
│   │   └── idle.ts           # Idle detection
│   ├── scheduler/
│   │   └── index.ts          # Timer management for all periodic tasks
│   ├── tray/
│   │   └── index.ts          # System tray setup
│   └── utils/
│       └── logger.ts         # File-based logging
├── tsconfig.json
├── package.json
└── electron-builder.yml
```

---

## 🚀 Build & Deliverables

### Build Outputs Needed:
- **Windows**: `.exe` installer (NSIS)
- **macOS**: `.dmg` installer
- **Linux**: `.AppImage` + `.deb`

### Build Commands:
```bash
npm run build:win    # → dist/MEN-{version}.exe
npm run build:mac    # → dist/MEN-{version}.dmg
npm run build:linux  # → dist/MEN-{version}.AppImage
```

### Deliverables:
1. ✅ Complete source code (TypeScript)
2. ✅ Built binaries for all 3 platforms
3. ✅ README with setup instructions
4. ✅ All features working against our test server

---

## ⚠️ Key Rules

### DO:
- ✅ Use `electron.desktopCapturer` for screenshots (silent, no permission dialogs)
- ✅ Read server URL from `config.json` (never hardcode)
- ✅ Store session token with `electron-store` for persistence across restarts
- ✅ Update behavior dynamically based on heartbeat settings changes
- ✅ Skip screenshots/tracking when user is idle
- ✅ Use `app.requestSingleInstanceLock()` to prevent multiple instances
- ✅ Handle network failures gracefully (queue + retry)
- ✅ Support all 3 platforms (Windows, macOS, Linux)

### DON'T:
- ❌ Don't log keystrokes — only count keyboard events
- ❌ Don't hardcode the server URL
- ❌ Don't prompt for manual URL entry
- ❌ Don't use WebSockets — all communication is REST (POST to endpoints)
- ❌ Don't show a visible window after login — system tray only
- ❌ Don't require admin/root privileges to run
- ❌ Don't record screen unless `enable_recording` is true in settings

---

## 🧪 Testing Checklist

Use this to verify all features work:

### Authentication
- [ ] Login with valid employee email → connects successfully
- [ ] Login with invalid email → shows error message
- [ ] Login with inactive/unapproved account → shows error
- [ ] Token persists across app restart (no re-login needed)
- [ ] Token expired (401) → auto shows login again

### Screenshot Capture
- [ ] Screenshots captured at configured interval
- [ ] Interval changes dynamically when admin updates it via dashboard
- [ ] Screenshots include active window title
- [ ] Blur mode works when enabled
- [ ] Screenshots pause when user is idle
- [ ] Screenshots resume when user becomes active

### App & Website Tracking
- [ ] Correct app name detected (e.g., "Visual Studio Code")
- [ ] App switch logs duration of previous app
- [ ] Browser URLs detected from window titles
- [ ] Tracking respects enable/disable toggles from server

### Screen Recording
- [ ] Recording starts only when `enable_recording` is true
- [ ] Recording quality matches server setting (480p/720p/1080p)
- [ ] Recording stops at `max_recording_duration_minutes`
- [ ] Completed recordings upload successfully to server
- [ ] Recording stops on disconnect

### WebRTC Live Streaming
- [ ] Agent detects `pending_stream_request` in heartbeat
- [ ] WebRTC offer created and sent via `/agent-signal`
- [ ] Agent polls for admin's answer and ICE candidates
- [ ] Live video streams to admin dashboard
- [ ] Stream ends cleanly on admin disconnect
- [ ] Agent continues normal operation after stream ends

### System Behavior
- [ ] Runs silently in system tray (no visible window)
- [ ] Auto-launches on system boot
- [ ] Tray icon shows correct status (connected/disconnected)
- [ ] Disconnect from tray menu works
- [ ] Heartbeat keeps session alive (checked every 60s)
- [ ] Graceful behavior when server is unreachable
- [ ] Single instance only (no duplicate agents)
- [ ] Works on Windows 10+, macOS 12+, Ubuntu 22+

---

## 📖 Reference Document

The complete technical specification with **all API request/response formats, TypeScript code samples, and implementation details** is in:

📄 **`ELECTRON_AGENT_SPEC.md`**

This document contains:
- All 9 API endpoint formats with request/response examples
- Complete TypeScript implementation code for every feature
- Authentication flow diagram
- Scheduler logic
- Screen recording implementation
- WebRTC streaming implementation with signaling
- config.json loader code
- Login window HTML/CSS
- Platform-specific permissions guide
- Error handling checklist

**Please read it thoroughly before starting development.**

---

## 💬 Questions?

If anything is unclear, please ask before implementing. The server-side is fully built and tested — you can start hitting the API endpoints immediately with the test server URL I'll provide.

**Test Server URL**: `[Will be provided separately via config.json]`
**Test Employee Email**: `[Will be provided separately]`
