
import 'dotenv/config';
import fs from 'node:fs';

const form = new FormData();

form.append(
    'file',
    new Blob([fs.readFileSync('./test-hinglish.mp3')], {
        type: 'audio/mpeg'
    }),
    'test-hinglish.mp3'
);

form.append('model', 'saaras:v4');
form.append('language_code', 'unknown');
form.append('mode', 'codemix');

const response = await fetch(
    'https://api.sarvam.ai/speech-to-text',
    {
        method: 'POST',
        headers: {
            'api-subscription-key': process.env.SARVAM_API_KEY
        },
        body: form
    }
);

const result = await response.json();

if (!response.ok) {
    console.error(result);
    process.exit(1);
}

console.log('Transcript:', result.transcript);
console.log('Language:', result.language_code);
console.log('Confidence:', result.language_probability);
