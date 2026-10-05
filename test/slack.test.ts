import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySlackRequest } from '../src/slack';

const secret = 'test-signing-secret';
const body = 'command=%2Fstatus&text=github';

function sign(timestamp: string): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
}

describe('verifySlackRequest', () => {
  it('accepts a fresh request with a valid signature', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(verifySlackRequest(secret, timestamp, sign(timestamp), body)).resolves.toBe(true);
  });

  it('rejects a tampered body', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(verifySlackRequest(secret, timestamp, sign(timestamp), `${body}x`)).resolves.toBe(false);
  });

  it('rejects stale timestamps', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    await expect(verifySlackRequest(secret, timestamp, sign(timestamp), body)).resolves.toBe(false);
  });

  it('rejects missing headers', async () => {
    await expect(verifySlackRequest(secret, null, null, body)).resolves.toBe(false);
  });
});
