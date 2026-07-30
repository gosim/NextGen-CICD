import { Router } from 'express';
import type { StateStore } from './state.js';

// Server-Sent-Events-Endpunkt GET /stream (CONTRACT §1):
//  - sofort ein voller `state`-Snapshot bei Connect,
//  - danach `state` bei jeder (gedrosselten) Änderung und `test` je Live-Testfall,
//  - Heartbeat-Kommentar alle 25 s (hält Proxies/Verbindung offen),
//  - sauberes Cleanup bei Disconnect.

const HEARTBEAT_MS = 25000;

export function sseRouter(state: StateStore): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx & Co. nicht puffern lassen (sonst kommen Events verzögert an).
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Vor cleanup/write deklarieren (beide referenzieren heartbeat).
    const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref?.();

    let cleanedUp = false;
    let offState: () => void = () => {};
    let offTest: () => void = () => {};

    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      offState();
      offTest();
    };

    const write = (chunk: string): void => {
      if (res.writableEnded) return;
      try {
        res.write(chunk);
      } catch {
        cleanup();
      }
    };

    const send = (event: string, data: unknown): void => {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Initialer Voll-Snapshot — das Frontend ist damit sofort voll funktionsfähig.
    send('state', state.getSnapshot());

    offState = state.onState((snapshot) => send('state', snapshot));
    offTest = state.onTest((testCase) => send('test', testCase));

    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  return router;
}
