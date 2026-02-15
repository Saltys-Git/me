import { desktopCapturer, screen } from 'electron'
import { apiPost } from '../api/client'
import { StoreAPI } from '../auth/store'

export async function captureScreenshot() {
    const settings = StoreAPI.getSettings()
    if (!settings.track_screenshots) return

    const display = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: display.size
    })

    const image = sources[0].thumbnail.toPNG().toString('base64')

    await apiPost('/agent-screenshot', {
        screenshot_base64: `data:image/png;base64,${image}`,
        active_window: 'Unknown',
        is_blurred: settings.blur_screenshots
    })
}
