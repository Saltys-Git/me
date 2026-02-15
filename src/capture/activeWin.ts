import {activeWindow} from 'active-win'
import { apiPost } from '../api/client'

let last: any = null
let since = Date.now()

interface AppUsage {
    appName: string;
    windowTitle: string;
    startedAt: Date;
    durationSeconds: number;
}

let currentApp: { name: string; title: string; since: Date } | null = null;
const appLog: AppUsage[] = [];

export async function trackActiveWindow() {
    const window = await activeWindow();
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
export async function flushAppLogs() {
    if (appLog.length === 0) return;

    const logsToSend = appLog.splice(0, appLog.length); // drain the buffer

    for (const log of logsToSend) {
        try {
            await apiPost('/agent-app-log', {
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