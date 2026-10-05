import { describe, expect, it } from 'vitest';
import { buildBlocks, buildHelpText, resolveSources, SOURCES, type StatuspageSummary } from '../src/statuspage';

const summary: StatuspageSummary = {
  page: { name: 'GitHub', url: 'https://www.githubstatus.com', updated_at: '2026-10-05T19:50:50.000Z' },
  status: { indicator: 'minor', description: 'Partially Degraded Service' },
  components: [
    { name: 'Git Operations', status: 'operational', group: false },
    { name: 'Visit www.githubstatus.com for more information', status: 'operational', group: false },
    { name: 'Actions', status: 'degraded_performance', group: false },
    { name: 'Some group', status: 'operational', group: true },
  ],
  incidents: [
    {
      name: 'Incident with Actions',
      status: 'investigating',
      impact: 'minor',
      shortlink: 'https://stspg.io/abc',
      incident_updates: [{ body: 'Runners are delayed.', created_at: '2026-10-05T19:50:50.000Z' }],
    },
  ],
};

describe('resolveSources', () => {
  it('returns every source for empty text or "all"', () => {
    expect(resolveSources('')).toEqual(Object.values(SOURCES));
    expect(resolveSources(' all ')).toEqual(Object.values(SOURCES));
  });

  it('returns the requested sources ignoring case and unknown names', () => {
    expect(resolveSources('GitHub nope')).toEqual([SOURCES.github]);
    expect(resolveSources('claude github')).toEqual([SOURCES.claude, SOURCES.github]);
  });

  it('accepts short aliases and never repeats a source', () => {
    expect(resolveSources('g')).toEqual([SOURCES.github]);
    expect(resolveSources('C')).toEqual([SOURCES.claude]);
    expect(resolveSources('g claude github')).toEqual([SOURCES.github, SOURCES.claude]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(resolveSources('jira')).toEqual([]);
  });
});

describe('buildHelpText', () => {
  it('lists every source with its aliases plus the help and public options', () => {
    const help = buildHelpText();
    expect(help).toContain('`/ss` · GitHub y Claude');
    expect(help).toContain('`/ss g` o `/ss github` · Solo GitHub');
    expect(help).toContain('`/ss c` o `/ss claude` · Solo Claude');
    expect(help).toContain('`/ss help`');
    expect(help).toContain('`--public`');
  });
});

describe('buildBlocks', () => {
  const blocks = buildBlocks(SOURCES.github, summary) as Array<{ type: string; text?: { text: string } }>;
  const texts = blocks.map((block) => block.text?.text ?? '');

  it('starts with a header and the overall status', () => {
    expect(blocks[0]).toEqual({ type: 'header', text: { type: 'plain_text', text: 'GitHub status' } });
    expect(texts[1]).toContain(':large_yellow_circle: *Partially Degraded Service*');
    expect(texts[1]).toContain('https://www.githubstatus.com');
  });

  it('lists real components with an emoji and skips groups and link placeholders', () => {
    expect(texts[2]).toBe(
      ':large_green_circle: Git Operations\n:large_yellow_circle: Actions _(degraded performance)_',
    );
  });

  it('adds one section per incident with its latest update', () => {
    expect(texts[3]).toContain('<https://stspg.io/abc|Incident with Actions>');
    expect(texts[3]).toContain('Impacto: *minor*');
    expect(texts[3]).toContain('> Runners are delayed.');
  });

  it('ends with a context line and a divider', () => {
    expect(blocks.at(-2)?.type).toBe('context');
    expect(blocks.at(-1)?.type).toBe('divider');
  });

  it('omits incident sections when there are none', () => {
    const quiet = buildBlocks(SOURCES.claude, { ...summary, incidents: [] });
    expect(quiet).toHaveLength(5);
  });
});
