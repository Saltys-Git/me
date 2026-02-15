import { BrowserWindow, ipcMain, app } from 'electron'
import path from 'path'
import os from 'os'
import { apiPost } from '../api/client'
import { StoreAPI } from './store'
import { startScheduler } from '../scheduler'
import {updateTrayMenu} from "../tray";

let win: BrowserWindow | null = null

export function showLoginWindow() {
    if (win) return

    win = new BrowserWindow({
        width: 400,
        height: 400,
        resizable: false,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        }
    })

    win.loadFile(path.join(__dirname, 'login.html'))
    win.on('closed', () => (win = null))
}

ipcMain.handle('login', async (_, email: string) => {
    console.log("Login called")
    const res = await apiPost('/agent-connect', {
        email,
        device_info: {
            os: `${os.platform()} ${os.release()}`,
            hostname: os.hostname(),
            version: app.getVersion()
        }
    })

    /*const Settings = {
        ...res.data.settings,
        max_recording_duration_minutes : 1
    }
    console.log('Settings',Settings)*/
    StoreAPI.setToken(res.data.session_token)
    StoreAPI.setIsConnect(true)
    StoreAPI.setEmployee(res.data)
    StoreAPI.setSettings(res.data.settings)

    win?.close()
    await startScheduler()
    updateTrayMenu()
    return { success: true }
})

ipcMain.handle('minimize', async () => {
    win?.minimize()
    return { success: true }
})

ipcMain.handle('quit', async () => {
    app.quit()
    return { success: true }
})
