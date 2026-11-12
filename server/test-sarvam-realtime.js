
import 'dotenv/config';
import fs from 'node:fs';
import WebSocket from 'ws';

const FILE = './test-realtime.wav';
const API_KEY = process.env.SARVAM_API_KEY;

if (!API_KEY) {
    throw new Error('SARVAM_API_KEY is missing from .env');
}

// Extract and validate raw PCM from WAV.
function extractPcm(buffer) {
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
        throw new Error('Invalid WAV file');
    }

    let offset = 12;
    let format = null;
    let pcm = null;

    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const start = offset + 8;

        if (id === 'fmt ') {
            format = {
                codec: buffer.readUInt16LE(start),
                channels: buffer.readUInt16LE(start + 2),
                sampleRate: buffer.readUInt32LE(start + 4),
                bits: buffer.readUInt16LE(start + 14)
            };
        }

        if (id === 'data') {
            pcm = buffer.subarray(start, start + size);
        }

        offset = start + size + (size % 2);
    }

    if (!format || !pcm) {
        throw new Error('WAV format or data chunk missing');
    }

    if (
        format.codec !== 1 ||
        format.channels !== 1 ||
        format.sampleRate !== 8000 ||
        format.bits !== 16
    ) {
        throw new Error('Expected PCM16, mono, 8000 Hz audio');
    }

    return pcm;
}

const pcm = extractPcm(fs.readFileSync(FILE));

console.log('Audio ready:', pcm.length, 'PCM bytes');
console.log('Connecting to Sarvam realtime STT...');

const params = new URLSearchParams({
    language_code: 'auto',
    model: 'saaras:v4',
    stream_type: 'fast',
    mode: 'codemix',
    endpointing: 'vad',
    encoding: 'linear16',
    sample_rate: '8000',
    silence_duration_ms: '500',
    min_speech_duration_ms: '250'
});

const ws = new WebSocket(
    `wss://api.sarvam.ai/speech-to-text-realtime/ws?${params}`,
    {
        headers: {
            'api-subscription-key': API_KEY
        }
    }
);

let started = false;
let finished = false;
let audioSent = false;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function closeWithError(message) {
    if (finished) return;
    finished = true;
    console.error('\nERROR:', message);
    ws.close();
}

const timeout = setTimeout(() => {
    closeWithError('Timed out waiting for final transcript');
}, 15000);

ws.on('open', () => {
    console.log('WebSocket connected. Waiting for session...');
});

ws.on('message', async raw => {
    let event;

    try {
        event = JSON.parse(raw.toString());
    } catch {
        console.log('Unrecognised server message:', raw.toString());
        return;
    }

    if (event.event === 'session.begin' && !started) {
        started = true;
        console.log('Session started. Streaming audio...');

        try {
            // 100 ms chunks at 8 kHz, mono, 16-bit.
            const chunkSize = 1600;

            for (let i = 0; i < pcm.length; i += chunkSize) {
                if (finished || ws.readyState !== WebSocket.OPEN) return;

                const chunk = pcm.subarray(i, i + chunkSize);

                ws.send(JSON.stringify({
                    event: 'audio_input',
                    audio: chunk.toString('base64')
                }));

                await delay(100);
            }

            audioSent = true;
            console.log('Audio sent. Waiting for final transcript...');
        } catch (error) {
            closeWithError(error.message);
        }

        return;
    }

    if (event.event === 'transcript.partial') {
        console.log('PARTIAL:', event.text);
        if (event.language) {
            console.log('Detected language:', event.language);
        }
    }

    if (event.event === 'transcript.final') {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        console.log('\nFINAL TRANSCRIPT:', event.text);
        console.log('DETECTED LANGUAGE:', event.language || 'Not provided');
        console.log('LANGUAGE CONFIDENCE:', event.language_confidence ?? 'Not provided');

        ws.close();
    }

    if (event.event === 'error') {
        closeWithError(
            `${event.code || ''} ${event.message || 'Unknown Sarvam error'}`
        );
    }

    if (event.event === 'session.end') {
        console.log('Billed audio duration:', event.audio_duration_s);
    }
});

ws.on('error', error => {
    closeWithError(error.message);
});

ws.on('close', (code, reason) => {
    clearTimeout(timeout);
    console.log('\nWebSocket closed:', code, reason.toString());

    if (!finished && !audioSent) {
        console.log('No final transcript received.');
    }
});
