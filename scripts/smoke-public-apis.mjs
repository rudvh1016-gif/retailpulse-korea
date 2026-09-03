import {
  buildDataGoKrUrl,
  requestDataGoKrOnce,
  runDataGoKrSmoke,
} from "../lib/data-go-kr.mjs";

/**
 * Read-only authentication and response-shape smoke for the six approved
 * data.go.kr sources. Each source is requested exactly once, nothing is
 * persisted, and no URL or credential representation is printed.
 */

const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim() ?? "";

function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

export const sources = [
  {
    sourceId: "A1_flight_detail",
    endpoint: "https://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    sourceId: "A2_duty_free_actual",
    endpoint: "https://apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    sourceId: "A3_duty_free_schedule",
    endpoint: "https://apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    sourceId: "A4_departure_congestion",
    endpoint: "https://apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "3", type: "json", terminalId: "P01" },
  },
  {
    sourceId: "W1_kma_vilage_fcst",
    endpoint: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "12", dataType: "JSON", base_date: kstDate(-1), base_time: "2300", nx: "60", ny: "127" },
  },
  {
    // Airport Retail A2 — 인천국제공항공사_여객터미널 시설정보 현황 (data.go.kr 15095064).
    // The official operation name really is spelled "getFacilitesInfo".
    // Bounded contract probe only: five Korean rows, nothing persisted.
    sourceId: "A2_facility_directory",
    endpoint: "https://apis.data.go.kr/B551177/FacilitiesInformation/getFacilitesInfo",
    successCode: "00",
    params: { pageNo: "1", numOfRows: "5", type: "json", lang: "K" },
  },
  {
    sourceId: "T1_tourapi_festival",
    endpoint: "https://apis.data.go.kr/B551011/KorService2/searchFestival2",
    successCode: "0000",
    params: { pageNo: "1", numOfRows: "2", MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", eventStartDate: kstDate() },
  },
];

const results = [];
if (!serviceKey) {
  for (const source of sources) {
    results.push({ sourceId: source.sourceId, authStatus: "AUTH_BLOCKED", reason: "DATA_GO_KR_SERVICE_KEY missing" });
  }
} else {
  results.push(...await runDataGoKrSmoke(sources, (source) => requestDataGoKrOnce({
    url: buildDataGoKrUrl(source.endpoint, serviceKey, source.params),
    expectedSuccessCode: source.successCode,
    serviceKey,
    timeoutMs: 30_000,
  })));
}

for (const result of results) console.log(JSON.stringify(result));
console.log(JSON.stringify({
  summary: true,
  credentialConfigured: Boolean(serviceKey),
  requestCount: serviceKey ? sources.length : 0,
  sources: results.map(({ sourceId, authStatus }) => ({ sourceId, authStatus })),
}));
