import { describe, expect, it } from 'vitest';
import { buildMessageBlocks, buildServiceBlocks } from '../src/blocks';
import { SOURCES, type StatuspageSummary } from '../src/statuspage';

interface Block {
  type: string;
  text?: { text: string };
  fields?: Array<{ text: string }>;
  elements?: Array<Record<string, unknown>>;
  accessory?: { image_url: string };
}

const healthy: StatuspageSummary = {
  page: { name: 'GitHub', url: 'https://www.githubstatus.com', updated_at: '2026-10-06T18:50:00.000Z' },
  status: { indicator: 'none', description: 'All Systems Operational' },
  components: [
    { name: 'Git Operations', status: 'operational', group: false },
    { name: 'Visit www.githubstatus.com for more information', status: 'operational', group: false },
    { name: 'API Requests', status: 'operational', group: false },
    { name: 'Some group', status: 'operational', group: true },
  ],
  incidents: [],
};

const outage: StatuspageSummary = {
  ...healthy,
  status: { indicator: 'major', description: 'Partial System Outage' },
  components: [
    { name: 'Git Operations', status: 'operational', group: false },
    { name: 'Actions', status: 'degraded_performance', group: false },
    { name: 'Pages', status: 'major_outage', group: false },
  ],
  incidents: [
    {
      name: 'Incident with Actions',
      status: 'investigating',
      impact: 'major',
      shortlink: 'https://stspg.io/abc',
      incident_updates: [{ body: 'Runners are delayed.', created_at: '2026-10-06T18:48:00.000Z' }],
    },
  ],
};

const now = new Date('2026-10-06T19:00:00.000Z');

describe('buildServiceBlocks', () => {
  it('renders a compact healthy card with logo, operational count and a status page button', () => {
    const blocks = buildServiceBlocks(SOURCES.github, healthy) as Block[];
    expect(blocks[0]?.text?.text).toContain('*GitHub*');
    expect(blocks[0]?.text?.text).toContain('*2/2* componentes operativos');
    expect(blocks[0]?.accessory?.image_url).toBe(SOURCES.github.logoUrl);
    expect(blocks.some((block) => block.fields)).toBe(false);
    expect(blocks.find((block) => block.type === 'context')?.elements?.[0]?.text).toBe(
      ':white_check_mark: Git Operations  ·  API Requests',
    );
    expect(blocks.find((block) => block.type === 'actions')?.elements).toEqual([
      expect.objectContaining({ url: 'https://www.githubstatus.com' }),
    ]);
  });

  it('lists affected components worst first and adds each incident with its own button', () => {
    const blocks = buildServiceBlocks(SOURCES.github, outage) as Block[];
    expect(blocks.find((block) => block.fields)?.fields?.map((field) => field.text)).toEqual([
      ':red_circle: *Pages*\n_Caída total_',
      ':large_yellow_circle: *Actions*\n_Rendimiento degradado_',
    ]);
    expect(JSON.stringify(blocks)).toContain('Runners are delayed.');
    expect(blocks.find((block) => block.type === 'actions')?.elements?.[1]).toMatchObject({
      style: 'danger',
      url: 'https://stspg.io/abc',
    });
  });

  it('caps the affected grid at ten fields and summarises the rest', () => {
    const components = Array.from({ length: 12 }, (_, index) => ({
      name: `Component ${index}`,
      status: 'major_outage' as const,
      group: false,
    }));
    const blocks = buildServiceBlocks(SOURCES.github, { ...outage, components }) as Block[];
    const fields = blocks.find((block) => block.fields)?.fields;
    expect(fields).toHaveLength(10);
    expect(fields?.at(-1)?.text).toBe('_+3 componentes afectados más_');
  });
});

describe('buildMessageBlocks', () => {
  it('opens with a header, an all-clear headline and a side-by-side summary', () => {
    const blocks = buildMessageBlocks(
      [
        { source: SOURCES.github, summary: healthy },
        { source: SOURCES.claude, summary: healthy },
      ],
      now,
    ) as Block[];
    expect(blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: ':satellite_antenna:  Service Status', emoji: true },
    });
    expect(blocks[1]?.elements?.[0]?.text).toContain('Todo en orden');
    expect(blocks[2]?.fields?.map((field) => field.text)).toEqual([
      '*GitHub*\n:large_green_circle: Todo operativo',
      '*Claude*\n:large_green_circle: Todo operativo',
    ]);
  });

  it('flags a failed source in the summary and still renders the others', () => {
    const blocks = buildMessageBlocks(
      [
        { source: SOURCES.github, error: 'GitHub status API responded 503' },
        { source: SOURCES.claude, summary: outage },
      ],
      now,
    ) as Block[];
    expect(blocks[1]?.elements?.[0]?.text).toContain('Hay servicios con problemas');
    expect(blocks[2]?.fields?.[0]?.text).toBe('*GitHub*\n:warning: Sin datos');
    expect(JSON.stringify(blocks)).toContain('No pude consultar *GitHub*');
    expect(JSON.stringify(blocks)).toContain('Incident with Actions');
  });

  it('skips the summary row when only one service was requested', () => {
    const blocks = buildMessageBlocks([{ source: SOURCES.claude, summary: healthy }], now) as Block[];
    expect(blocks.some((block) => block.type === 'section' && block.fields)).toBe(false);
  });
});
