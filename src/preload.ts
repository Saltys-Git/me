import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('MEN', {
    onStartStream: (callback: (data: any) => void) =>
        ipcRenderer.on('start-stream', (_e, data) => callback(data)),

    onStopStream: (callback: () => void) =>
        ipcRenderer.on('stop-stream', () => callback()),

    onStartRecording: (callback: (data: any) => void) =>
        ipcRenderer.on('start-recording', (_e, data) => callback(data)),

    onStopRecording: (callback: () => void) =>
        ipcRenderer.on('stop-recording', () => callback()),

    sendStatus: (status: string) =>
        ipcRenderer.send('stream-status', status)
})