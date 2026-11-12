
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

function extractCallSid(responseText) {
  // Exotel JSON response
  try {
    const parsed = JSON.parse(responseText);

    const sid = parsed?.Call?.Sid || parsed?.Sid;

    if (sid) return sid;
  } catch {
    // Try XML parsing below.
  }

  // Exotel XML response
  const xmlMatch = responseText.match(/<Sid>\s*([^<]+)\s*<\/Sid>/i);

  return xmlMatch?.[1]?.trim() || null;
}

export async function startAiCall({
  customerPhone,
  streamUrl,
  statusCallback,
}) {
  if (!env.CALLING_ENABLED) {
    throw new HttpError(
      503,
      'Calling is disabled. Configure and enable Exotel first.',
    );
  }

  if (
    !env.EXOTEL_ACCOUNT_SID ||
    !env.EXOTEL_API_KEY ||
    !env.EXOTEL_API_TOKEN
  ) {
    throw new HttpError(503, 'Exotel credentials are incomplete.');
  }

  const approvedCallerId = env.EXOTEL_CALLER_ID;

  if (!approvedCallerId) {
    throw new HttpError(
      503,
      'Configure an approved Exotel caller ID before dialing.',
    );
  }

  if (!customerPhone || !streamUrl || !statusCallback) {
    throw new HttpError(400, 'Required call parameters are missing.');
  }

  const endpoint = new URL(
    `/v1/Accounts/${encodeURIComponent(
      env.EXOTEL_ACCOUNT_SID,
    )}/Calls/connect`,
    `https://${env.EXOTEL_SUBDOMAIN}`,
  );

  // Exotel multipart form request
  const form = new FormData();

  form.append('From', customerPhone);
  form.append('CallerId', approvedCallerId);
  form.append('StreamUrl', streamUrl);
  form.append('StreamType', 'bidirectional');
  form.append('StatusCallback', statusCallback);
  form.append('StatusCallbackEvents[]', 'terminal');
  form.append('TimeLimit', '600');

  const credentials = Buffer.from(
    `${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}`,
  ).toString('base64');

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json, application/xml, text/xml',
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error('Exotel connection error:', error.message);

    throw new HttpError(
      502,
      'Could not connect to the Exotel API.',
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      'Exotel call request failed:',
      response.status,
      responseText,
    );

    throw new HttpError(
      502,
      'The calling provider could not start the call.',
    );
  }

  const providerCallId = extractCallSid(responseText);

  if (!providerCallId) {
    console.error(
      'Could not extract Exotel Call SID:',
      responseText,
    );

    throw new HttpError(
      502,
      'The provider response did not contain a call identifier.',
    );
  }

  return {
    providerCallId,
    providerResponse: responseText,
  };
}
