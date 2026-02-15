import AutoLaunch from 'auto-launch'
import { app } from 'electron'
import { log } from '../utils/logger'

let autoLauncher: AutoLaunch

export function setupAutoLaunch() {
    autoLauncher = new AutoLaunch({
        name: 'MEN Agent',
        path: app.getPath('exe')
    })

    autoLauncher.isEnabled()
        .then((isEnabled) => {
            if (!isEnabled) {
                return autoLauncher.enable()
            }
        })
        .then(() => {
            log('Auto-launch enabled')
        })
        .catch((err) => {
            log('Auto-launch error: ' + err)
        })
}
