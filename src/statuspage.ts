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
  logoUrl: string;
  summaryUrl: string;
}

export const COMMAND = '/ss';

export const SOURCES: Record<string, StatusSource> = {
  github: {
    key: 'github',
    aliases: ['g'],
    label: 'GitHub',
    logoUrl: 'https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png',
    summaryUrl: 'https://www.githubstatus.com/api/v2/summary.json',
  },
  claude: {
    key: 'claude',
    aliases: ['c'],
    label: 'Claude',
    logoUrl: 'https://claude.ai/images/claude_app_icon.png',
    summaryUrl: 'https://status.claude.com/api/v2/summary.json',
  },
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
