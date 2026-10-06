import { COMMAND, SOURCES, type ComponentStatus, type StatuspageSummary, type StatusSource } from './statuspage.ts';

type Indicator = StatuspageSummary['status']['indicator'];

export type ServiceResult =
  | { source: StatusSource; summary: StatuspageSummary }
  | { source: StatusSource; error: string };

const MAX_FIELDS = 10;
const INCIDENT_EXCERPT_LENGTH = 280;
const SEVERITY_ORDER: Indicator[] = ['none', 'minor', 'major', 'critical'];

const OVERALL: Record<Indicator, { emoji: string; label: string }> = {
  none: { emoji: ':large_green_circle:', label: 'Todo operativo' },
  minor: { emoji: ':large_yellow_circle:', label: 'Problemas menores' },
  major: { emoji: ':large_orange_circle:', label: 'Problemas mayores' },
  critical: { emoji: ':red_circle:', label: 'Caída crítica' },
};

const COMPONENT: Record<ComponentStatus, { emoji: string; label: string; rank: number }> = {
  operational: { emoji: ':large_green_circle:', label: 'Operativo', rank: 0 },
  under_maintenance: { emoji: ':wrench:', label: 'Mantenimiento', rank: 1 },
  degraded_performance: { emoji: ':large_yellow_circle:', label: 'Rendimiento degradado', rank: 2 },
  partial_outage: { emoji: ':large_orange_circle:', label: 'Caída parcial', rank: 3 },
  major_outage: { emoji: ':red_circle:', label: 'Caída total', rank: 4 },
};

const IMPACT_EMOJI: Record<string, string> = {
  none: 'information_source',
  minor: 'warning',
  major: 'rotating_light',
  critical: 'fire',
};

function slackDate(iso: string, format: string): string {
  const date = new Date(iso);
  return `<!date^${Math.floor(date.getTime() / 1000)}^${format}|${date.toUTCString()}>`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function context(text: string): unknown {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function linkButton(text: string, url: string, style?: 'danger'): unknown {
  return {
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    url,
    ...(style ? { style } : {}),
  };
}

function affectedFields(components: StatuspageSummary['components']): unknown[] {
  const fields = components.map((component) => ({
    type: 'mrkdwn',
    text: `${COMPONENT[component.status].emoji} *${component.name}*\n_${COMPONENT[component.status].label}_`,
  }));
  if (fields.length <= MAX_FIELDS) return fields;
  const shown = fields.slice(0, MAX_FIELDS - 1);
  return [...shown, { type: 'mrkdwn', text: `_+${fields.length - shown.length} componentes afectados más_` }];
}

function incidentBlocks(incident: StatuspageSummary['incidents'][number]): unknown[] {
  const latest = incident.incident_updates[0];
  const headline = {
    type: 'rich_text_section',
    elements: [
      { type: 'emoji', name: IMPACT_EMOJI[incident.impact] ?? 'warning' },
      { type: 'link', url: incident.shortlink, text: ` ${incident.name}`, style: { bold: true } },
    ],
  };
  const quote = latest
    ? [{ type: 'rich_text_quote', elements: [{ type: 'text', text: truncate(latest.body, INCIDENT_EXCERPT_LENGTH) }] }]
    : [];
  const when = latest ? `  ·  ${slackDate(latest.created_at, '{ago}')}` : '';
  return [
    { type: 'rich_text', elements: [headline, ...quote] },
    context(`Impacto *${incident.impact}*  ·  Estado *${incident.status.replace(/_/g, ' ')}*${when}`),
  ];
}

/**
 * Builds the Block Kit card for one service: overall state with logo, affected components
 * worst first, a compact line of healthy components, incidents and link buttons.
 */
export function buildServiceBlocks(source: StatusSource, summary: StatuspageSummary): unknown[] {
  const overall = OVERALL[summary.status.indicator];
  const components = summary.components.filter(
    (component) => !component.group && !component.name.startsWith('Visit '),
  );
  const healthy = components.filter((component) => component.status === 'operational');
  const affected = components
    .filter((component) => component.status !== 'operational')
    .sort((a, b) => COMPONENT[b.status].rank - COMPONENT[a.status].rank);

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${source.label}*   ${overall.emoji} *${overall.label}*\n${summary.status.description}  ·  *${healthy.length}/${components.length}* componentes operativos`,
      },
      accessory: { type: 'image', image_url: source.logoUrl, alt_text: source.label },
    },
  ];
  if (affected.length > 0) blocks.push({ type: 'section', fields: affectedFields(affected) });
  if (healthy.length > 0) {
    blocks.push(context(`:white_check_mark: ${healthy.map((component) => component.name).join('  ·  ')}`));
  }
  blocks.push(...summary.incidents.flatMap(incidentBlocks));
  blocks.push(
    {
      type: 'actions',
      elements: [
        linkButton(':globe_with_meridians: Status page', summary.page.url),
        ...summary.incidents
          .slice(0, 4)
          .map((incident) => linkButton(':rotating_light: Ver incidente', incident.shortlink, 'danger')),
      ],
    },
    context(`:clock3: Actualizado ${slackDate(summary.page.updated_at, '{ago}')}`),
    { type: 'divider' },
  );
  return blocks;
}

function footerHint(): string {
  const shortcuts = Object.values(SOURCES).map(
    (source) => `\`${COMMAND} ${source.aliases[0] ?? source.key}\` ${source.label}`,
  );
  return `:bulb: ${[...shortcuts, `\`${COMMAND} help\``, '`--public` para compartir'].join('  ·  ')}`;
}

function headline(results: ServiceResult[]): string {
  const worst = results.reduce<Indicator>((current, result) => {
    if (!('summary' in result)) return current;
    const indicator = result.summary.status.indicator;
    return SEVERITY_ORDER.indexOf(indicator) > SEVERITY_ORDER.indexOf(current) ? indicator : current;
  }, 'none');
  if (worst !== 'none') return `${OVERALL[worst].emoji} Hay servicios con problemas`;
  if (results.some((result) => 'error' in result)) return ':warning: No pude consultar todos los servicios';
  return ':sparkles: Todo en orden, a programar tranquilo';
}

/**
 * Builds the full /ss reply: header, headline with the query time, a side-by-side summary
 * when several services are shown, one card per service and a footer with the commands.
 */
export function buildMessageBlocks(results: ServiceResult[], now: Date): unknown[] {
  const summaryRow =
    results.length > 1
      ? [
          {
            type: 'section',
            fields: results.map((result) => ({
              type: 'mrkdwn',
              text:
                'summary' in result
                  ? `*${result.source.label}*\n${OVERALL[result.summary.status.indicator].emoji} ${OVERALL[result.summary.status.indicator].label}`
                  : `*${result.source.label}*\n:warning: Sin datos`,
            })),
          },
          { type: 'divider' },
        ]
      : [];

  return [
    { type: 'header', text: { type: 'plain_text', text: ':satellite_antenna:  Service Status', emoji: true } },
    context(`${headline(results)}  ·  ${slackDate(now.toISOString(), '{date_short_pretty} {time}')}`),
    ...summaryRow,
    ...results.flatMap((result) =>
      'summary' in result
        ? buildServiceBlocks(result.source, result.summary)
        : [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `:warning: No pude consultar *${result.source.label}*: ${result.error}` },
            },
            { type: 'divider' },
          ],
    ),
    context(footerHint()),
  ];
}
