import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const logFile = path.join(app.getPath('userData'), 'men.log')

export function log(msg: string) {
    fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] ${msg}\n`
    )
}
