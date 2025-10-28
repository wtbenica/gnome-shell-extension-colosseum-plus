import { z } from "zod";

// Basic competitor (team) schema
export const competitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  common_name: z.string().optional(),
  original_name: z.string().optional(),
  qualifier: z.string().optional(),
  urn: z.string().optional(),
  _id: z.string().optional(),
  uid: z.string().optional(),
});

// Competition schema (minimal fields used by the extension)
export const competitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  _placeholder: z.boolean().optional(),
});

export const competitionsResponseSchema = z.object({
  competitions: z.array(competitionSchema).optional(),
});

export const seasonSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const seasonsResponseSchema = z.object({
  seasons: z.array(seasonSchema).optional(),
});

export const competitorsResponseSchema = z.object({
  season_competitors: z.array(competitorSchema).optional(),
});

// A compact sport event schema for schedules that covers the fields DataLoader needs
export const sportEventBasicSchema = z.object({
  id: z.string().optional(),
  sport_event_id: z.string().optional(),
  scheduled: z.string().optional(),
  start_time: z.string().optional(),
  start: z.string().optional(),
  competitors: z.array(competitorSchema).optional(),
  // allow wrapper objects where the event may be under `sport_event`
  sport_event: z.any().optional(),
});

export const schedulesResponseSchema = z.object({
  schedules: z.array(sportEventBasicSchema).optional(),
});

// Export inferred TS types for convenience
export type Competition = z.infer<typeof competitionSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type CompetitionsResponse = z.infer<typeof competitionsResponseSchema>;
export type SeasonsResponse = z.infer<typeof seasonsResponseSchema>;
export type CompetitorsResponse = z.infer<typeof competitorsResponseSchema>;
export type SchedulesResponse = z.infer<typeof schedulesResponseSchema>;

// Export inferred sport event basic type
export type SportEventBasic = z.infer<typeof sportEventBasicSchema>;

// Cache data schema used by the local CacheManager
export const cacheDataSchema = z.object({
  lastUpdate: z.number(),
  leagues: z.array(competitionSchema),
  teams: z.record(z.string(), z.array(competitorSchema)),
  rawCompetitions: z.array(competitionSchema),
});

export type CacheData = z.infer<typeof cacheDataSchema>;
