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

const severity = (indicator: Indicator) => SEVERITY_ORDER.indexOf(indicator);

function menuText(value: string): string {
  return value.replace(/\|/g, '/');
}

function title(results: ServiceResult[]): string {
  const affected = results.flatMap((result) =>
    'summary' in result && effectiveIndicator(result.summary) !== 'none'
      ? [{ label: result.source.label, indicator: effectiveIndicator(result.summary) }]
      : [],
  );
  if (affected.length === 0) return results.some((result) => 'error' in result) ? '⚪' : '🟢';
  const worst = Math.max(...affected.map((item) => severity(item.indicator)));
  const color = worst >= severity('major') ? '🔴' : '🟡';
  return `${color} ${affected.map((item) => item.label).join(' · ')}`;
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
 * Builds the SwiftBar output: a title colored by the worst effective state (yellow for minor,
 * red for major or critical, gray when a source failed and nothing else is wrong), one row per
 * service with a dot per component that opens its status page, and a submenu with every
 * component and active incident.
 */
export function buildMenu(results: ServiceResult[], options: MenuOptions): string {
  return [
    title(results),
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
