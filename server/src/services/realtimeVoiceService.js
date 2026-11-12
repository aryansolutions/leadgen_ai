import WebSocket from 'ws';
import { tenantQuery } from '../config/database.js';
import { env } from '../config/env.js';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const SARVAM_STT_URL =
  'wss://api.sarvam.ai/speech-to-text-realtime/ws';

const EXOTEL_SAMPLE_RATE = 8000;
const EXOTEL_CHANNELS = 1;
const MAX_EARLY_MESSAGES = 100;
const MAX_PENDING_SARVAM_AUDIO = 100;
const MAX_CONVERSATION_MESSAGES = 9;
const MAX_LLM_TOKENS = 60;

function createSarvamSttUrl() {
  const url = new URL(SARVAM_STT_URL);

  const params = {
    language_code: 'auto',
    model: env.SARVAM_STT_MODEL || 'saaras:v4',
    stream_type: 'fast',
    mode: 'codemix',
    endpointing: 'vad',
    encoding: 'linear16',
    sample_rate: String(EXOTEL_SAMPLE_RATE),
    silence_duration_ms: '500',
    min_speech_duration_ms: '250',
  };

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function extractWavPcm(wavBuffer) {
  if (
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Sarvam TTS did not return a WAV file.');
  }

  let offset = 12;
  let audioFormat = null;
  let channels = null;
  let sampleRate = null;
  let bitsPerSample = null;
  let pcm = null;

  while (offset + 8 <= wavBuffer.length) {
    const chunkName = wavBuffer.toString(
      'ascii',
      offset,
      offset + 4,
    );

    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > wavBuffer.length) {
      throw new Error('Invalid WAV chunk size.');
    }

    if (chunkName === 'fmt ' && chunkSize >= 16) {
      audioFormat = wavBuffer.readUInt16LE(chunkStart);
      channels = wavBuffer.readUInt16LE(chunkStart + 2);
      sampleRate = wavBuffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = wavBuffer.readUInt16LE(chunkStart + 14);
    }

    if (chunkName === 'data') {
      pcm = wavBuffer.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!pcm || pcm.length === 0) {
    throw new Error('WAV audio data chunk was not found.');
  }

  if (
    audioFormat !== 1 ||
    channels !== EXOTEL_CHANNELS ||
    sampleRate !== EXOTEL_SAMPLE_RATE ||
    bitsPerSample !== 16
  ) {
    throw new Error(
      `Unsupported TTS WAV format: format=${audioFormat}, ` +
      `channels=${channels}, sampleRate=${sampleRate}, ` +
      `bits=${bitsPerSample}. Expected PCM16 mono 8000 Hz.`,
    );
  }

  return pcm;
}

function detectResponseLanguage(language, text) {
  const detected = String(language || '').toLowerCase();

  if (
    detected.startsWith('hi') ||
    /[\u0900-\u097F]/.test(text)
  ) {
    return 'hi-IN';
  }

  return 'en-IN';
}

/**
 * LeadFlow website-development sales agent.
 */
function createSystemPrompt(lead) {
  const organizationName = String(
    lead.organization_name || 'LeadFlow',
  ).slice(0, 150);

  const firstName = String(
    lead.first_name || 'Customer',
  ).slice(0, 100);

  const company = String(
    lead.company || 'Not provided',
  ).slice(0, 150);

  return `
You are an AI sales assistant calling on behalf of ${organizationName}.

CUSTOMER:
Name: ${firstName}
Company: ${company}

IDENTITY:
- Clearly identify yourself as an AI assistant.
- Never pretend to be human.
- Be polite, friendly and professional.
- Do not mislead the customer about who is calling.

LANGUAGE:
- Speak in natural Indian Hinglish.
- Use simple Hindi and commonly used English business terms.
- Use Devanagari for Hindi words where appropriate.
- Adapt if the customer prefers English or Hindi.
- Do not force Hinglish if the customer prefers another language.

PRODUCT:
Website development services.

The business helps customers develop professional websites.
No additional product features, prices, packages, discounts,
delivery timelines or guarantees have been configured.

PRIMARY OBJECTIVE:
Book a demo with an interested prospect.

CALL FLOW:
1. Introduce yourself as an AI assistant.
2. Ask whether it is a convenient time to talk.
3. Briefly explain website development services.
4. Ask whether the business already has a website.
5. Understand what kind of website the customer needs.
6. Ask whether they would like to see a demo.
7. If interested, ask for their preferred date and time.
8. Explain that a team member can follow up to confirm the demo.
9. Never claim that a demo is booked unless an actual booking
   system confirms it.

PRICING:
If asked about price, explain that pricing has not been configured
and offer a human follow-up.

CONVERSATION RULES:
- Keep responses short and natural for phone calls.
- Prefer one or two short sentences.
- Ask only one question at a time.
- Listen to the customer's actual response.
- Do not repeat the entire pitch on every turn.
- Do not pressure the customer.
- Do not invent company details, features, offers or results.
- If you do not know an answer, offer a human follow-up.
- If the customer is busy, politely ask for a suitable time.
- If the customer is not interested, politely end the conversation.
- Never ask for OTPs, passwords, payment card details or other
  sensitive information.
- Respect requests to stop calling immediately.

OPENING:
Start with:
"Hello, main LeadFlow ki AI assistant hoon.
Hum businesses ke liye professional websites develop karte hain.
Kya abhi do minute baat karna convenient hoga?"

GOAL:
Understand the customer's website requirements and offer a demo.
Your goal is to generate an interested prospect and arrange
a human follow-up, not to force a sale.
`.trim();
}

/**
 * Gemini generates conversational responses.
 */



async function callGeminiChat(messages) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const systemMessage = messages.find(
    (message) => message.role === 'system'
  );

  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }],
    }))
    .filter((message) =>
      message.parts[0].text.trim()
    );

  if (!contents.length) {
    throw new Error('Gemini conversation is empty.');
  }

  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';

  const retryableStatuses = [
    408, 429, 500, 502, 503, 504,
  ];

  const delays = [1200, 2500];

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    const startedAt = Date.now();

    let retry = false;
    let lastError;

    try {
      console.log('GEMINI_REQUEST_STARTED', {
        model,
        attempt: attempt + 1,
        maxAttempts: 3,
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            ...(systemMessage?.content
              ? {
                systemInstruction: {
                  parts: [
                    { text: systemMessage.content },
                  ],
                },
              }
              : {}),
            contents,
            generationConfig: {
              maxOutputTokens: 120,
              temperature: 0.7,
            },
          }),
          signal: controller.signal,
        }
      );

      const responseText = await response.text();

      if (!response.ok) {
        console.error('GEMINI_API_ERROR', {
          status: response.status,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          response: responseText.slice(0, 500),
        });

        const error = new Error(
          `Gemini API failed: HTTP ${response.status}`
        );

        if (
          retryableStatuses.includes(response.status) &&
          attempt < 2
        ) {
          retry = true;
          lastError = error;
        } else {
          throw error;
        }
      } else {
        let data;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            'Gemini returned invalid JSON.'
          );
        }

        const answer = data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || '')
          .join('')
          .trim();

        if (!answer) {
          const reason =
            data.candidates?.[0]?.finishReason ||
            'Unknown';

          throw new Error(
            `Gemini returned no answer. Finish reason: ${reason}`
          );
        }

        console.log('GEMINI_RESPONSE_RECEIVED', {
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
        });

        return answer;
      }

    } catch (error) {
      lastError = error;

      console.error('GEMINI_REQUEST_FAILED', {
        attempt: attempt + 1,
        message: error.message,
        timedOut: controller.signal.aborted,
      });

      const isRetryable =
        controller.signal.aborted ||
        error.name === 'TypeError' ||
        retryableStatuses.some((status) =>
          error.message.includes(`HTTP ${status}`)
        );

      if (isRetryable && attempt < 2) {
        retry = true;
      } else {
        throw error;
      }

    } finally {
      clearTimeout(timeout);
    }

    if (retry && attempt < 2) {
      const baseDelay = delays[attempt];
      const jitter = Math.floor(Math.random() * 500);
      const waitTime = baseDelay + jitter;

      console.log('GEMINI_RETRY_SCHEDULED', {
        nextAttempt: attempt + 2,
        waitTimeMs: waitTime,
        reason: lastError?.message,
      });

      await new Promise((resolve) =>
        setTimeout(resolve, waitTime)
      );
    }
  }

  throw new Error(
    'Gemini failed after 3 attempts.'
  );
}




/**
 * Sarvam text-to-speech.
 */
async function generateSpeech(text, languageCode) {
  console.log('SARVAM_TTS_REQUEST_STARTED', {
    languageCode,
    textLength: String(text || '').length,
  });

  const response = await fetch(
    `${SARVAM_BASE_URL}/text-to-speech`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: String(text).slice(0, 2000),
        model: env.SARVAM_TTS_MODEL || 'bulbul:v4-flash',
        language_code: languageCode,
        speech_sample_rate: EXOTEL_SAMPLE_RATE,
        output_audio_codec: 'wav',
        pace: 1.0,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      'Sarvam TTS error:',
      response.status,
      errorText.slice(0, 500),
    );

    throw new Error('Speech generation failed.');
  }

  const data = await response.json();
  const audioBase64 = data.audios?.[0];

  if (!audioBase64) {
    throw new Error('Sarvam returned no audio.');
  }

  const pcm = extractWavPcm(
    Buffer.from(audioBase64, 'base64'),
  );

  console.log('SARVAM_TTS_COMPLETED', {
    pcmBytes: pcm.length,
    durationSeconds: Number(
      (pcm.length / (EXOTEL_SAMPLE_RATE * 2)).toFixed(2),
    ),
  });

  return pcm;
}

/**
 * Sends PCM audio to Exotel in 200ms chunks.
 */
function sendExotelAudio(
  exotelSocket,
  streamSid,
  pcmBuffer,
  isCurrent,
) {
  if (
    exotelSocket.readyState !== WebSocket.OPEN ||
    !streamSid ||
    !pcmBuffer?.length
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let offset = 0;
    let settled = false;
    let timer = null;

    const finish = (error = null) => {
      if (settled) return;

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const sendNext = () => {
      if (
        !isCurrent() ||
        exotelSocket.readyState !== WebSocket.OPEN
      ) {
        finish();
        return;
      }

      if (offset >= pcmBuffer.length) {
        finish();
        return;
      }

      // 3200 bytes = approximately 200 ms PCM16 mono at 8 kHz.
      const chunk = pcmBuffer.subarray(
        offset,
        offset + 3200,
      );

      offset += chunk.length;

      const message = {
        event: 'media',
        stream_sid: streamSid,
        media: {
          payload: chunk.toString('base64'),
        },
      };

      exotelSocket.send(
        JSON.stringify(message),
        (error) => {
          if (error) {
            finish(error);
            return;
          }

          if (offset >= pcmBuffer.length) {
            finish();
            return;
          }

          timer = setTimeout(sendNext, 200);
        },
      );
    };

    sendNext();
  });
}

async function markLeadAsOptedOut(leadId, tokenPayload) {
  await tenantQuery(
    tokenPayload.organizationId,
    tokenPayload.userId,
    async (client) => {
      await client.query(
        `UPDATE leads
         SET status = 'do_not_call',
             updated_at = NOW()
         WHERE id = $1
           AND organization_id = $2`,
        [
          leadId,
          tokenPayload.organizationId,
        ],
      );

      await client.query(
        `INSERT INTO consent_records (
           organization_id,
           lead_id,
           purpose,
           consent_status,
           source
         )
         VALUES (
           $1,
           $2,
           'ai_voice_call',
           'withdrawn',
           'voice_opt_out'
         )`,
        [
          tokenPayload.organizationId,
          leadId,
        ],
      );
    },
  );
}

function isOptOutRequest(text) {
  const englishPattern =
    /\b(stop calling|do not call|don't call|dont call|remove me|opt me out|unsubscribe|take me off your list)\b/i;

  const hindiPattern =
    /(मुझे फोन मत|मुझे कॉल मत|कॉल मत करना|दोबारा फोन मत|मेरा नंबर हटाओ|फोन करना बंद)/i;

  return englishPattern.test(text) || hindiPattern.test(text);
}

export async function handleExotelVoiceSocket(
  exotelSocket,
  tokenPayload,
) {
  if (!env.SARVAM_API_KEY || !env.GEMINI_API_KEY) {
    console.error('Voice AI configuration missing:', {
      sarvamConfigured: Boolean(env.SARVAM_API_KEY),
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
    });

    exotelSocket.close(
      1011,
      'AI service is not configured',
    );

    return;
  }

  const earlyMessages = [];

  const captureEarlyMessage = (message) => {
    if (earlyMessages.length >= MAX_EARLY_MESSAGES) {
      console.error('Early Exotel message buffer exceeded.');

      exotelSocket.close(
        1011,
        'Media startup buffer exceeded',
      );

      return;
    }

    earlyMessages.push(message);
  };

  exotelSocket.on('message', captureEarlyMessage);

  let callContext;

  try {
    callContext = await tenantQuery(
      tokenPayload.organizationId,
      tokenPayload.userId,
      (client) =>
        client.query(
          `SELECT
             c.id,
             c.lead_id,
             l.first_name,
             l.last_name,
             l.company,
             o.name AS organization_name
           FROM calls c
           JOIN leads l
             ON l.id = c.lead_id
            AND l.organization_id = c.organization_id
           JOIN organizations o
             ON o.id = c.organization_id
           WHERE c.id = $1
             AND c.organization_id = $2`,
          [
            tokenPayload.callId,
            tokenPayload.organizationId,
          ],
        ),
    );
  } catch (error) {
    console.error(
      'Could not load call context:',
      error.message,
    );

    exotelSocket.close(
      1011,
      'Call context unavailable',
    );

    return;
  }

  if (!callContext.rowCount) {
    exotelSocket.close(
      1008,
      'Call context unavailable',
    );

    return;
  }

  const lead = callContext.rows[0];

  const sarvamSocket = new WebSocket(
    createSarvamSttUrl(),
    {
      headers: {
        'api-subscription-key': env.SARVAM_API_KEY,
      },
      handshakeTimeout: 10000,
      maxPayload: 1_000_000,
    },
  );

  let streamSid = null;
  let closed = false;
  let greeted = false;
  let sarvamSessionReady = false;

  let turnNumber = 0;
  let currentPlayback = 0;

  let pendingSarvamAudio = [];
  let incomingAudioChunks = 0;
  let sarvamPartialCount = 0;
  let finalTranscriptCount = 0;

  const transcript = [];

  const conversation = [
    {
      role: 'system',
      content: createSystemPrompt(lead),
    },
  ];

  async function saveTranscript() {
    if (!transcript.length) return;

    try {
      await tenantQuery(
        tokenPayload.organizationId,
        tokenPayload.userId,
        (client) =>
          client.query(
            `UPDATE calls
             SET transcript = $1,
                 ended_at = COALESCE(ended_at, NOW()),
                 status = CASE
                   WHEN status = 'in_progress'
                   THEN 'completed'
                   ELSE status
                 END
             WHERE id = $2
               AND organization_id = $3`,
            [
              transcript.join('\n'),
              tokenPayload.callId,
              tokenPayload.organizationId,
            ],
          ),
      );
    } catch (error) {
      console.error(
        'Transcript save failed:',
        error.message,
      );
    }
  }

  function sendAudioToSarvam(payload) {
    if (
      closed ||
      sarvamSocket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    if (!sarvamSessionReady) {
      if (
        pendingSarvamAudio.length >=
        MAX_PENDING_SARVAM_AUDIO
      ) {
        console.error(
          'Sarvam session startup buffer exceeded.',
        );

        exotelSocket.close(
          1011,
          'Speech service startup timeout',
        );

        return;
      }

      pendingSarvamAudio.push(payload);
      return;
    }

    sarvamSocket.send(
      JSON.stringify({
        event: 'audio_input',
        audio: payload,
      }),
    );
  }

  async function speak(
    text,
    languageCode,
    expectedTurn,
  ) {
    const playbackId = ++currentPlayback;

    const pcm = await generateSpeech(
      text,
      languageCode,
    );

    if (
      closed ||
      expectedTurn !== turnNumber ||
      playbackId !== currentPlayback
    ) {
      return;
    }

    if (
      !streamSid ||
      exotelSocket.readyState !== WebSocket.OPEN
    ) {
      throw new Error(
        'Exotel media stream is not ready for playback.',
      );
    }

    console.log('EXOTEL_AUDIO_PLAYBACK_STARTED', {
      pcmBytes: pcm.length,
      playbackId,
      turnNumber: expectedTurn,
    });

    await sendExotelAudio(
      exotelSocket,
      streamSid,
      pcm,
      () =>
        !closed &&
        expectedTurn === turnNumber &&
        playbackId === currentPlayback,
    );

    console.log('EXOTEL_AUDIO_PLAYBACK_FINISHED', {
      playbackId,
      turnNumber: expectedTurn,
    });
  }

  async function respondToCustomer(
    spokenText,
    detectedLanguage,
  ) {
    const cleanText = String(
      spokenText || '',
    ).trim();

    if (!cleanText || closed) return;

    // Handle customer opt-out before calling Gemini.
    if (isOptOutRequest(cleanText)) {
      const thisTurn = ++turnNumber;

      // Stop any ongoing playback.
      currentPlayback += 1;

      transcript.push(`Customer: ${cleanText}`);

      // Record opt-out in the database.
      try {
        await markLeadAsOptedOut(
          lead.lead_id,
          tokenPayload,
        );
      } catch (error) {
        console.error(
          'Could not record opt-out:',
          error.stack || error.message,
        );

        // Do not continue as if opt-out was successfully recorded.
        return;
      }

      if (closed || thisTurn !== turnNumber) {
        return;
      }

      const language = detectResponseLanguage(
        detectedLanguage,
        cleanText,
      );

      const goodbye =
        language === 'hi-IN'
          ? 'जी, आपकी बात दर्ज कर ली गई है। अब हम आपको कॉल नहीं करेंगे। धन्यवाद।'
          : 'Understood. We will not call you again. Thank you.';

      transcript.push(`AI: ${goodbye}`);

      // Save transcript without blocking the goodbye.
      try {
        await saveTranscript();
      } catch (error) {
        console.error(
          'OPT_OUT_TRANSCRIPT_SAVE_FAILED:',
          error.message,
        );
      }

      // Speak the opt-out confirmation.
      try {
        if (!closed && thisTurn === turnNumber) {
          await speak(
            goodbye,
            language,
            thisTurn,
          );
        }
      } catch (error) {
        console.error(
          'OPT_OUT_GOODBYE_FAILED:',
          error.stack || error.message,
        );
      } finally {
        // Close the call even if speech generation or playback fails.
        if (
          !closed &&
          thisTurn === turnNumber &&
          exotelSocket.readyState === WebSocket.OPEN
        ) {
          exotelSocket.close(
            1000,
            'Customer opted out',
          );
        }
      }

      return;
    }

  // Keep your existing normal Gemini response pipeline below this point.

    const thisTurn = ++turnNumber;

    // Stop any previous playback.
    currentPlayback += 1;

    conversation.push({
      role: 'user',
      content: cleanText,
    });

    // Keep conversation history within the configured limit.
    while (
      conversation.length >
      MAX_CONVERSATION_MESSAGES
    ) {
      // Preserve the system message at index 0.
      conversation.splice(1, 2);
    }

    transcript.push(`Customer: ${cleanText}`);

    console.log('CUSTOMER_TURN_RECEIVED', {
      turnNumber: thisTurn,
      text: cleanText,
      detectedLanguage,
    });

    try {
      const answer = await callGeminiChat(
        conversation,
      );

      // Ignore responses belonging to an old turn.
      if (
        closed ||
        thisTurn !== turnNumber
      ) {
        return;
      }

      if (
        typeof answer !== 'string' ||
        !answer.trim()
      ) {
        throw new Error(
          'Gemini returned an empty response.',
        );
      }

      const cleanAnswer = answer.trim();

      console.log('GEMINI_ANSWER_READY', {
        turnNumber: thisTurn,
        answer: cleanAnswer,
      });

      conversation.push({
        role: 'assistant',
        content: cleanAnswer,
      });

      transcript.push(`AI: ${cleanAnswer}`);

      const languageCode = detectResponseLanguage(
        detectedLanguage,
        cleanText,
      );

      // Speak the actual Gemini response.
      await speak(
        cleanAnswer,
        languageCode,
        thisTurn,
      );

    } catch (error) {
      console.error(
        'CUSTOMER_RESPONSE_PIPELINE_FAILED:',
        error.stack || error.message,
      );

      // Do not speak a fallback for an old turn or ended call.
      if (
        closed ||
        thisTurn !== turnNumber
      ) {
        return;
      }

      const fallback =
        detectedLanguage === 'hi-IN'
          ? 'माफ़ कीजिए, अभी थोड़ी तकनीकी दिक्कत आ रही है। कृपया अपनी बात एक बार फिर बताइए।'
          : 'Sorry, I am facing a temporary technical issue. Could you please repeat that?';

      transcript.push(`AI: ${fallback}`);

      try {
        await speak(
          fallback,
          detectedLanguage === 'hi-IN'
            ? 'hi-IN'
            : 'en-IN',
          thisTurn,
        );
      } catch (fallbackError) {
        console.error(
          'VOICE_FALLBACK_FAILED:',
          fallbackError.stack || fallbackError.message,
        );
      }
    }
  }

  function processExotelMessage(rawMessage) {
    try {
      const event = JSON.parse(
        rawMessage.toString(),
      );

      if (event.event === 'start') {
        streamSid =
          event.start?.stream_sid ||
          event.stream_sid ||
          null;

        const format = event.start?.media_format;

        if (
          format?.sample_rate &&
          Number(format.sample_rate) !==
          EXOTEL_SAMPLE_RATE
        ) {
          console.error(
            'Unexpected Exotel sample rate:',
            format,
          );

          exotelSocket.close(
            1003,
            'Unsupported audio sample rate',
          );

          return;
        }

        if (format) {
          console.log(
            'Exotel media format:',
            format,
          );
        }

        if (!streamSid) {
          console.error(
            'Exotel start event did not contain stream SID.',
          );

          exotelSocket.close(
            1003,
            'Missing stream identifier',
          );

          return;
        }

        tenantQuery(
          tokenPayload.organizationId,
          tokenPayload.userId,
          (client) =>
            client.query(
              `UPDATE calls
               SET status = 'in_progress',
                   started_at = COALESCE(
                     started_at,
                     NOW()
                   )
               WHERE id = $1
                 AND organization_id = $2`,
              [
                tokenPayload.callId,
                tokenPayload.organizationId,
              ],
            ),
        ).catch((error) => {
          console.error(
            'Could not update call start:',
            error.message,
          );
        });

        if (!greeted) {
          greeted = true;

          const greeting =
            `Hello, main ${lead.organization_name || 'LeadFlow'} ki AI assistant hoon. ` +
            `Hum businesses ke liye professional websites develop karte hain. ` +
            `Kya abhi do minute baat karna convenient hoga?`;

          transcript.push(`AI: ${greeting}`);

          speak(
            greeting,
            'hi-IN',
            turnNumber,
          ).catch((error) => {
            console.error(
              'Greeting failed:',
              error.message,
            );
          });
        }

        return;
      }

      if (
        event.event === 'media' &&
        event.media?.payload
      ) {
        incomingAudioChunks++;

        if (
          incomingAudioChunks === 1 ||
          incomingAudioChunks % 50 === 0
        ) {
          console.log('EXOTEL_AUDIO_RECEIVED', {
            chunks: incomingAudioChunks,
            payloadLength: event.media.payload.length,
            sarvamReady: sarvamSessionReady,
          });
        }

        sendAudioToSarvam(event.media.payload);
        return;
      }

      if (event.event === 'stop') {
        shutdown();
      }
    } catch (error) {
      console.error(
        'Exotel message processing failed:',
        error.message,
      );
    }
  }

  let shutdownPromise = null;

  function shutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    closed = true;
    currentPlayback += 1;
    pendingSarvamAudio = [];

    if (
      sarvamSocket.readyState === WebSocket.OPEN ||
      sarvamSocket.readyState === WebSocket.CONNECTING
    ) {
      sarvamSocket.close(
        1000,
        'Call ended',
      );
    }

    shutdownPromise = saveTranscript();

    return shutdownPromise;
  }

  sarvamSocket.on('open', () => {
    if (closed) {
      sarvamSocket.close();
      return;
    }

    exotelSocket.off(
      'message',
      captureEarlyMessage,
    );

    exotelSocket.on(
      'message',
      processExotelMessage,
    );

    for (const message of earlyMessages) {
      if (closed) break;

      processExotelMessage(message);
    }

    earlyMessages.length = 0;
  });

  sarvamSocket.on('message', (rawMessage) => {
    try {
      const event = JSON.parse(
        rawMessage.toString(),
      );

      if (event.event === 'session.begin') {
        sarvamSessionReady = true;

        console.log(
          'Sarvam realtime STT session ready.',
        );

        while (
          pendingSarvamAudio.length > 0 &&
          !closed &&
          sarvamSocket.readyState === WebSocket.OPEN
        ) {
          const payload =
            pendingSarvamAudio.shift();

          sarvamSocket.send(
            JSON.stringify({
              event: 'audio_input',
              audio: payload,
            }),
          );
        }

        return;
      }

      if (event.event === 'transcript.partial') {
        sarvamPartialCount++;

        if (
          sarvamPartialCount === 1 ||
          sarvamPartialCount % 5 === 0
        ) {
          console.log('SARVAM_TRANSCRIPT_PARTIAL', {
            count: sarvamPartialCount,
            text: event.text || '',
          });
        }

        return;
      }

      if (event.event === 'transcript.final') {
        finalTranscriptCount++;

        const spokenText = String(
          event.text || '',
        ).trim();

        console.log('SARVAM_TRANSCRIPT_FINAL', {
          count: finalTranscriptCount,
          text: spokenText,
          language:
            event.language ||
            event.language_code ||
            'auto',
        });

        if (!spokenText) {
          console.warn('SARVAM_FINAL_TRANSCRIPT_EMPTY');
          return;
        }

        respondToCustomer(
          spokenText,
          event.language ||
          event.language_code ||
          'auto',
        ).catch((error) => {
          console.error(
            'TURN_PROCESSING_FAILED:',
            error.stack || error.message,
          );
        });

        return;
      }

      if (event.event === 'vad.speech_start') {
        console.log('SARVAM_VAD_SPEECH_START');

        // Do not invalidate an in-progress Gemini response here.
        // The final transcript will trigger the next customer turn.

        return;
      }

      if (event.event === 'error') {
        console.error(
          'Sarvam STT error:',
          event.code,
          event.message,
        );

        if (event.is_fatal) {
          exotelSocket.close(
            1011,
            'Speech recognition failed',
          );
        }

        return;
      }

      if (event.event) {
        console.log('SARVAM_EVENT', event.event);
      }
    } catch (error) {
      console.error(
        'Sarvam event processing failed:',
        error.message,
      );
    }
  });

  sarvamSocket.on('error', (error) => {
    console.error(
      'Sarvam STT WebSocket error:',
      error.message,
    );

    if (
      exotelSocket.readyState === WebSocket.OPEN
    ) {
      exotelSocket.close(
        1011,
        'Speech recognition unavailable',
      );
    }
  });

  sarvamSocket.on('close', (code, reason) => {
    console.log(
      'Sarvam STT connection closed:',
      code,
      reason.toString(),
    );

    if (
      !closed &&
      exotelSocket.readyState === WebSocket.OPEN
    ) {
      exotelSocket.close(
        1011,
        'Speech recognition disconnected',
      );
    }
  });

  exotelSocket.on('error', (error) => {
    console.error(
      'Exotel media socket error:',
      error.message,
    );

    shutdown();
  });

  exotelSocket.on('close', () => {
    shutdown();
  });
}