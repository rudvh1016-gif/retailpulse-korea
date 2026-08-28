export type AirportPressureBasis = "actual" | "scheduled";
export type AirportPressureConfidence = "high" | "medium" | "low";
export type AirportPressureLevel = "low" | "normal" | "high";

export interface NormalizedAirportFlight {
  /** Canonical operating-aircraft identity, resolved by the collector from verified provider fields. */
  physicalFlightId: string;
  marketingFlightCode?: string;
  direction: "departure" | "arrival";
  basis: AirportPressureBasis;
  terminal: "T1" | "T2";
  gate?: string | null;
  gateObservedAt?: string | null;
  scheduledAt: string;
  changedAt?: string | null;
  status: "scheduled" | "onTime" | "delayed" | "cancelled";
}

export interface AuthoritativeGateZone {
  terminal: "T1" | "T2";
  id: string;
  label: string;
  gates: string[];
  authority: string;
}

export interface AirportPressureRow {
  terminal: "T1" | "T2";
  startAt: string;
  endAt: string;
  basis: AirportPressureBasis;
  level: AirportPressureLevel;
  uniqueFlightCount: number;
  delayedFlightCount: number;
  confidence: AirportPressureConfidence;
  where: { kind: "exactGate" | "gateZone" | "terminal"; label: string };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const fraction = position - low;
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * fraction;
}

function levelFor(count: number, distribution: number[]): AirportPressureLevel {
  if (distribution.length < 2 || distribution.every((value) => value === distribution[0])) return "normal";
  if (count <= quantile(distribution, 1 / 3)) return "low";
  if (count >= quantile(distribution, 2 / 3)) return "high";
  return "normal";
}

function validDate(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`Invalid airport timestamp: ${value}`);
  return parsed;
}

export function buildAirportPressure(
  flights: NormalizedAirportFlight[],
  options: { now: string; bucketMinutes?: 60; gateFreshnessMinutes?: number; gateZones?: AuthoritativeGateZone[] },
): AirportPressureRow[] {
  const now = validDate(options.now);
  const gateFreshnessMs = (options.gateFreshnessMinutes ?? 180) * 60_000;
  const bucketMs = (options.bucketMinutes ?? 60) * 60_000;
  const canonical = new Map<string, NormalizedAirportFlight>();

  for (const flight of flights) {
    if (flight.direction !== "departure" || flight.status === "cancelled") continue;
    validDate(flight.changedAt ?? flight.scheduledAt);
    const serviceDate = (flight.changedAt ?? flight.scheduledAt).slice(0, 10);
    const key = `${flight.physicalFlightId}|${serviceDate}`;
    const previous = canonical.get(key);
    if (!previous || validDate(flight.gateObservedAt ?? flight.changedAt ?? flight.scheduledAt) > validDate(previous.gateObservedAt ?? previous.changedAt ?? previous.scheduledAt)) {
      canonical.set(key, flight);
    }
  }

  const groups = new Map<string, NormalizedAirportFlight[]>();
  for (const flight of canonical.values()) {
    const at = validDate(flight.changedAt ?? flight.scheduledAt);
    const bucketStart = Math.floor(at / bucketMs) * bucketMs;
    const key = `${flight.terminal}|${flight.basis}|${bucketStart}`;
    groups.set(key, [...(groups.get(key) ?? []), flight]);
  }

  const drafts = [...groups.values()].map((group) => {
    const sample = group[0];
    const start = Math.floor(validDate(sample.changedAt ?? sample.scheduledAt) / bucketMs) * bucketMs;
    const reliableGates = sample.basis === "actual" ? group.map((flight) => {
      if (!flight.gate || !flight.gateObservedAt) return null;
      const observed = validDate(flight.gateObservedAt);
      return now - observed >= 0 && now - observed <= gateFreshnessMs ? flight.gate : null;
    }) : group.map(() => null);
    let where: AirportPressureRow["where"] = { kind: "terminal", label: sample.terminal };
    let confidence: AirportPressureConfidence = "low";
    if (reliableGates.every(Boolean)) {
      const uniqueGates = [...new Set(reliableGates as string[])];
      if (uniqueGates.length === 1) {
        where = { kind: "exactGate", label: uniqueGates[0] };
        confidence = "high";
      } else {
        const zone = (options.gateZones ?? []).find((candidate) => candidate.terminal === sample.terminal && uniqueGates.every((gate) => candidate.gates.includes(gate)));
        if (zone) {
          where = { kind: "gateZone", label: zone.label };
          confidence = "medium";
        }
      }
    }
    return {
      terminal: sample.terminal,
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + bucketMs).toISOString(),
      basis: sample.basis,
      uniqueFlightCount: group.length,
      delayedFlightCount: group.filter((flight) => flight.status === "delayed").length,
      confidence,
      where,
    };
  });
  const distribution = drafts.map((row) => row.uniqueFlightCount);
  return drafts.map((row) => ({ ...row, level: levelFor(row.uniqueFlightCount, distribution) })).sort((a, b) => a.startAt.localeCompare(b.startAt));
}
