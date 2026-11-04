import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from '../src/markdown';

const now = new Date('2026-10-06T19:00:00.000Z');
const options = { now, timeZone: 'America/Bogota' };
const fiveMinutesAgo = Math.floor(now.getTime() / 1000) - 5 * 60;

describe('blocksToMarkdown', () => {
  it('renders header, sections, fields, context, buttons and dividers as Slack markdown', () => {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: ':satellite_antenna:  Service Status', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: '*GitHub*   :large_green_circle: *Todo operativo*' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*GitHub*\n:large_green_circle: Todo operativo' },
          { type: 'mrkdwn', text: '*Claude*\n:large_yellow_circle: Problemas menores' },
        ],
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: ':white_check_mark: Git  ·  API' }] },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: ':globe_with_meridians: Status page' }, url: 'https://www.githubstatus.com' },
          { type: 'button', text: { type: 'plain_text', text: ':rotating_light: Ver incidente' }, url: 'https://stspg.io/abc' },
        ],
      },
      { type: 'divider' },
    ];
    expect(blocksToMarkdown(blocks, options)).toBe(
      [
        '### :satellite_antenna:  Service Status',
        '**GitHub**   :large_green_circle: **Todo operativo**',
        '**GitHub** — :large_green_circle: Todo operativo\n**Claude** — :large_yellow_circle: Problemas menores',
        '_:white_check_mark: Git  ·  API_',
        '[:globe_with_meridians: Status page](https://www.githubstatus.com)   [:rotating_light: Ver incidente](https://stspg.io/abc)',
        '───────────────',
      ].join('\n\n'),
    );
  });

  it('renders an incident as a bold link followed by its quoted update', () => {
    const blocks = [
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              { type: 'emoji', name: 'warning' },
              { type: 'link', url: 'https://stspg.io/abc', text: ' Incident with Actions', style: { bold: true } },
            ],
          },
          { type: 'rich_text_quote', elements: [{ type: 'text', text: 'Runners are delayed.' }] },
        ],
      },
    ];
    expect(blocksToMarkdown(blocks, options)).toBe(
      ':warning: **[Incident with Actions](https://stspg.io/abc)**\n> Runners are delayed.',
    );
  });

  it('turns Slack date tokens into relative or local times and mrkdwn links into markdown links', () => {
    const blocks = [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Actualizado <!date^${fiveMinutesAgo}^{ago}|fallback>  ·  <!date^${fiveMinutesAgo}^{date_short_pretty} {time}|fallback>  ·  <https://status.claude.com|Claude (api)>`,
          },
        ],
      },
    ];
    expect(blocksToMarkdown(blocks, options)).toBe(
      '_Actualizado hace 5 min  ·  06/10/2026 13:55  ·  [Claude (api)](https://status.claude.com)_',
    );
  });
});
