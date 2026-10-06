import { describe, expect, it } from 'vitest';
import { buildHelpText, resolveSources, SOURCES } from '../src/statuspage';

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
