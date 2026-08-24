# RetailPulse Seoul — 출국장·게이트·면세구역 데이터 감사

기준일: 2026-08-23 KST  
최종 결론: **출국장 대기·항공편별 게이트·체크인·운항상태·면세시설 위치는 공식 데이터로 연결 가능하다. 면세점별 실제 방문객·매출·실시간 혼잡도는 공개 데이터에서 확인되지 않았다.**

## 1. 실제로 받을 수 있는 공식 데이터

| 공식 Source | 받을 수 있는 값 | 범위·주기 | 접근 | RetailPulse 판정 |
|---|---|---|---|---|
| [인천공항 출국장 혼잡도 조회](https://www.data.go.kr/data/15148225/openapi.do) | 출국장 1~6번, 동·서측, 발생시각, 대기인원, 터미널 | 현재 또는 직전 1분, **T1만 제공**. T2는 추후 제공 예정 | 무료, 개발 1,000회/일, 운영심의. data.go.kr 프로젝트키 | `KEY_REQUIRED · P0` |
| [인천공항 항공편 운항 상세](https://www.data.go.kr/data/15140153/openapi.do) | 편명, 항공사, 예정·변경시각, 목적지/출발지, 터미널, 게이트, 체크인카운터, 출구, 운항상태, 기종 등 | D-3~D+6, 준실시간 | 무료, 개발 500회/일, 운영심의. 같은 data.go.kr 프로젝트키 | `KEY_REQUIRED · P0` |
| [인천공항 입국장 현황](https://www.data.go.kr/data/15095061/openapi.do) | T1/T2 입국장, 항공편, 항공기 게이트, 내·외국인 대기인원 등 원문 필드 | H-2~H+2 | 무료, 개발 500회/일, 운영심의. 같은 data.go.kr 프로젝트키 | `KEY_REQUIRED · P0` |
| [인천공항 예상 혼잡도](https://www.airport.kr/ap_ko/883/subview.do) | 날짜·터미널·시간대별 출국장/입국장/환승 여객예고 | 출국 D+2, 입국·환승 D+1, 매일 17:00 갱신 안내 | 공식 Web·Excel 확인, 자동화 API 계약 미확인 | `AUTOMATION_REVIEW · P0` |
| [인천공항 출발 항공편](https://www.airport.kr/ap_en/1396/subview.do) | 시간, 목적지, 항공사·편명, 터미널, 체크인, 게이트, 운항상태 | 당일 운항, Excel 제공 | 공식 공개화면/상세 API 우선 | `KEY_REQUIRED · P0` |
| [인천공항 면세점 안내](https://www.airport.kr/ap_ko/1003/subview.do) | 터미널/탑승동, 매장·운영사·품목, 영업시간, 전화, 게이트 인접 위치 | 시설 변경 시 | 공식 공개 Directory, Runtime API 별도 확인 | `CONDITION_REVIEW · P1` |

## 2. 무엇을 알 수 있나

### 공식값 그대로 말할 수 있는 것

- 현재 T1 출국장 1~6번의 동·서측 대기인원과 기준시각.
- 항공편별 현재 게이트, 터미널, 체크인카운터, 예정/변경시각, 지연·결항 상태.
- 날짜·시간대별 출국예상 흐름과 T1/T2 구분이 Source에서 제공되는 범위.
- 공식 Directory에 등록된 면세점의 운영사·영업시간·게이트 인접 위치.

### 계산해서 제공할 수 있는 것

- `NEXT 1H / 3H / 6H / TODAY` 게이트 구역별 **출발편 집중도**.
- T1 출국장별 현재 대기인원 순위와 공식 예상 혼잡시간.
- 취소편을 제외한 게이트 구역별 운항편 수, 지연편 수, 목적지 지역 구성.
- 영업 중인 면세시설 위치와 게이트 구역별 출발편 집중도를 결합한 **GATE RETAIL FLOW SIGNAL**.
- 같은 요일·시간대 Archive가 쌓인 뒤 평소보다 높은지/낮은지 비교.

계산 결과는 반드시 `구역 흐름 신호`, `출발편 집중도`, `출국장 대기`처럼 표시한다. `면세점 방문객`, `매장 매출`, `실제 구매자 수`라고 바꾸어 말하지 않는다.

## 3. 공개 데이터만으로 알 수 없는 것

- 특정 면세점에 실제로 몇 명이 들어갔는지.
- 특정 매장의 시간대별 매출·전환율·체류시간.
- 각 항공편의 실제 탑승객 수나 승객 국적.
- 게이트 앞 대기인원이 어느 면세점을 방문했는지.
- T2 출국장 1분 단위 대기인원. 공식 API 설명상 아직 제공 예정이다.

매장 단위 정확도를 만들려면 운영사 POS, 매장 출입계수기, 공항/사업자 유동센서 등 별도 1st-party 데이터와 적법한 계약이 필요하다. Wi-Fi·Bluetooth·카메라로 개인을 추적하는 방식은 Privacy·보안·노무·시설 승인 검토 없이 도입하지 않는다.

## 4. 제품 계산 계약

```ts
type DepartureCheckpointObservation = {
  observedAtKst: string;
  terminal: "T1";
  checkpoint: "1" | "2" | "3" | "4" | "5" | "6";
  side: "EAST" | "WEST" | null;
  waitingPeople: number;
  recordOrigin: "LIVE_OBSERVED";
  sourceUpdatedAt: string;
};

type GateAssignment = {
  flightId: string;
  scheduledAtKst: string;
  estimatedAtKst: string | null;
  direction: "DEPARTURE" | "ARRIVAL";
  terminal: "T1" | "T2" | null;
  gate: string | null;
  checkinCounter: string | null;
  status: "ON_TIME" | "DELAYED" | "CANCELLED" | "OTHER";
  sourceUpdatedAt: string;
};

type RetailFacility = {
  facilityId: string;
  terminal: "T1" | "T2" | "CONCOURSE";
  operator: string | null;
  name: string;
  category: string;
  opensAt: string | null;
  closesAt: string | null;
  locationText: string;
  nearbyGates: string[];
  sourceUpdatedAt: string;
};

type GateRetailFlowSignal = {
  targetWindow: { startKst: string; endKst: string };
  terminal: "T1" | "T2";
  gateClusterId: string;
  activeDepartureFlights: number;
  delayedDepartureFlights: number;
  cancelledFlightsExcluded: number;
  checkpointWaitingPeople: number | null;
  openRetailFacilities: number | null;
  level: "LOW" | "MODERATE" | "HIGH" | "NOT_AVAILABLE";
  evidence: string[];
  label: "ZONE_FLOW_SIGNAL";
};
```

## 5. 산식 원칙

1. 항공편별 공식 terminal/gate가 있는 출발편만 대상에 포함한다.
2. 결항편은 구역 흐름 편수에서 제외하고 별도 결항 Metric으로 센다.
3. `TODAY`는 해당 KST 날짜의 하루 전체편, `NEXT 1H/3H/6H`는 기준시각 이후 Window다.
4. 지연편은 최신 변경시간 기준으로 Window를 다시 계산한다.
5. 게이트 Cluster는 임의 숫자묶음이 아니라 공식 Terminal map과 시설 Directory 인접성을 기준으로 Versioning한다.
6. T1 출국장 대기는 1분 값의 freshness를 확인한다. 오래되면 `DELAYED`, 실패하면 `NOT_AVAILABLE`이다.
7. T2 출국장 대기값을 T1·전체값으로 복제하지 않는다.
8. 항공편 수에 임의 평균승객을 곱해 게이트 승객 수를 만들지 않는다.
9. Source 일부가 비면 이용 가능한 증거만 표시하고 Confidence를 낮춘다.

초기 V1은 복잡한 AI 모델 없이 deterministic rule과 percentile을 사용한다. 최소 4주 이상 같은 요일·시간 Archive가 쌓인 뒤 `현재값 vs 동일 요일·시간 기준`으로 비교한다.

## 6. 저장·수집 구조

```text
collect_airport_departure_checkpoints.py  # 1분 API를 5분 Snapshot으로 축약
collect_airport_flights.py                # gate/check-in/status/changed time
snapshot_airport_retail_directory.py      # 시설 변경 감지, 매일 1회 이하
normalize_airport_gate_retail.py
compute_gate_retail_flow.py
```

- 1분 원문을 Git에 누적하지 않는다. 현재값, 5분 Snapshot, 시간 Aggregate만 저장한다.
- `airport/checkpoints/current`, `airport/gates/{date}`, `airport/retail-directory`, `airport/gate-flow/{date}`처럼 분리한다.
- 공항 3 API는 공공데이터포털 프로젝트 서비스키 1개를 Secret Store에 두고, 각 API를 별도 활용신청한다.
- Directory 자동화 조건이 불명확하면 HTML 무단 크롤링 대신 수동 검증 Snapshot 또는 공식 제공 API/파일을 사용한다.

## 7. UI·오류 상태

- `LIVE CHECKPOINT · T1`: 실제 API·timestamp·schema validation이 통과한 경우만.
- `T2 CHECKPOINT · NOT PROVIDED`: 공식 제공 전까지 유지.
- `DEMO GATE WAVE`: Work의 샘플 항공편 집계.
- `OFFICIAL DIRECTORY`: 시설 위치·영업시간만 공식임을 표시.
- `NOT STORE FOOTFALL`: 구역 흐름 신호 주변에 항상 노출.
- Gate 변경, 0편, 모두 결항, T1 API 실패, T2 미제공, Directory 누락, 영업시간 없음 상태를 각각 테스트한다.

## 8. 최종 판단

RetailPulse는 “어느 출국장과 게이트 구역이 지금/앞으로 붐비는가”까지는 무료 공식 데이터로 고도화할 수 있다. 단, T1 출국장 혼잡·게이트 운항·면세시설 위치는 서로 다른 관측이므로 하나의 실제 방문객 수처럼 합치지 않는다. “어느 면세점이 실제로 가장 바쁘고 매출이 높은가”는 공개 데이터만으로 확정할 수 없다. 따라서 Production V1은 **출국장 대기 + 게이트 출발편 집중 + 면세시설 위치**를 합친 투명한 구역 신호를 제공하고, 매장 단위 지표는 신라면세점 등 운영사의 실제 데이터를 적법하게 연결한 뒤 별도 기능으로 승격한다.
