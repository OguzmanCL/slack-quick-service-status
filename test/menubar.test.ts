import { describe, expect, it } from 'vitest';
import { buildMenu, buildTitleIcon, detectTransitions } from '../menubar/render';
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

function decodeTitle(menu: string): string {
  const [, image] = menu.split('\n')[0]!.match(/^ \| image=(.+)$/) ?? [];
  return Buffer.from(image ?? '', 'base64').toString('utf8');
}

describe('buildTitleIcon', () => {
  it('draws one logo per service colored by its effective state, gray when it failed', () => {
    const svg = buildTitleIcon([
      { source: SOURCES.github, summary: degradedGithub },
      { source: SOURCES.claude, error: 'Claude status API responded 503' },
    ]);
    expect(svg).toMatch(/^<svg [^>]*width="42" height="18"/);
    expect(svg).toContain(`fill="#e5b300" d="${SOURCES.github.iconPath}"`);
    expect(svg).toContain(`fill="#8e8e93" d="${SOURCES.claude.iconPath}"`);
  });
});

describe('buildMenu', () => {
  it('uses the logo image as title and one dot per component per row', () => {
    const menu = buildMenu(
      [
        { source: SOURCES.github, summary: degradedGithub },
        { source: SOURCES.claude, summary: summary('https://status.claude.com') },
      ],
      options,
    );
    expect(decodeTitle(menu)).toBe(
      buildTitleIcon([
        { source: SOURCES.github, summary: degradedGithub },
        { source: SOURCES.claude, summary: summary('https://status.claude.com') },
      ]),
    );
    expect(menu.split('\n').slice(1).join('\n')).toBe(
      [
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

  it('paints an outage red and lists a failed source as an unavailable row', () => {
    const outage = summary('https://www.githubstatus.com', {
      components: [{ name: 'Pages', status: 'major_outage', group: false }],
    });
    const failed = { source: SOURCES.claude, error: 'Claude status API responded 503' };

    const menu = buildMenu([{ source: SOURCES.github, summary: outage }, failed], options);
    expect(decodeTitle(menu)).toContain(`fill="#e5383b" d="${SOURCES.github.iconPath}"`);
    expect(menu.split('\n')).toContain('Claude  ⚪ Sin datos | href=https://status.claude.com');
    expect(menu.split('\n')).toContain('--Claude status API responded 503 | disabled=true');
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
