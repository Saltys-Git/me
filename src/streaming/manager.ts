import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let streamWindow: BrowserWindow | null = null;
let currentStreamRequestId: string | null = null;

export function handlePendingStreamRequest(
  requestId: string,
  serverUrl: string,
  sessionToken: string,
  iceServers: RTCIceServer[]
) {
    if (currentStreamRequestId === requestId) return; // Already handling
    currentStreamRequestId = requestId;

    if (!streamWindow) {
        streamWindow = new BrowserWindow({
            show: false,
            width: 1,
            height: 1,
            paintWhenInitiallyHidden: true,
            webPreferences: {
                preload: path.join(__dirname, '../preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                backgroundThrottling: false,
            },
        });
        streamWindow.loadFile(path.join(__dirname, '../streaming/stream.html'));
        streamWindow.on('closed', () => {
            streamWindow = null;
            currentStreamRequestId = null;
        });
    }

    // Wait for page to load, then start
    streamWindow.webContents.once('did-finish-load', () => {
        streamWindow?.webContents.send('start-stream', {
            requestId,
            serverUrl,
            sessionToken,
            iceServers
        });
    });
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
