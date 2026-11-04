import type { ServiceResult } from '../src/blocks.ts';
import {
  effectiveIndicator,
  SEVERITY_ORDER,
  visibleComponents,
  type ComponentStatus,
  type Indicator,
} from '../src/statuspage.ts';

export interface MenuOptions {
  now: Date;
  timeZone: string;
}

export interface Transition {
  key: string;
  from: Indicator;
  to: Indicator;
  kind: 'worsened' | 'recovered';
}

const COMPONENT_DOT: Record<ComponentStatus, string> = {
  operational: '🟢',
  under_maintenance: '🔧',
  degraded_performance: '🟡',
  partial_outage: '🟠',
  major_outage: '🔴',
};

const ICON_COLOR: Record<Indicator | 'unknown', string> = {
  none: '#30a64a',
  minor: '#e5b300',
  major: '#ef7d00',
  critical: '#e5383b',
  unknown: '#8e8e93',
};
const ICON_SIZE = 18;
const ICON_GAP = 6;
const ICON_VIEWBOX = 24;

const severity = (indicator: Indicator) => SEVERITY_ORDER.indexOf(indicator);

function menuText(value: string): string {
  return value.replace(/\|/g, '/');
}

/**
 * Draws the menu bar icon as an SVG with one logo per service, colored by its effective state and
 * gray when its status page could not be fetched.
 */
export function buildTitleIcon(results: ServiceResult[]): string {
  const width = results.length * ICON_SIZE + (results.length - 1) * ICON_GAP;
  const scale = ICON_SIZE / ICON_VIEWBOX;
  const logos = results.map((result, index) => {
    const color = ICON_COLOR['summary' in result ? effectiveIndicator(result.summary) : 'unknown'];
    const x = index * (ICON_SIZE + ICON_GAP);
    return `<path transform="translate(${x} 0) scale(${scale})" fill="${color}" d="${result.source.iconPath}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ICON_SIZE}" viewBox="0 0 ${width} ${ICON_SIZE}">${logos.join('')}</svg>`;
}

function serviceRows(result: ServiceResult): string[] {
  if (!('summary' in result)) {
    const pageUrl = new URL(result.source.summaryUrl).origin;
    return [`${result.source.label}  ⚪ Sin datos | href=${pageUrl}`, `--${menuText(result.error)} | disabled=true`];
  }
  const { page, incidents } = result.summary;
  const components = visibleComponents(result.summary);
  const dots = components.map((component) => COMPONENT_DOT[component.status]).join('');
  return [
    `${result.source.label}  ${dots} | href=${page.url}`,
    ...components.map(
      (component) => `--${COMPONENT_DOT[component.status]} ${menuText(component.name)} | href=${page.url}`,
    ),
    ...(incidents.length > 0 ? ['-----'] : []),
    ...incidents.map((incident) => `--🚨 ${menuText(incident.name)} | href=${incident.shortlink}`),
  ];
}

function clock(options: MenuOptions): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: options.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(options.now);
}

/**
 * Builds the SwiftBar output: the logo icon as title, one row per service with a dot per
 * component that opens its status page, and a submenu with every component and active incident.
 */
export function buildMenu(results: ServiceResult[], options: MenuOptions): string {
  return [
    ` | image=${Buffer.from(buildTitleIcon(results)).toString('base64')}`,
    '---',
    ...results.flatMap(serviceRows),
    '---',
    `Actualizado ${clock(options)} | disabled=true`,
    'Refrescar ahora | refresh=true',
  ].join('\n');
}

/**
 * Compares the last stored indicator per service with the current one and reports services that
 * got worse or came back to fully operational. A service without a stored value counts as healthy.
 */
export function detectTransitions(
  previous: Record<string, Indicator>,
  current: Record<string, Indicator>,
): Transition[] {
  return Object.entries(current).flatMap(([key, to]): Transition[] => {
    const from = previous[key] ?? 'none';
    if (severity(to) > severity(from)) return [{ key, from, to, kind: 'worsened' }];
    if (to === 'none' && from !== 'none') return [{ key, from, to, kind: 'recovered' }];
    return [];
  });
}
