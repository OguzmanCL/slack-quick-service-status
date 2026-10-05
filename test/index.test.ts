import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const env = { SLACK_SIGNING_SECRET: 'test-signing-secret' };

function slackRequest(text: string): Request {
  const body = new URLSearchParams({ command: '/ss', text }).toString();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac('sha256', env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;
  return new Request('https://worker.test/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body,
  });
}

interface SlackPayload {
  response_type: string;
  text: string;
  blocks: Array<{ type: string; text?: { text: string } }>;
}

function fakeSummary(name: string) {
  return {
    page: { name, url: `https://${name}.test`, updated_at: '2026-10-05T19:50:50.000Z' },
    status: { indicator: 'none', description: 'All Systems Operational' },
    components: [{ name: 'API', status: 'operational', group: false }],
    incidents: [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('worker fetch', () => {
  it('rejects requests with a bad signature', async () => {
    const request = new Request('https://worker.test/', { method: 'POST', body: 'text=github' });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(401);
  });

  it('answers ephemerally with blocks for the requested source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fakeSummary('github'))));
    const response = await worker.fetch(slackRequest('github'), env);
    const payload = (await response.json()) as SlackPayload;
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.blocks[0]?.text?.text).toBe('GitHub status');
  });

  it('posts in channel when --public is passed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(fakeSummary('claude'))));
    const response = await worker.fetch(slackRequest('claude --public'), env);
    const payload = (await response.json()) as SlackPayload;
    expect(payload.response_type).toBe('in_channel');
  });

  it('keeps the healthy source when the other one fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('githubstatus') ? new Response('nope', { status: 503 }) : Response.json(fakeSummary('claude')),
      ),
    );
    const response = await worker.fetch(slackRequest('all'), env);
    const payload = (await response.json()) as SlackPayload;
    const texts = payload.blocks.map((block) => block.text?.text ?? '');
    expect(texts.some((text) => text.includes('No pude consultar *GitHub*'))).toBe(true);
    expect(texts).toContain('Claude status');
  });

  it('answers help privately even when --public is passed', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const response = await worker.fetch(slackRequest('help --public'), env);
    const payload = (await response.json()) as SlackPayload;
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('`/ss help`');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('names the unknown source and shows the help', async () => {
    const response = await worker.fetch(slackRequest('jira'), env);
    const payload = (await response.json()) as SlackPayload;
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('No conozco `jira`');
    expect(payload.text).toContain('`/ss help`');
  });
});
