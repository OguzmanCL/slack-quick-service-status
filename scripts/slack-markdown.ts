import { buildMessageBlocks, type ServiceResult } from '../src/blocks.ts';
import { blocksToMarkdown } from '../src/markdown.ts';
import { fetchSummary, resolveSources } from '../src/statuspage.ts';

const sources = resolveSources(process.argv[2] ?? 'all');
if (sources.length === 0) {
  console.error(`Unknown service "${process.argv[2]}"`);
  process.exit(1);
}

const results: ServiceResult[] = await Promise.all(
  sources.map(async (source) => {
    try {
      return { source, summary: await fetchSummary(source) };
    } catch (error) {
      return { source, error: error instanceof Error ? error.message : String(error) };
    }
  }),
);
const now = new Date();
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(blocksToMarkdown(buildMessageBlocks(results, now), { now, timeZone }));
