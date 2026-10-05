import { buildBlocks, fetchSummary, resolveSources } from '../src/statuspage.ts';

const sources = resolveSources(process.argv[2] ?? 'all');
for (const source of sources) {
  const summary = await fetchSummary(source);
  for (const block of buildBlocks(source, summary) as Array<{ type: string; text?: { text: string }; elements?: Array<{ text: string }> }>) {
    if (block.text) console.log(block.text.text);
    else if (block.elements) console.log(block.elements[0].text);
    else console.log('────────');
  }
}
