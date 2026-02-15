import Store from 'electron-store'

export interface Settings {
    screenshot_interval_seconds: number
    track_screenshots: boolean
    track_apps: boolean
    track_websites: boolean
    blur_screenshots: boolean
    idle_threshold_minutes: number
    work_start_time?: string
    work_end_time?: string
    enable_recording?: boolean
    recording_quality?: 'low' | 'medium' | 'high'
    max_recording_duration_minutes?: number
}

interface StoreSchema {
    token?: string
    serverUrl?: string
    employee?: any
    settings?: Settings
    isConnect: boolean
}

export const store = new Store<StoreSchema>({
    encryptionKey: 'men-agent-secure'
})

export const StoreAPI = {
    setToken: (t: string) => store.set('token', t),
    getToken: () => store.get('token'),
    clearToken: () => store.delete('token'),

    setIsConnect: (t: boolean) => store.set('isConnect', t),
    getIsConnect: () => store.get('isConnect'),

    setServerUrl: (u: string) => store.set('serverUrl', u),
    getServerUrl: () => store.get('serverUrl')!,

    setEmployee: (e: any) => store.set('employee', e),
    getEmployee: () => store.get('employee'),

    setSettings: (s: Settings) => store.set('settings', s),
    getSettings: (): Settings => store.get('settings')!
}
