import { desc, sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sourceHealth = sqliteTable("source_health", {
  sourceId: text("source_id").primaryKey(),
  status: text("status").notNull(),
  lastEventAt: text("last_event_at"),
  lastPublishedAt: text("last_published_at"),
  lastRetrievedAt: text("last_retrieved_at"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  schemaVersion: text("schema_version").notNull(),
  detail: text("detail"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const airportFlights = sqliteTable("airport_flights", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  direction: text("direction").notNull(),
  flightNumber: text("flight_number").notNull(),
  airlineCode: text("airline_code"),
  airportCode: text("airport_code"),
  terminal: text("terminal"),
  gate: text("gate"),
  checkinCounter: text("checkin_counter"),
  status: text("status").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  changedAt: text("changed_at"),
  eventAt: text("event_at").notNull(),
  publishedAt: text("published_at"),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [
  uniqueIndex("airport_flights_source_event_unique").on(table.sourceId, table.flightNumber, table.direction, table.scheduledAt),
]);

export const airportFlightChanges = sqliteTable("airport_flight_changes", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  direction: text("direction").notNull(),
  flightNumber: text("flight_number").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  changedAt: text("changed_at"),
  terminal: text("terminal"),
  gate: text("gate"),
  checkinCounter: text("checkin_counter"),
  status: text("status").notNull(),
  semanticHash: text("semantic_hash").notNull(),
  observedAt: text("observed_at").notNull(),
}, (table) => [
  uniqueIndex("airport_flight_changes_semantic_unique").on(
    table.sourceId,
    table.flightNumber,
    table.direction,
    table.scheduledAt,
    table.semanticHash,
  ),
]);

export const airportFlow = sqliteTable("airport_flow", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  terminal: text("terminal"),
  direction: text("direction").notNull(),
  eventAt: text("event_at").notNull(),
  publishedAt: text("published_at"),
  retrievedAt: text("retrieved_at").notNull(),
  value: integer("value").notNull(),
  unit: text("unit").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("airport_flow_source_event_unique").on(table.sourceId, table.terminal, table.direction, table.eventAt)]);

// S1 — Seoul real-time city data (citydata_ppltn): observed area status.
export const seoulRealtimeArea = sqliteTable("seoul_realtime_area", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  areaCode: text("area_code").notNull(),
  areaName: text("area_name").notNull(),
  congestionLevel: integer("congestion_level").notNull(),
  congestionLabel: text("congestion_label").notNull(),
  populationMin: integer("population_min").notNull(),
  populationMax: integer("population_max").notNull(),
  observedAt: text("observed_at").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_realtime_area_observed_unique").on(table.sourceId, table.area, table.observedAt)]);

// S1 — official Seoul-published 12-hour population forecast. This is Seoul's
// own forecast (recordOrigin FORECAST), never mixed with observed rows.
export const seoulRealtimeForecast = sqliteTable("seoul_realtime_forecast", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  area: text("area").notNull(),
  issuedAt: text("issued_at").notNull(),
  targetAt: text("target_at").notNull(),
  congestionLevel: integer("congestion_level").notNull(),
  congestionLabel: text("congestion_label").notNull(),
  populationMin: integer("population_min").notNull(),
  populationMax: integer("population_max").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_realtime_forecast_unique").on(table.sourceId, table.area, table.issuedAt, table.targetAt)]);

// OA-21285 — realtime Shinhan Card domestic-consumer activity. This stays
// separate from population and quarterly modelled sales because suppression,
// timestamps and truth labels have independent lifecycles.
export const seoulRealtimeCommercial = sqliteTable("seoul_realtime_commercial", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  areaCode: text("area_code").notNull(),
  areaName: text("area_name").notNull(),
  commercialLevel: text("commercial_level").notNull(),
  paymentCount: integer("payment_count"),
  paymentAmountMin: integer("payment_amount_min"),
  paymentAmountMax: integer("payment_amount_max"),
  observedAt: text("observed_at").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_realtime_commercial_unique").on(table.sourceId, table.area, table.observedAt)]);

// S3 — Seoul commercial-district estimated sales (quarterly modelled values,
// never POS sales, never foreign spend).
export const seoulEstimatedSales = sqliteTable("seoul_estimated_sales", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  quarterCode: text("quarter_code").notNull(),
  tradeAreaCode: text("trade_area_code").notNull(),
  tradeAreaName: text("trade_area_name"),
  industryCode: text("industry_code").notNull(),
  industryName: text("industry_name"),
  salesAmount: integer("sales_amount").notNull(),
  salesCount: integer("sales_count"),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_estimated_sales_unique").on(table.sourceId, table.quarterCode, table.tradeAreaCode, table.industryCode)]);

// OA-15577 — quarterly official store stock/opening/closure context. One
// aggregate row represents one versioned official trade area and quarter;
// industry rows are validated and compacted before D1 persistence.
export const seoulStoreDynamics = sqliteTable("seoul_store_dynamics", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  datasetId: text("dataset_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  quarterCode: text("quarter_code").notNull(),
  tradeAreaCode: text("trade_area_code").notNull(),
  tradeAreaName: text("trade_area_name").notNull(),
  tradeAreaTypeCode: text("trade_area_type_code").notNull(),
  tradeAreaTypeName: text("trade_area_type_name").notNull(),
  overallStoreCount: integer("overall_store_count").notNull(),
  ordinaryStoreCount: integer("ordinary_store_count").notNull(),
  franchiseStoreCount: integer("franchise_store_count").notNull(),
  openingStoreCount: integer("opening_store_count").notNull(),
  openingRateTenthsPercent: integer("opening_rate_tenths_percent").notNull(),
  closureStoreCount: integer("closure_store_count").notNull(),
  closureRateTenthsPercent: integer("closure_rate_tenths_percent").notNull(),
  industryCount: integer("industry_count").notNull(),
  mappingVersion: text("mapping_version").notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  retrievedAt: text("retrieved_at").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [
  uniqueIndex("seoul_store_dynamics_unique").on(
    table.sourceId, table.mappingVersion, table.area, table.quarterCode,
  ),
  index("seoul_store_dynamics_area_quarter_idx").on(table.area, desc(table.quarterCode)),
]);

// T1 — official tourism events mapped to a target area by distance search.
export const tourismEvents = sqliteTable("tourism_events", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  contentId: text("content_id").notNull(),
  title: text("title").notNull(),
  address: text("address"),
  lat: text("lat"),
  lng: text("lng"),
  distanceM: integer("distance_m"),
  eventStart: text("event_start").notNull(),
  eventEnd: text("event_end"),
  publishedAt: text("published_at"),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
  // Official list fields the collector used to discard (zero extra calls).
  categoryCode: text("category_code"),
  categoryGroupCode: text("category_group_code"),
  categoryName: text("category_name"),
  addressDetail: text("address_detail"),
  tel: text("tel"),
  // Official detailCommon2 fields, fetched once per contentId by the collector.
  overview: text("overview"),
  homepage: text("homepage"),
  detailRetrievedAt: text("detail_retrieved_at"),
}, (table) => [uniqueIndex("tourism_events_area_content_unique").on(table.sourceId, table.area, table.contentId)]);

/** Official TourAPI category code names (categoryCode2), cached so a code is looked up once. */
export const tourapiCategoryCodes = sqliteTable("tourapi_category_codes", {
  code: text("code").primaryKey(),
  parentCode: text("parent_code"),
  name: text("name").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
});

// A4 — departure-hall checkpoint congestion (flow proxy, not store traffic).
// waitTimeMinutes stays an exact numeric value only; the provider's "60+"
// (or any other non-exact form) is preserved honestly in waitTimeRaw instead
// of being silently rounded down to a false-exact 60. T1 (A4-T1) and T2
// (A4-T2) share this table via distinct sourceId + terminal values and are
// never overwritten by each other (see docs/DATA_SOURCES.md).
export const airportCongestion = sqliteTable("airport_congestion", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  terminal: text("terminal").notNull(),
  zone: text("zone").notNull(),
  waitTimeMinutes: integer("wait_time_minutes"),
  waitTimeRaw: text("wait_time_raw"),
  waitingCount: integer("waiting_count").notNull(),
  observedAt: text("observed_at").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("airport_congestion_observed_unique").on(table.sourceId, table.terminal, table.zone, table.observedAt)]);

// A5 — official T1/T2 arrival/departure passenger forecast (today + tomorrow,
// hourly bands). This is FORECAST/EXPECTED data and must never be written to
// airportCongestion or treated as an actual observed queue. Component rows
// (isAggregate=0, e.g. t1dg1) and the provider's own official total row
// (isAggregate=1, e.g. t1dgsum1) are stored as distinct rows so downstream
// summation logic can pick one or the other and never double-count by
// accidentally summing both (see docs/DATA_SOURCES.md).
export const airportPassengerForecast = sqliteTable("airport_passenger_forecast", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  terminal: text("terminal").notNull(),
  direction: text("direction").notNull(),
  zone: text("zone").notNull(),
  isAggregate: integer("is_aggregate").notNull(),
  targetDate: text("target_date").notNull(),
  timeBandRaw: text("time_band_raw").notNull(),
  targetStartAt: text("target_start_at").notNull(),
  targetEndAt: text("target_end_at").notNull(),
  expectedPassengers: real("expected_passengers").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [
  uniqueIndex("airport_passenger_forecast_unique").on(
    table.sourceId, table.terminal, table.direction, table.zone, table.targetDate, table.timeBandRaw,
  ),
]);

// A2 — official passenger-terminal facility directory (인천국제공항공사
// 여객터미널 시설정보 현황, data.go.kr 15095064). Reference data, not an
// event stream: one row per official `sn`, with the four official language
// names side by side. `category_group` is KORETAIL's own grouping of the
// provider's category strings, which are kept beside it unchanged.
export const airportFacility = sqliteTable("airport_facility", {
  facilityId: text("facility_id").primaryKey(),
  sourceId: text("source_id").notNull(),
  nameKo: text("name_ko"),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  nameJa: text("name_ja"),
  facilityItem: text("facility_item"),
  largeCategory: text("large_category"),
  mediumCategory: text("medium_category"),
  smallCategory: text("small_category"),
  categoryGroup: text("category_group").notNull(),
  terminalCode: text("terminal_code"),
  terminal: text("terminal"),
  floor: text("floor"),
  dutyArea: text("duty_area"),
  arrivalDeparture: text("arrival_departure"),
  locationRaw: text("location_raw"),
  locationEn: text("location_en"),
  businessHoursRaw: text("business_hours_raw"),
  goodsBrands: text("goods_brands"),
  phone: text("phone"),
  retrievedAt: text("retrieved_at").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [
  index("airport_facility_terminal_category_idx").on(table.terminal, table.categoryGroup, table.nameKo),
  index("airport_facility_category_terminal_idx").on(table.categoryGroup, table.terminal, table.nameKo),
]);

export const foreignPresence = sqliteTable("foreign_presence", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  eventAt: text("event_at").notNull(),
  availableAt: text("available_at").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  value: integer("value").notNull(),
  unit: text("unit").notNull(),
  freshness: text("freshness").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("foreign_presence_area_event_unique").on(table.sourceId, table.area, table.eventAt)]);

// S2 — OA-23018 raw administrative-dong rows. Nationality values remain a
// dimension payload; `value` is the provider's SPOP total.
export const seoulForeignPresenceDong = sqliteTable("seoul_foreign_presence_dong", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  productVersion: text("product_version").notNull(),
  recordOrigin: text("record_origin").notNull(),
  administrativeDongCode: text("administrative_dong_code").notNull(),
  referenceAt: text("reference_at").notNull(),
  availableAt: text("available_at"),
  retrievedAt: text("retrieved_at").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  nationalityJson: text("nationality_json").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_foreign_presence_dong_unique").on(
  table.sourceId, table.productVersion, table.administrativeDongCode, table.referenceAt,
)]);

// S2 product-area aggregates are kept separate from raw dong provenance and
// from the legacy `foreign_presence` series.
export const seoulForeignPresenceArea = sqliteTable("seoul_foreign_presence_area", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  productVersion: text("product_version").notNull(),
  recordOrigin: text("record_origin").notNull(),
  area: text("area").notNull(),
  referenceAt: text("reference_at").notNull(),
  availableAt: text("available_at"),
  retrievedAt: text("retrieved_at").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  administrativeDongCodesJson: text("administrative_dong_codes_json").notNull(),
  mappingVersion: text("mapping_version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("seoul_foreign_presence_area_unique").on(
  table.sourceId, table.productVersion, table.mappingVersion, table.area, table.referenceAt,
)]);

export const weatherForecast = sqliteTable("weather_forecast", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  area: text("area").notNull(),
  issuedAt: text("issued_at").notNull(),
  targetAt: text("target_at").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  precipitationProbability: integer("precipitation_probability"),
  temperatureTenthC: integer("temperature_tenth_c"),
  conditionCode: text("condition_code"),
  // W1 enrichment. Every field below comes from the same getVilageFcst
  // response the collector already fetches; none of them costs a request.
  humidityPercent: integer("humidity_percent"),
  windSpeedTenthMps: integer("wind_speed_tenth_mps"),
  dailyMinTemperatureTenthC: integer("daily_min_temperature_tenth_c"),
  dailyMaxTemperatureTenthC: integer("daily_max_temperature_tenth_c"),
  // PCP and SNO are qualitative: the provider's own string is the record, and
  // the tenths column is filled only when that string is an exact amount.
  precipitationAmountRaw: text("precipitation_amount_raw"),
  precipitationAmountKind: text("precipitation_amount_kind"),
  precipitationAmountTenthMm: integer("precipitation_amount_tenth_mm"),
  snowAmountRaw: text("snow_amount_raw"),
  snowAmountKind: text("snow_amount_kind"),
  snowAmountTenthCm: integer("snow_amount_tenth_cm"),
  // Official codes kept alongside the derived conditionCode, so a later
  // reading is never limited by today's mapping.
  skyCode: text("sky_code"),
  precipitationTypeCode: text("precipitation_type_code"),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("weather_forecast_issue_target_unique").on(table.sourceId, table.area, table.issuedAt, table.targetAt)]);

export const weatherActual = sqliteTable("weather_actual", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  area: text("area").notNull(),
  eventAt: text("event_at").notNull(),
  availableAt: text("available_at").notNull(),
  collectedAt: text("collected_at").notNull(),
  precipitationTenthMm: integer("precipitation_tenth_mm"),
  temperatureTenthC: integer("temperature_tenth_c"),
  conditionCode: text("condition_code"),
  schemaVersion: text("schema_version").notNull(),
  qualityStatus: text("quality_status").notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("weather_actual_area_event_unique").on(table.sourceId, table.area, table.eventAt)]);

export const modelVersions = sqliteTable("model_versions", {
  id: text("id").primaryKey(),
  targetId: text("target_id").notNull(),
  modelVersion: text("model_version").notNull(),
  proxyVersion: text("proxy_version").notNull(),
  featureVersion: text("feature_version").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("model_target_version_unique").on(table.targetId, table.modelVersion)]);

export const predictions = sqliteTable("predictions", {
  predictionId: text("prediction_id").primaryKey(),
  createdAt: text("created_at").notNull(),
  targetAt: text("target_at").notNull(),
  dataCutoff: text("data_cutoff").notNull(),
  targetId: text("target_id").notNull(),
  area: text("area").notNull(),
  industry: text("industry"),
  value: integer("value").notNull(),
  valueScale: integer("value_scale").notNull().default(1),
  forecastClass: text("forecast_class").notNull(),
  confidence: text("confidence").notNull(),
  modelVersion: text("model_version").notNull(),
  proxyVersion: text("proxy_version").notNull(),
  featureVersion: text("feature_version").notNull(),
  sourceVersions: text("source_versions").notNull(),
  inputHash: text("input_hash").notNull(),
  predictionHash: text("prediction_hash").notNull(),
  recordOrigin: text("record_origin").notNull(),
}, (table) => [uniqueIndex("predictions_hash_unique").on(table.predictionHash),index("predictions_area_target_idx").on(table.area,table.targetAt),index("predictions_model_target_idx").on(table.modelVersion,table.targetAt)]);

export const baselinePredictions = sqliteTable("baseline_predictions", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull(),
  baselineId: text("baseline_id").notNull(),
  value: integer("value").notNull(),
  valueScale: integer("value_scale").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("baseline_prediction_unique").on(table.predictionId, table.baselineId)]);

export const outcomes = sqliteTable("outcomes", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull(),
  targetId: text("target_id").notNull(),
  eventAt: text("event_at").notNull(),
  availableAt: text("available_at").notNull(),
  collectedAt: text("collected_at").notNull(),
  actualValue: integer("actual_value").notNull(),
  actualUnit: text("actual_unit").notNull(),
  sourceId: text("source_id").notNull(),
  sourceVersion: text("source_version").notNull(),
  verificationLevel: text("verification_level").notNull(),
  qualityStatus: text("quality_status").notNull(),
}, (table) => [uniqueIndex("outcome_prediction_source_unique").on(table.predictionId, table.sourceId, table.verificationLevel)]);

export const collectorRuns = sqliteTable("collector_runs", {
  runId: text("run_id").primaryKey(),
  sourceId: text("source_id").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  recordsRead: integer("records_read").notNull().default(0),
  recordsWritten: integer("records_written").notNull().default(0),
  errorCode: text("error_code"),
  detail: text("detail"),
}, (table) => [uniqueIndex("collector_source_start_unique").on(table.sourceId, table.startedAt)]);

export const betaSignups = sqliteTable("beta_signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  segment: text("segment").notNull(),
  locale: text("locale").notNull(),
  sourcePath: text("source_path").notNull(),
  consentVersion: text("consent_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("beta_signups_email_unique").on(table.email),
]);

// Operational context is compact source data; predictions retain the existing immutable ledger.
export const seoulContext = sqliteTable('seoul_context', {
  area:text('area').notNull(), observedAt:text('observed_at').notNull(), retrievedAt:text('retrieved_at').notNull(),
  payload:text('payload').notNull(),sourceHash:text('source_hash').notNull(),
},table=>[primaryKey({columns:[table.area,table.observedAt]})]);
export const holidayMonths = sqliteTable('holiday_months', {
  month:text('month').primaryKey(),payload:text('payload').notNull(),retrievedAt:text('retrieved_at').notNull(),sourceHash:text('source_hash').notNull(),
});
export const forecastRuns = sqliteTable('forecast_runs', {
  area:text('area').notNull(),targetDate:text('target_date').notNull(),createdAt:text('created_at').notNull(),payload:text('payload').notNull(),
},table=>[primaryKey({columns:[table.area,table.targetDate]})]);
export const predictionInputs = sqliteTable('prediction_inputs', {
  predictionId:text('prediction_id').primaryKey(),payload:text('payload').notNull(),
});
export const airportForecastVersions = sqliteTable('airport_forecast_versions', {
  id:text('id').primaryKey(),canonicalId:text('canonical_id').notNull(),sourceHash:text('source_hash').notNull(),
  terminal:text('terminal').notNull(),direction:text('direction').notNull(),targetAt:text('target_at').notNull(),
  expectedPassengers:integer('expected_passengers'),retrievedAt:text('retrieved_at').notNull(),archivedAt:text('archived_at').notNull(),
},table=>[index('airport_forecast_versions_target_idx').on(table.targetAt)]);
export const airportDailyComposition = sqliteTable('airport_daily_composition', {
  day:text('day').primaryKey(),payload:text('payload').notNull(),sourceHash:text('source_hash').notNull(),calculatedAt:text('calculated_at').notNull(),
});
export const forecastMaintenance = sqliteTable('forecast_maintenance', {
  day:text('day').primaryKey(),completedAt:text('completed_at').notNull(),
});

export const areaDataCoverage = sqliteTable('area_data_coverage', {
 area:text('area').primaryKey(),calculatedAt:text('calculated_at').notNull(),payload:text('payload').notNull(),
});
