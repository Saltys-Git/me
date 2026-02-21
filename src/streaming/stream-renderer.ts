
let pc: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

async function startStream(requestId: string, serverUrl: string, token: string, iceServers: RTCIceServer[]) {
    try {
        (window as any).MEN.sendStatus('connecting');

        // 1. Capture screen
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    maxWidth: 1280,
                    maxHeight: 720,
                    maxFrameRate: 15,
                },
            } as any,
        });

        // 2. Create peer connection
        pc = new RTCPeerConnection({
            iceServers: iceServers && iceServers.length
                ? iceServers
                : [{ urls: 'stun:stun.l.google.com:19302' }]
            });

        // 3. Add video tracks
        stream.getTracks().forEach(track => {
            pc!.addTrack(track, stream!);
        });

        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if(sender) {
            const params = sender.getParameters();
            params.degradationPreference = 'maintain-framerate';
            params.encodings = [{maxBitrate: 1000000}]; // 1 Mbps cap
            await sender.setParameters(params);
        }

        // 4. Send ICE candidates to server
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await fetch(`${serverUrl}/agent-signal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
                    body: JSON.stringify({
                        action: 'signal',
                        stream_request_id: requestId,
                        signal_type: 'ice-candidate',
                        signal_data: event.candidate.toJSON(),
                    }),
                });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc?.connectionState;
            (window as any).MEN.sendStatus(state || 'unknown');
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                cleanup(requestId, serverUrl, token);
            }
        };

        // 5. Create and send SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch(`${serverUrl}/agent-signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
            body: JSON.stringify({
                action: 'signal',
                stream_request_id: requestId,
                signal_type: 'offer',
                signal_data: { type: offer.type, sdp: offer.sdp },
            }),
        });

        // 6. Poll for admin answer and ICE candidates
        const processedSignals = new Set<string>();
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${serverUrl}/agent-signal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
                    body: JSON.stringify({ action: 'poll' }),
                });
                const data = await res.json();
                const signals = data.data?.admin_signals || [];

                for (const signal of signals) {
                    if (processedSignals.has(signal.id)) continue;
                    processedSignals.add(signal.id);

                    if (signal.signal_type === 'answer' && pc && !pc.remoteDescription) {
                        await pc.setRemoteDescription(signal.signal_data);
                    } else if (signal.signal_type === 'ice-candidate' && pc) {
                        try {
                            await pc.addIceCandidate(signal.signal_data);
                        } catch (e) {
                            console.warn('Failed to add ICE candidate:', e);
                        }
                    }
                }

                if (pc?.connectionState === 'connected' && pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    (window as any).MEN.sendStatus('connected');
                }
            } catch (e) {
                console.warn('Signal poll error:', e);
            }
        }, 1000);

        // Timeout after 30s
        setTimeout(() => {
            if (pc && pc.connectionState !== 'connected') {
                console.warn('WebRTC connection timed out');
                cleanup(requestId, serverUrl, token);
                (window as any).MEN.sendStatus('failed');
            }
        }, 30000);

    } catch (err) {
        console.error('WebRTC start error:', err);
        (window as any).MEN.sendStatus('failed');
    }
}

function cleanup(requestId: string, serverUrl: string, token: string) {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    stream?.getTracks().forEach(t => t.stop());
    pc?.close();
    pc = null;
    stream = null;

    fetch(`${serverUrl}/agent-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token },
        body: JSON.stringify({ action: 'end', stream_request_id: requestId }),
    }).catch(() => {});

    (window as any).MEN.sendStatus('ended');
}

// ─── IPC Listeners (registered at top-level, before ready signal) ───

let currentRequestId = '';
let currentServerUrl = '';
let currentToken = '';

(window as any).MEN.onStartStream(async(data: { requestId: string; serverUrl: string; sessionToken: string, iceServers: RTCIceServer[] }) => {
    console.log('[stream-renderer] Received start-stream IPC:', data.requestId);
    currentRequestId = data.requestId;
    currentServerUrl = data.serverUrl;
    currentToken = data.sessionToken;
    await startStream(data.requestId, data.serverUrl, data.sessionToken, data.iceServers);
});

(window as any).MEN.onStopStream(() => {
    console.log('[stream-renderer] Received stop-stream IPC');
    cleanup(currentRequestId, currentServerUrl, currentToken);
});

// Signal to main process that listeners are registered
console.log('[stream-renderer] IPC listeners registered, signaling ready');
(window as any).MEN.sendReady();