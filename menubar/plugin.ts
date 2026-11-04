import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { ServiceResult } from '../src/blocks.ts';
import { effectiveIndicator, fetchSummary, SOURCES, type Indicator } from '../src/statuspage.ts';
import { buildMenu, detectTransitions, type Transition } from './render.ts';

const run = promisify(execFile);
const dataDir = process.env.SWIFTBAR_PLUGIN_DATA_PATH ?? join(homedir(), '.cache', 'service-status');
const statePath = join(dataDir, 'state.json');

async function readState(): Promise<Record<string, Indicator>> {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return {};
  }
}

async function notify(transition: Transition, result: ServiceResult): Promise<void> {
  if (!('summary' in result)) return;
  const label = result.source.label;
  const color = transition.to === 'minor' ? '🟡' : '🔴';
  const title = transition.kind === 'recovered' ? `🟢 ${label} se recuperó` : `${color} ${label} con problemas`;
  const body = result.summary.incidents[0]?.name ?? result.summary.status.description;
  const href = result.summary.incidents[0]?.shortlink ?? result.summary.page.url;
  const plugin = process.env.SWIFTBAR_PLUGIN_PATH;
  try {
    if (!plugin) throw new Error('not running under SwiftBar');
    const query = new URLSearchParams({ plugin: basename(plugin), title, body, href });
    await run('open', ['-g', `swiftbar://notify?${query.toString().replace(/\+/g, '%20')}`]);
  } catch {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
    await run('osascript', ['-e', script]).catch(() => undefined);
  }
}

const sources = Object.values(SOURCES);
const results: ServiceResult[] = await Promise.all(
  sources.map(async (source) => {
    try {
      return { source, summary: await fetchSummary(source) };
    } catch (error) {
      return { source, error: error instanceof Error ? error.message : String(error) };
    }
  }),
);

console.log(buildMenu(results, { now: new Date(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));

const previous = await readState();
const current = Object.fromEntries(
  results.flatMap((result) => ('summary' in result ? [[result.source.key, effectiveIndicator(result.summary)]] : [])),
);
for (const transition of detectTransitions(previous, current)) {
  const result = results.find((item) => item.source.key === transition.key);
  if (result) await notify(transition, result);
}
await mkdir(dataDir, { recursive: true });
await writeFile(statePath, JSON.stringify({ ...previous, ...current }));
