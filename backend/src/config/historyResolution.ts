export type Resolution = "daily" | "3day" | "weekly" | "monthly";

interface ResolutionTier {
  maxDays: number;
  resolution: Resolution;
}

const RESOLUTION_TIERS: ResolutionTier[] = [
  { maxDays: 90, resolution: "daily" },
  { maxDays: 180, resolution: "3day" },
  { maxDays: 365, resolution: "weekly" },
  { maxDays: Infinity, resolution: "monthly" },
];

/**
 * Determine the price aggregation resolution from a date range.
 * Shorter ranges get finer granularity; longer ranges are aggregated.
 */
export function getResolution(from: string, to: string): Resolution {
  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T00:00:00Z");
  const diffDays = Math.round(
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  for (const tier of RESOLUTION_TIERS) {
    if (diffDays <= tier.maxDays) return tier.resolution;
  }
  return "monthly";
}
