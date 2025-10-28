import type { Competition, Competitor, SportEventBasic, CacheData } from './types.js';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isCompetition(x: unknown): x is Competition {
  return isObject(x) && typeof x['id'] === 'string' && typeof x['name'] === 'string';
}

export function isCompetitionArray(x: unknown): x is Competition[] {
  return Array.isArray(x) && x.every(isCompetition);
}

export function isCompetitor(x: unknown): x is Competitor {
  return isObject(x) && (typeof x['id'] === 'string' || typeof x['urn'] === 'string' || typeof x['uid'] === 'string') && typeof (x as any)['name'] === 'string';
}

export function isCompetitorArray(x: unknown): x is Competitor[] {
  return Array.isArray(x) && x.every(isCompetitor);
}

export function isSportEventBasic(x: unknown): x is SportEventBasic {
  if (!isObject(x)) return false;
  const hasId = typeof x['id'] === 'string' || typeof x['sport_event_id'] === 'string' || (isObject(x['sport_event']) && typeof (x['sport_event'] as any).id === 'string');
  if (!hasId) return false;
  if (x['competitors'] !== undefined) {
    if (!isCompetitorArray(x['competitors'])) return false;
  }
  return true;
}

export function isSportEventBasicArray(x: unknown): x is SportEventBasic[] {
  return Array.isArray(x) && x.every(isSportEventBasic);
}

export function isCacheData(x: unknown): x is CacheData {
  if (!isObject(x)) return false;
  if (typeof x['lastUpdate'] !== 'number') return false;
  if (!isCompetitionArray(x['leagues'])) return false;
  if (!isObject(x['teams'])) return false;
  const teams = x['teams'] as Record<string, unknown>;
  for (const k of Object.keys(teams)) {
    if (!isCompetitorArray(teams[k])) return false;
  }
  if (!isCompetitionArray(x['rawCompetitions'])) return false;
  return true;
}

export {};
