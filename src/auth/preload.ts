import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('MEN', {
    getSources: () => ipcRenderer.invoke('get-sources'),
    startWebRTC: (stream: MediaStream) =>
        ipcRenderer.send('start-webrtc', stream),
    login: (email: string) => ipcRenderer.invoke('login', email),
    minimize: () => ipcRenderer.invoke('minimize'),
    quit: () => ipcRenderer.invoke('quit'),
})