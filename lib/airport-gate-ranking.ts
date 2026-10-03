import type { DepartureMap, MapFlight, MapBuilding } from './airport-departure-map';

export interface RankedGate { key: string; gate: string; building: MapBuilding; side: MapFlight['side']; flights: number }

/** Full API rows after the existing physical-flight collapse; never the summary's top-five slice. */
export function rankMapGates(maps: readonly DepartureMap[]): RankedGate[] {
  const entries = new Map<string, RankedGate>();
  for (const map of maps) {
    for (const gate of map.gates) {
      const key = `${gate.building}:${gate.gate}`;
      entries.set(key, { key, gate: gate.gate, building: gate.building, side: gate.side, flights: 0 });
    }
    for (const flight of map.flights) {
      if (!flight.gate) continue;
      const key = `${flight.building}:${flight.gate}`;
      const item = entries.get(key) ?? { key, gate: flight.gate, building: flight.building as MapBuilding, side: flight.side, flights: 0 };
      item.flights++;
      entries.set(key, item);
    }
  }
  return [...entries.values()].sort((a, b) => b.flights - a.flights || a.building.localeCompare(b.building) || a.gate.localeCompare(b.gate, 'en', { numeric: true }));
}

export function leadingGates(gates: readonly RankedGate[]): RankedGate[] {
  const max = Math.max(0, ...gates.map(gate => gate.flights));
  return max === 0 ? [] : gates.filter(gate => gate.flights === max);
}
