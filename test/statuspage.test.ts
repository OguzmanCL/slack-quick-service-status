import { describe, expect, it } from 'vitest';
import { buildHelpText, effectiveIndicator, resolveSources, SOURCES, type StatuspageSummary } from '../src/statuspage';

function summaryWith(overrides: Partial<StatuspageSummary>): StatuspageSummary {
  return {
    page: { name: 'GitHub', url: 'https://www.githubstatus.com', updated_at: '2026-10-06T18:50:00.000Z' },
    status: { indicator: 'none', description: 'All Systems Operational' },
    components: [{ name: 'Git Operations', status: 'operational', group: false }],
    incidents: [],
    ...overrides,
  };
}

function incident(impact: string, status = 'investigating'): StatuspageSummary['incidents'][number] {
  return { name: 'Incident', status, impact, shortlink: 'https://stspg.io/x', incident_updates: [] };
}

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

describe('effectiveIndicator', () => {
  it('raises a calm page to the impact of an active incident', () => {
    expect(effectiveIndicator(summaryWith({ incidents: [incident('minor')] }))).toBe('minor');
  });

  it('raises the page to the worst visible component and ignores groups', () => {
    const summary = summaryWith({
      status: { indicator: 'minor', description: 'Minor Service Outage' },
      components: [
        { name: 'Pages', status: 'major_outage', group: false },
        { name: 'Grouped', status: 'major_outage', group: true },
      ],
    });
    expect(effectiveIndicator(summary)).toBe('critical');
    expect(effectiveIndicator({ ...summary, components: [summary.components[1]!] })).toBe('minor');
  });

  it('ignores incidents already mitigated or with an impact it does not know', () => {
    expect(effectiveIndicator(summaryWith({ incidents: [incident('minor', 'monitoring')] }))).toBe('none');
    expect(effectiveIndicator(summaryWith({ incidents: [incident('maintenance')] }))).toBe('none');
  });
});
