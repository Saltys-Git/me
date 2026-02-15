import fetch from 'node-fetch'
import { StoreAPI } from '../auth/store'

export async function apiPost(endpoint: string, body: any = {}): Promise<any> {
    const token = StoreAPI.getToken()
    const url = `${StoreAPI.getServerUrl()}${endpoint}`

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-Agent-Token': token } : {})
        },
        body: JSON.stringify(body)
    })

    if (res.status === 401) {
        StoreAPI.clearToken()
        onAuthExpired();
        throw new Error('Unauthorized')
    }

    return res.json()
}

function onAuthExpired() {
    const { stopScheduler } = require('../scheduler');
    const { showLoginWindow } = require('../auth/login');
    stopScheduler();
    showLoginWindow();
}