import type {LiveSummary} from '../app/live-signals';
export type SeoulFlowArea = 'myeongdong' | 'hongdae' | 'seongsu' | 'itaewon';
export interface SeoulFlowData {
 kind: string;
 notLive: true;
 district: string;
 generatedAt: string | null;
 station: null | {stationName: string | null; referenceDate: string | null; boardingCount: number | null; alightingCount: number | null; selectedStationCount: number | null; unit: 'people'; provider: string | null; retrievedAt: string | null; aggregation: 'DAILY'};
 foreignLivingPopulation: null | {value: number | null; unit: 'people_estimate'; referenceAt: string | null; provider: string | null; retrievedAt: string | null; aggregation: 'HOURLY_REFERENCE'};
 tourismPurposeMovement: null | {value: number | null; referenceDate: string | null; releaseMonth: string | null; originalUnit: null; unitVerified: false; provider: string | null; retrievedAt: string | null; aggregation: 'OFFICIAL_BATCH_FILE'};
}
export function fromSummary(summary: Pick<LiveSummary, 'areas' | 'generatedAt'> | null, area?: SeoulFlowArea, publication?: {releaseMonth?: string}): SeoulFlowData;
export function readExistingSummary(options?: {area?: SeoulFlowArea;date?:string;signal?:AbortSignal;endpoint?:string}): Promise<SeoulFlowData>;