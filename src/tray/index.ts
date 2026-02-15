import { Tray, Menu, app, nativeImage } from 'electron'
import path from 'path'
import { apiPost } from '../api/client'
import {StoreAPI} from "../auth/store";
import {scheduler} from "../scheduler";
import {showLoginWindow} from "../auth/login";

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
        StoreAPI.setIsConnect(false)
        await apiPost('/agent-disconnect')
    } catch (err) {
        console.error('Disconnect error:', err);
    }
}

// Rebuild tray menu with current state (call after status changes)
function updateTrayMenu() {
    if (!tray) return;

    const employee = StoreAPI.getEmployee();
    const employeeName = employee ? employee.employee_name : 'Unknown';
    const isConnected = StoreAPI.getIsConnect();

    const contextMenu = Menu.buildFromTemplate([
        {
            label: `Status: ${isConnected ? 'Connected ✅' : 'Disconnected ❌'}`,
            enabled: false
        },
        {
            label: `Employee: ${isConnected ? employeeName : 'Not Connected'}`,
            enabled: false
        },
        /*{ type: 'separator' },
        {
            label: isPaused ? 'Resume Monitoring' : 'Pause Monitoring',
            click: () => isPaused ? resumeMonitoring() : pauseMonitoring()
        },
        {
            label: isConnected ? 'Disconnect' : 'Connect',
            click: async () => {
                isConnected ? await disconnect(): showLoginWindow();
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
        }*/
    ]);

    tray.setToolTip(`MEN Agent - ${isPaused ? 'Paused' : isConnected ? 'Monitoring Active' : 'Disconnected'}`);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    const icon = nativeImage.createFromPath(path.join(__dirname, '../../assets/tray-icon.png'));
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    updateTrayMenu();
}

// Export for use by other modules (e.g., auth flow updates tray after login)
export { createTray, updateTrayMenu, isPaused };