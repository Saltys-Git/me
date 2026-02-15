let mediaRecorder: MediaRecorder | null = null;
const chunks: any[] = []
let startedAt: any = null

async function start(serverUrl: string, token: string) {
    console.log('start called')
    try{
        startedAt = new Date()
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 30,
                },
            } as any,
        })



        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
        mediaRecorder.ondataavailable = e => {
            console.log('pushing stream')
            if (e.data.size > 0) {
                console.log('pushing stream true')
                chunks.push(e.data)
            }
        }

        mediaRecorder.onstop = async () => {
            console.log('Recorder stopped')
            await upload(serverUrl,token)
        }
        mediaRecorder.start()
    }catch (e) {
        console.log(e)
    }
}

async function upload(serverUrl: string, token: string) {
    try{
        console.log('upload called')
        const endedAt:any = new Date()
        const durationSeconds = Math.floor((endedAt - startedAt) / 1000)

        const blob = new Blob(chunks, { type: 'video/webm' })

        const form = new FormData()
        form.append('video', blob, 'record.webm')
        form.append('duration_seconds', durationSeconds.toString())
        form.append('started_at', startedAt.toISOString())
        form.append('ended_at', endedAt.toISOString())

        console.log(`${serverUrl}/agent-recording`)
        console.log(`token ${token}`)
        console.log(`durationSeconds ${durationSeconds.toString()}`)
        console.log(`'video', ${blob}`)
        const res = await fetch(`${serverUrl}/agent-recording`, {
            method: 'POST',
            headers: {
                'X-Agent-Token': token
            },
            body: form
        })
        console.log(res.status)
        console.log(res.body)
    }catch (e){
        console.log(e)
    }

}

(window as any).MEN.onStartRecording(async(data: { serverUrl: string; sessionToken: string }) => {
    console.log('Recording Started on ipc call');
    await start(data.serverUrl, data.sessionToken);
});

(window as any).MEN.onStopRecording(async() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
    } else {
        console.log('Recorder not ready')
    }
});
