import { BrowserWindow } from 'electron'
import path from 'path'

let recorderWin: BrowserWindow | null = null
let recording = false

export function startRecording(
    serverUrl: string,
    sessionToken: string
) {
    if (recording) return
    recording = true

    console.log('called', serverUrl, sessionToken)

    recorderWin = new BrowserWindow({
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
    })
    recorderWin.loadURL(`file://${path.join(__dirname, 'record.html')}`)
    /*recorderWin.on('closed', () => {
        recorderWin?.webContents.send('stop-recording',{
            serverUrl,
            sessionToken,
        });
    });*/
    recorderWin.webContents.once('did-finish-load', () => {
        console.log('starting', serverUrl, sessionToken)
        try{
            recorderWin?.webContents.send('start-recording', {
                serverUrl,
                sessionToken,
            });
        }catch(e){
            console.log('starting error', e);
        }
    });
}

export function stopRecording() {
    recorderWin?.webContents.send('stop-recording')
    recording = false
}
