import { powerMonitor } from 'electron'
export const getIdleSeconds = () => powerMonitor.getSystemIdleTime()
