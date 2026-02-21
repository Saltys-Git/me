import { captureScreenshot } from '../capture/screenshot';
import { trackActiveWindow, flushAppLogs } from '../capture/activeWin';
import { getIdleSeconds } from '../capture/idle';
import { startRecording, stopRecording as stopActiveRecording } from '../capture/recording';
import { apiPost } from '../api/client';
import { stopCurrentStream } from '../streaming/manager';
import {StoreAPI} from "../auth/store";

let heartbeatTimer: NodeJS.Timeout | null = null;
let screenshotTimer: NodeJS.Timeout | null = null;
let activityTimer: NodeJS.Timeout | null = null;
let windowTracker: NodeJS.Timeout | null = null;
let appLogFlusher: NodeJS.Timeout | null = null;
let recordingTimer: NodeJS.Timeout | null = null;
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

async function startCaptureTimers() {
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
        await startRecordingSession();
    }
}

// --- Public scheduler API (used by tray and main process) ---

export async function reconnectAgent(){
    await apiPost('/agent-reconnect')
    await startScheduler()
}

export async function startScheduler() {
    isPaused = false;

    // Heartbeat every 60 seconds
    heartbeatTimer = setInterval(doHeartbeat, 5 * 1000);
    await doHeartbeat(); // Immediate first heartbeat

    await startCaptureTimers();
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
    async resumeAll() {
        isPaused = false;
        await startCaptureTimers();
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
        console.log("record stopped")
    },
};

// --- Internal functions ---

function startScreenshotTimer() {
    if (screenshotTimer) clearInterval(screenshotTimer);

    if (settings.trackScreenshots) {
        screenshotTimer = setInterval(async() => {
            // Don't capture if idle or paused
            if (!isIdle() && !isPaused) {
                await captureScreenshot();
            }
        }, settings.screenshotIntervalSeconds * 1000);
    }
}

let isRecording = false;

// Start a recording session: record for maxRecordingDurationMinutes, upload, repeat
async function startRecordingSession() {
    if (isRecording) return;
    isRecording = true;

    const durationMs = settings.maxRecordingDurationMinutes * 60 * 1000;

    // Start the first recording chunk immediately
    const { StoreAPI } = require('../auth/store');
    const token = StoreAPI.getToken()
    const url = `${StoreAPI.getServerUrl()}`
    startRecording(url,token);

    // Set up a recurring timer to cycle recording chunks
    recordingTimer = setInterval(() => {
        if (!isPaused && !isIdle()) {
            // stopActiveRecording triggers upload of the completed chunk
            stopActiveRecording();
            // Start a new chunk
            const { StoreAPI } = require('../auth/store');
            const token = StoreAPI.getToken()
            const url = `${StoreAPI.getServerUrl()}`
            startRecording(url,token);
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
        const result = await apiPost('/agent-heartbeat');

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
                console.log("record started")
                await startRecordingSession();
            } else if (!settings.enableRecording && wasRecording) {
                stopRecordingSession();
                console.log("record stopped in condition")
            }

            // Handle pending WebRTC stream request
            if (result.data.pending_stream_request) {
    const req = result.data.pending_stream_request;

    if (req.status === 'pending') {
        const { handlePendingStreamRequest } = require('../streaming/manager');
        const { StoreAPI } = require('../auth/store');

        const token = StoreAPI.getToken();
        const url = StoreAPI.getServerUrl();

        const iceServers = result.data.ice_servers || [];

        handlePendingStreamRequest(
            req.id,
            url,
            token,
            iceServers
        );
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
        await apiPost('/agent-activity', {
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