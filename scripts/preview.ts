import { buildMessageBlocks, type ServiceResult } from '../src/blocks.ts';
import { fetchSummary, resolveSources } from '../src/statuspage.ts';

const sources = resolveSources(process.argv[2] ?? 'all');
const results: ServiceResult[] = await Promise.all(
  sources.map(async (source) => {
    try {
      return { source, summary: await fetchSummary(source) };
    } catch (error) {
      return { source, error: error instanceof Error ? error.message : String(error) };
    }
  }),
);
const blocks = buildMessageBlocks(results, new Date());
console.log(`https://app.slack.com/block-kit-builder/#${encodeURIComponent(JSON.stringify({ blocks }))}`);
