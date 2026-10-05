export type ComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'under_maintenance';

export interface StatuspageSummary {
  page: { name: string; url: string; updated_at: string };
  status: { indicator: 'none' | 'minor' | 'major' | 'critical'; description: string };
  components: Array<{ name: string; status: ComponentStatus; group: boolean }>;
  incidents: Array<{
    name: string;
    status: string;
    impact: string;
    shortlink: string;
    incident_updates: Array<{ body: string; created_at: string }>;
  }>;
}

export interface StatusSource {
  key: string;
  aliases: string[];
  label: string;
  summaryUrl: string;
}

const COMMAND = '/ss';

export const SOURCES: Record<string, StatusSource> = {
  github: {
    key: 'github',
    aliases: ['g'],
    label: 'GitHub',
    summaryUrl: 'https://www.githubstatus.com/api/v2/summary.json',
  },
  claude: {
    key: 'claude',
    aliases: ['c'],
    label: 'Claude',
    summaryUrl: 'https://status.claude.com/api/v2/summary.json',
  },
};

const INDICATOR_EMOJI: Record<string, string> = {
  none: ':large_green_circle:',
  minor: ':large_yellow_circle:',
  major: ':large_orange_circle:',
  critical: ':red_circle:',
};

const COMPONENT_EMOJI: Record<ComponentStatus, string> = {
  operational: ':large_green_circle:',
  degraded_performance: ':large_yellow_circle:',
  partial_outage: ':large_orange_circle:',
  major_outage: ':red_circle:',
  under_maintenance: ':wrench:',
};

function findSource(word: string): StatusSource | undefined {
  return Object.values(SOURCES).find((source) => source.key === word || source.aliases.includes(word));
}

/**
 * Resolves the slash-command text into the list of sources to query, matching keys or aliases.
 * Empty text or "all" returns every known source; repeated sources appear once.
 */
export function resolveSources(text: string): StatusSource[] {
  const wanted = text.trim().toLowerCase();
  if (wanted === '' || wanted === 'all') return Object.values(SOURCES);
  const matches = wanted
    .split(/\s+/)
    .map(findSource)
    .filter((source): source is StatusSource => Boolean(source));
  return [...new Set(matches)];
}

/**
 * Builds the mrkdwn help message listing every command form derived from SOURCES.
 */
export function buildHelpText(): string {
  const sources = Object.values(SOURCES);
  const sourceLines = sources.map((source) => {
    const forms = [...source.aliases, source.key].map((word) => `\`${COMMAND} ${word}\``).join(' o ');
    return `${forms} · Solo ${source.label}`;
  });
  return [
    `*Comandos de ${COMMAND}*`,
    `\`${COMMAND}\` · ${sources.map((source) => source.label).join(' y ')}`,
    ...sourceLines,
    `\`${COMMAND} help\` · Esta ayuda`,
    `Agrega \`--public\` para publicar la respuesta en el canal, ej. \`${COMMAND} g --public\``,
  ].join('\n');
}

/**
 * Fetches the Statuspage v2 summary for a source.
 */
export async function fetchSummary(source: StatusSource): Promise<StatuspageSummary> {
  const response = await fetch(source.summaryUrl, {
    headers: { accept: 'application/json', 'user-agent': 'slack-status-bot' },
  });
  if (!response.ok) {
    throw new Error(`${source.label} status API responded ${response.status}`);
  }
  return response.json();
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Builds the Slack Block Kit blocks that describe one source's summary.
 */
export function buildBlocks(source: StatusSource, summary: StatuspageSummary): unknown[] {
  const overallEmoji = INDICATOR_EMOJI[summary.status.indicator] ?? ':white_circle:';
  const components = summary.components.filter(
    (component) => !component.group && !component.name.startsWith('Visit '),
  );
  const componentLines = components
    .map((component) => {
      const emoji = COMPONENT_EMOJI[component.status] ?? ':white_circle:';
      const suffix =
        component.status === 'operational' ? '' : ` _(${humanize(component.status)})_`;
      return `${emoji} ${component.name}${suffix}`;
    })
    .join('\n');

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${source.label} status` } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${overallEmoji} *${summary.status.description}*\n<${summary.page.url}|Ver página de status>`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: componentLines } },
  ];

  for (const incident of summary.incidents) {
    const latest = incident.incident_updates[0];
    const detail = latest ? `\n> ${truncate(latest.body, 280)}` : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rotating_light: *<${incident.shortlink}|${incident.name}>*\nImpacto: *${incident.impact}* · Estado: *${humanize(incident.status)}*${detail}`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Actualizado ${new Date(summary.page.updated_at).toUTCString()}`,
      },
    ],
  });
  blocks.push({ type: 'divider' });
  return blocks;
}
