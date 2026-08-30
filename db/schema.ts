import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
}, (table) => [uniqueIndex("tourism_events_area_content_unique").on(table.sourceId, table.area, table.contentId)]);

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
}, (table) => [uniqueIndex("predictions_hash_unique").on(table.predictionHash)]);

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
