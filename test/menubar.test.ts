import { describe, expect, it } from 'vitest';
import { buildMenu, detectTransitions } from '../menubar/render';
import { SOURCES, type StatuspageSummary } from '../src/statuspage';

const now = new Date('2026-11-04T19:05:00.000Z');
const options = { now, timeZone: 'America/Bogota' };

function summary(url: string, overrides: Partial<StatuspageSummary> = {}): StatuspageSummary {
  return {
    page: { name: 'Page', url, updated_at: '2026-11-04T19:00:00.000Z' },
    status: { indicator: 'none', description: 'All Systems Operational' },
    components: [
      { name: 'Git Operations', status: 'operational', group: false },
      { name: 'Grouped', status: 'operational', group: true },
    ],
    incidents: [],
    ...overrides,
  };
}

const degradedGithub = summary('https://www.githubstatus.com', {
  components: [
    { name: 'Git Operations', status: 'operational', group: false },
    { name: 'Actions', status: 'degraded_performance', group: false },
  ],
  incidents: [
    {
      name: 'Delayed | Actions runs',
      status: 'investigating',
      impact: 'minor',
      shortlink: 'https://stspg.io/abc',
      incident_updates: [],
    },
  ],
});

describe('buildMenu', () => {
  it('shows a yellow title with the affected service and one dot per component per row', () => {
    const menu = buildMenu(
      [
        { source: SOURCES.github, summary: degradedGithub },
        { source: SOURCES.claude, summary: summary('https://status.claude.com') },
      ],
      options,
    );
    expect(menu).toBe(
      [
        '🟡 GitHub',
        '---',
        'GitHub  🟢🟡 | href=https://www.githubstatus.com',
        '--🟢 Git Operations | href=https://www.githubstatus.com',
        '--🟡 Actions | href=https://www.githubstatus.com',
        '-----',
        '--🚨 Delayed / Actions runs | href=https://stspg.io/abc',
        'Claude  🟢 | href=https://status.claude.com',
        '--🟢 Git Operations | href=https://status.claude.com',
        '---',
        'Actualizado 14:05 | disabled=true',
        'Refrescar ahora | refresh=true',
      ].join('\n'),
    );
  });

  it('turns red on any outage and gray when a source fails while the rest is fine', () => {
    const outage = summary('https://www.githubstatus.com', {
      components: [{ name: 'Pages', status: 'major_outage', group: false }],
    });
    const failed = { source: SOURCES.claude, error: 'Claude status API responded 503' };

    const red = buildMenu([{ source: SOURCES.github, summary: outage }, failed], options).split('\n');
    expect(red[0]).toBe('🔴 GitHub');
    expect(red).toContain('Claude  ⚪ Sin datos | href=https://status.claude.com');
    expect(red).toContain('--Claude status API responded 503 | disabled=true');

    const gray = buildMenu([{ source: SOURCES.github, summary: summary('https://www.githubstatus.com') }, failed], options);
    expect(gray.split('\n')[0]).toBe('⚪');
  });
});

describe('detectTransitions', () => {
  it('reports services that got worse or fully recovered and stays quiet otherwise', () => {
    expect(
      detectTransitions(
        { github: 'none', claude: 'major', other: 'critical' },
        { github: 'minor', claude: 'none', other: 'minor' },
      ),
    ).toEqual([
      { key: 'github', from: 'none', to: 'minor', kind: 'worsened' },
      { key: 'claude', from: 'major', to: 'none', kind: 'recovered' },
    ]);
    expect(detectTransitions({ github: 'minor' }, { github: 'minor' })).toEqual([]);
    expect(detectTransitions({}, { github: 'major' })).toEqual([
      { key: 'github', from: 'none', to: 'major', kind: 'worsened' },
    ]);
  });
});
