import { buildBlocks, buildHelpText, fetchSummary, resolveSources } from './statuspage';
import { verifySlackRequest } from './slack';

interface Env {
  SLACK_SIGNING_SECRET: string;
}

function slackJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Handles the /ss slash command and replies with Block Kit blocks.
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

    const results = await Promise.allSettled(sources.map((source) => fetchSummary(source)));
    const blocks = results.flatMap((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') return buildBlocks(source, result.value);
      return [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `:warning: No pude consultar *${source.label}*: ${result.reason}` },
        },
      ];
    });

    return slackJson({
      response_type: inChannel ? 'in_channel' : 'ephemeral',
      text: `Status de ${sources.map((source) => source.label).join(' y ')}`,
      blocks,
    });
  },
};
