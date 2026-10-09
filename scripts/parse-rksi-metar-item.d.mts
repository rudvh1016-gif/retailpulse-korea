export interface RksiMeasurement {
  value: number;
  unit: string;
  path: string;
  qualifier?: 'ABOVE' | 'BELOW';
}
export interface RksiObservation {
  station: 'RKSI';
  reportType: 'METAR' | 'SPECI';
  observedAt: string;
  measurements: Record<string, RksiMeasurement>;
  measurementScope: 'GROUND_OBSERVATION';
  turbulenceRisk: 'NOT_INFERRED';
}
export function inspectRksiMetarItem(item: unknown, index?: number): {
  observation?: RksiObservation;
  observationLayout?: string;
  reason?: string;
};
