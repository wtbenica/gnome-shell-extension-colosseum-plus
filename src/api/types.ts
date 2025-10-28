// Plain TypeScript type definitions for Sportradar entities (used at compile-time)

export interface Competitor {
  id?: string;
  name?: string;
  common_name?: string;
  original_name?: string;
  qualifier?: string;
  urn?: string;
  _id?: string;
  uid?: string;
}

export interface Competition {
  id: string;
  name: string;
  category?: string;
  _placeholder?: boolean;
}

export interface SportEventBasic {
  id?: string;
  sport_event_id?: string;
  scheduled?: string;
  start_time?: string;
  start?: string;
  competitors?: Competitor[];
  sport_event?: Record<string, unknown> | null;
}

export interface CacheData {
  lastUpdate: number;
  leagues: Competition[];
  teams: Record<string, Competitor[]>;
  rawCompetitions: Competition[];
}

export type SeasonsResponse = Array<{ id: string; start_date?: string }>;

export {};
