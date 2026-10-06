import { buildMessageBlocks, type ServiceResult } from './blocks.ts';
import { buildHelpText, fetchSummary, resolveSources } from './statuspage.ts';
import { verifySlackRequest } from './slack.ts';

interface Env {
  SLACK_SIGNING_SECRET: string;
}

function slackJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Handles the /ss slash command and replies with Block Kit blocks. Signed interaction payloads
 * from link buttons are acknowledged with an empty 200.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const rawBody = await request.text();
    const valid = await verifySlackRequest(
      env.SLACK_SIGNING_SECRET,
      request.headers.get('x-slack-request-timestamp'),
      request.headers.get('x-slack-signature'),
      rawBody,
    );
    if (!valid) return new Response('Invalid signature', { status: 401 });

    const form = new URLSearchParams(rawBody);
    if (form.has('payload')) return new Response(null, { status: 200 });

    const text = form.get('text') ?? '';
    const inChannel = text.includes('--public');
    const query = text.replace('--public', '').trim();

    if (query.toLowerCase() === 'help') {
      return slackJson({ response_type: 'ephemeral', text: buildHelpText() });
    }

    const sources = resolveSources(query);
    if (sources.length === 0) {
      return slackJson({
        response_type: 'ephemeral',
        text: `No conozco \`${query}\`.\n\n${buildHelpText()}`,
      });
    }

    const settled = await Promise.allSettled(sources.map((source) => fetchSummary(source)));
    const results: ServiceResult[] = settled.map((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') return { source, summary: result.value };
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return { source, error: reason };
    });

    return slackJson({
      response_type: inChannel ? 'in_channel' : 'ephemeral',
      text: `Status de ${sources.map((source) => source.label).join(' y ')}`,
      blocks: buildMessageBlocks(results, new Date()),
    });
  },
};
