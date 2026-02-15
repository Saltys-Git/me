import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AgentConfig {
    serverUrl: string
}

export function loadConfig(): AgentConfig {
    const locations = [
        path.join(path.dirname(process.execPath), 'config.json'),
        path.join(process.resourcesPath || '', 'config.json'),
        path.join(app.getPath('userData'), 'config.json')
    ]

    console.log(locations)

    for (const loc of locations) {
        try {
            if (fs.existsSync(loc)) {
                const data = JSON.parse(fs.readFileSync(loc, 'utf8'))
                if (data.serverUrl) return data
            }
        } catch {}
    }

    dialog.showErrorBox(
        'MEN Agent',
        'config.json not found. Please re-download the agent from your company dashboard.'
    )
    app.quit()
    throw new Error('Missing config.json')
}
