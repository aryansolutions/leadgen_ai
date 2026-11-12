
import http from 'node:http';
import jwt from 'jsonwebtoken';
import WebSocket, { WebSocketServer } from 'ws';

import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { handleExotelVoiceSocket } from './services/realtimeVoiceService.js';

const server = http.createServer(app);

const mediaServer = new WebSocketServer({
  noServer: true,
  maxPayload: 1_000_000,
});

const activeSockets = new Set();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

server.on('upgrade', (request, socket, head) => {
  try {
    const host = request.headers.host;

    if (!host || !request.url) {
      socket.destroy();
      return;
    }

    const requestUrl = new URL(request.url, `http://${host}`);

    // Accept the token from either the URL path or query string.
    const pathMatch = requestUrl.pathname.match(
      /^\/media\/([^/]+)\/?$/,
    );

    if (
      requestUrl.pathname !== '/media' &&
      !pathMatch
    ) {
      socket.destroy();
      return;
    }

    let token = requestUrl.searchParams.get('token');

    if (!token && pathMatch) {
      token = decodeURIComponent(pathMatch[1]);
    }

    if (!token) {
      console.error('Rejected media WebSocket upgrade:', {
        reason: 'Missing JWT token',
        pathname: requestUrl.pathname,
        queryKeys: [...requestUrl.searchParams.keys()],
      });

      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!env.JWT_SECRET) {
      console.error('JWT_SECRET is missing.');

      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'leadflow-api',
      audience: 'leadflow-media',
      algorithms: ['HS256'],
    });

    const callIdValid = UUID_PATTERN.test(payload.callId || '');
    const organizationIdValid = UUID_PATTERN.test(
      payload.organizationId || '',
    );
    const userIdValid = UUID_PATTERN.test(payload.userId || '');

    if (
      payload.purpose !== 'exotel-media' ||
      !callIdValid ||
      !organizationIdValid ||
      !userIdValid
    ) {
      console.error('Rejected media WebSocket upgrade:', {
        reason: 'Invalid JWT claims',
        purposeValid: payload.purpose === 'exotel-media',
        callIdValid,
        organizationIdValid,
        userIdValid,
      });

      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    console.log('Media WebSocket authentication successful.');

    mediaServer.handleUpgrade(request, socket, head, (websocket) => {
      mediaServer.emit('connection', websocket, payload);
    });
  } catch (error) {
    console.error('Rejected media WebSocket upgrade:', {
      errorName: error.name,
      errorMessage: error.message,
      jwtSecretConfigured: Boolean(env.JWT_SECRET),
    });

    if (!socket.destroyed) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }
});

mediaServer.on('connection', (websocket, tokenPayload) => {
  console.log('Exotel media WebSocket connected:', {
    callId: tokenPayload.callId,
    organizationId: tokenPayload.organizationId,
  });

  activeSockets.add(websocket);

  websocket.once('close', () => {
    activeSockets.delete(websocket);
  });

  websocket.once('error', (error) => {
    console.error('Media WebSocket error:', error.message);
  });

  handleExotelVoiceSocket(websocket, tokenPayload).catch((error) => {
    console.error('Voice bridge failed:', error);

    if (websocket.readyState === WebSocket.OPEN) {
      websocket.close(1011, 'Voice bridge unavailable');
    }
  });
});

server.listen(env.PORT, () => {
  console.log(`LeadFlow API listening on port ${env.PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  for (const websocket of activeSockets) {
    if (
      websocket.readyState === WebSocket.OPEN ||
      websocket.readyState === WebSocket.CONNECTING
    ) {
      websocket.close(1001, 'Server shutting down');
    }
  }

  mediaServer.close();

  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown error:', error);
      process.exit(1);
      return;
    }

    try {
      await pool.end();

      clearTimeout(forceExitTimer);

      console.log('LeadFlow API shut down successfully.');

      process.exit(0);
    } catch (shutdownError) {
      console.error('Database shutdown error:', shutdownError);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
