import {app, desktopCapturer, ipcMain} from 'electron'
import { createTray } from './tray'
import { loadConfig } from './config'
import { StoreAPI } from './auth/store'
import { showLoginWindow } from './auth/login'
import {reconnectAgent} from './scheduler'
import {setupAutoLaunch} from "./system/autoLaunch";
// Hide from dock (macOS)
app.dock?.hide();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.whenReady().then(() => {
    const config = loadConfig()
    StoreAPI.setServerUrl(config.serverUrl)
    setupAutoLaunch()
    createTray()

    StoreAPI.getToken() ? reconnectAgent() : showLoginWindow()
})

app.on('window-all-closed', () => {

})

ipcMain.handle('get-sources', async () => {
    return await desktopCapturer.getSources({
        types: ['screen']
    })
})

