
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const SARVAM_URL = 'https://api.sarvam.ai/v2/chat/completions';

async function generateJson({ systemPrompt, userPrompt, maxTokens = 120 }) {
  if (!env.SARVAM_API_KEY) {
    throw new HttpError(503, 'AI features are unavailable until SARVAM_API_KEY is configured.');
  }

  let response;

  try {
    response = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': env.SARVAM_API_KEY,
      },
      body: JSON.stringify({
        model: env.SARVAM_LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    throw new HttpError(502, 'Unable to connect to the Sarvam AI service.');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Sarvam API error:', response.status, errorBody.slice(0, 500));

    throw new HttpError(
      response.status === 429 ? 429 : 502,
      'Sarvam AI could not process the request. Please try again later.',
    );
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new HttpError(502, 'Sarvam AI returned an empty response.');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new HttpError(502, 'Sarvam AI returned invalid JSON.');
  }
}

export async function scoreLead(lead) {
  const result = await generateJson({
    systemPrompt:
      'Score this business sales lead. Return JSON with score (integer 0-100), priority (low, medium, high), and summary (one short sentence). Use only supplied business information. Do not infer sensitive attributes.',
    userPrompt: JSON.stringify({
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      company: lead.company,
      source: lead.source,
      notes: lead.notes,
      currentStatus: lead.status,
    }),
    maxTokens: 100,
  });

  return {
    score: Math.min(100, Math.max(0, Number(result.score) || 0)),
    priority: ['low', 'medium', 'high'].includes(result.priority)
      ? result.priority
      : 'medium',
    summary: String(result.summary || '').slice(0, 1000),
  };
}

export async function summarizeCall(transcript) {
  const result = await generateJson({
    systemPrompt:
      'Summarize this sales call. Return JSON with summary, sentiment (positive, neutral, negative), outcome, and followUpSuggestion. Do not invent facts.',
    userPrompt: String(transcript).slice(0, 8000),
    maxTokens: 120,
  });

  return {
    summary: String(result.summary || '').slice(0, 3000),
    sentiment: ['positive', 'neutral', 'negative'].includes(result.sentiment)
      ? result.sentiment
      : 'neutral',
    outcome: String(result.outcome || '').slice(0, 500),
    followUpSuggestion: String(result.followUpSuggestion || '').slice(0, 500),
  };
}
