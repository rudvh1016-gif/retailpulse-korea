/**
 * One practical line under the weather numbers.
 *
 * The card already lists 맑음 · 24°C · 강수확률 · 습도 · 바람 · 최저/최고. Those
 * are correct and useless to someone deciding whether to take a jacket. This
 * turns the same official KMA fields into one sentence a person can act on.
 *
 * Rules, not a model. No runtime LLM, no provider call, no randomness: the
 * same forecast always produces the same sentence, and every sentence is
 * traceable to a threshold below. The four locales are written out rather
 * than templated, because a comfort sentence assembled from fragments reads
 * like machine translation in all four.
 *
 * What it deliberately does not do: give medical or safety advice. "물을
 * 챙기고 더위에 유의하세요" is what a friend says; heat-illness warnings,
 * exposure limits and health guidance belong to the KMA's own advisories, not
 * to a retail signal product.
 */
export type Lang = "ko" | "en" | "zh" | "ja";

export interface WeatherGuideInput {
  /** Tenths of a degree, as stored. Null when KMA published none. */
  temperatureTenthC: number | null;
  dailyMinTemperatureTenthC: number | null;
  dailyMaxTemperatureTenthC: number | null;
  /** 0-100, the highest probability across the read window. */
  precipitationProbability: number | null;
  /** Official PTY code: 0 none, 1 rain, 2 sleet, 3 snow, 4 shower. */
  precipitationTypeCode: string | null;
  humidityPercent: number | null;
  windSpeedTenthMps: number | null;
}

/** Compact forecast facts; missing values are omitted rather than shown as zero. */
export function formatWeatherDetails(input: WeatherGuideInput | null, lang: Lang): string {
  if (!input) return "";
  const labels = {
    ko: ["기온", "습도", "바람", "최저", "최고", "예보 강수확률 최대"],
    en: ["Temperature", "Humidity", "Wind", "Low", "High", "Maximum forecast rain chance"],
    zh: ["气温", "湿度", "风速", "最低", "最高", "预报最高降雨概率"],
    ja: ["気温", "湿度", "風速", "最低", "最高", "予報の最大降水確率"],
  }[lang];
  const fields = [
    [input.temperatureTenthC, 10, "°C"],
    [input.humidityPercent, 1, "%"],
    [input.windSpeedTenthMps, 10, "m/s"],
    [input.dailyMinTemperatureTenthC, 10, "°C"],
    [input.dailyMaxTemperatureTenthC, 10, "°C"],
    [input.precipitationProbability, 1, "%"],
  ] as const;
  return fields.flatMap(([value, divisor, unit], index) => {
    if (value === null || !Number.isFinite(value)) return [];
    if ((unit === "%" && (value < 0 || value > 100)) || (unit === "m/s" && value < 0)) return [];
    return [`${labels[index]} ${value / divisor}${unit}`];
  }).join(" · ");
}

/**
 * The guide kinds, in the fixed order they are tested.
 *
 * Order is the whole design: falling snow matters more than a wide daily
 * swing, and a swing matters more than "it is mild". Each kind names a
 * situation, never a severity level.
 */
export type WeatherGuideKind =
  | "SNOW"
  | "RAIN_LIKELY"
  | "RAIN_POSSIBLE"
  | "HOT_HUMID"
  | "WINDY_COLD"
  | "COLD"
  | "WIDE_DAILY_SWING"
  | "MILD";

/** Thresholds in the units the fields already use, named so a reader can check them. */
export const WEATHER_GUIDE_THRESHOLDS = {
  /** ≥ 60% reads as "expect rain"; 30-59% as "it might". */
  rainLikelyPercent: 60,
  rainPossiblePercent: 30,
  hotTenthC: 280,
  humidHotPercent: 70,
  coldTenthC: 100,
  /** Wind that makes a mild day feel cold, in tenths of m/s. */
  briskWindTenthMps: 70,
  windChillTenthC: 180,
  /** A day whose low and high are this far apart needs a layer. */
  wideSwingTenthC: 90,
} as const;

const GUIDE_TEXT: Record<WeatherGuideKind, Record<Lang, string>> = {
  SNOW: {
    ko: "눈이 올 수 있어요. 바닥이 미끄러울 수 있으니 이동 시간을 넉넉히 잡으세요",
    en: "Snow is possible. Paths may be slippery, so allow extra time to get around",
    zh: "可能会下雪。路面或许湿滑，出行请预留充裕时间",
    ja: "雪が降る可能性があります。足元が滑りやすいので移動時間に余裕を持ってください",
  },
  RAIN_LIKELY: {
    ko: "비가 올 가능성이 높아요. 이동할 때 우산을 챙기는 게 좋아요",
    en: "Rain is likely. Take an umbrella when you head out",
    zh: "降雨可能性较大。外出时请带上雨伞",
    ja: "雨が降る可能性が高いです。外出時は傘を持っていくとよいでしょう",
  },
  RAIN_POSSIBLE: {
    ko: "비가 올 가능성이 있어요. 이동할 때 작은 우산을 챙기는 게 좋아요",
    en: "Rain is possible. A small umbrella is worth taking with you",
    zh: "可能会下雨。外出时带把小伞会更放心",
    ja: "雨が降る可能性があります。移動の際は折りたたみ傘があると安心です",
  },
  HOT_HUMID: {
    ko: "덥고 습한 날씨예요. 야외 이동 시 물을 챙기고 그늘에서 쉬어 가세요",
    en: "It is hot and humid. Carry water and take breaks in the shade when you are outside",
    zh: "天气闷热潮湿。户外活动请备好饮水，并到阴凉处休息",
    ja: "蒸し暑い天気です。屋外を移動するときは水分を持ち、日陰で休みながら進みましょう",
  },
  WINDY_COLD: {
    ko: "바람이 강해 체감온도가 낮을 수 있어요. 가벼운 겉옷을 준비하세요",
    en: "Strong wind can make it feel colder than it is. Bring a light outer layer",
    zh: "风力较强，体感温度可能偏低。建议带一件轻便外套",
    ja: "風が強く体感温度が低くなることがあります。薄手の上着を用意してください",
  },
  COLD: {
    ko: "쌀쌀한 날씨예요. 겉옷을 챙기면 하루가 훨씬 편해요",
    en: "It is chilly. A coat will make the day much more comfortable",
    zh: "天气偏凉。带件外套会让一天舒服很多",
    ja: "肌寒い天気です。上着があると一日ずっと過ごしやすくなります",
  },
  WIDE_DAILY_SWING: {
    ko: "낮에는 무난하지만 아침·저녁에는 선선할 수 있어요. 얇은 겉옷을 챙기면 좋아요",
    en: "Comfortable in the daytime, but cooler morning and evening. A light layer helps",
    zh: "白天较为舒适，早晚可能转凉。带件薄外套会更合适",
    ja: "日中は過ごしやすいものの、朝晩は涼しくなりそうです。薄手の上着があると安心です",
  },
  MILD: {
    ko: "특별히 대비할 것 없는 무난한 날씨예요",
    en: "A mild day with nothing in particular to prepare for",
    zh: "天气平稳，无需特别准备",
    ja: "特に備えるものがない、過ごしやすい天気です",
  },
};

/**
 * Picks the guide kind, or null when KMA published too little to say anything.
 *
 * Silence is a real answer here. A card with no temperature and no probability
 * gets no sentence at all rather than a cheerful default that the data does
 * not support.
 */
export function deriveWeatherGuideKind(input: WeatherGuideInput): WeatherGuideKind | null {
  const t = WEATHER_GUIDE_THRESHOLDS;
  const temperature = input.temperatureTenthC;
  const low = input.dailyMinTemperatureTenthC;
  const high = input.dailyMaxTemperatureTenthC;
  const pop = input.precipitationProbability;
  const wind = input.windSpeedTenthMps;
  const humidity = input.humidityPercent;

  const hasAny = [temperature, low, high, pop, wind, humidity].some((value) => value !== null);
  if (!hasAny) return null;

  // Falling precipitation first: what is coming out of the sky outranks how it
  // feels. Snow and sleet are called by the official PTY code, never guessed
  // from a cold temperature.
  if (input.precipitationTypeCode === "3" || input.precipitationTypeCode === "2") return "SNOW";
  if (pop !== null && pop >= t.rainLikelyPercent) return "RAIN_LIKELY";
  if (input.precipitationTypeCode === "1" || input.precipitationTypeCode === "4") return "RAIN_LIKELY";
  if (pop !== null && pop >= t.rainPossiblePercent) return "RAIN_POSSIBLE";

  const feelsHot = (high ?? temperature);
  if (feelsHot !== null && feelsHot >= t.hotTenthC && humidity !== null && humidity >= t.humidHotPercent) return "HOT_HUMID";

  // Wind only earns its own line when the day is not already warm: a breeze on
  // a 28°C afternoon is a relief, not a reason for a jacket.
  if (wind !== null && wind >= t.briskWindTenthMps
    && temperature !== null && temperature <= t.windChillTenthC) return "WINDY_COLD";

  if (temperature !== null && temperature <= t.coldTenthC) return "COLD";
  if (low !== null && high !== null && high - low >= t.wideSwingTenthC) return "WIDE_DAILY_SWING";
  return "MILD";
}

/**
 * How strong the wind is, said in words.
 *
 * The card already prints "바람 2.5m/s", which tells a reader nothing unless
 * they know what 2.5 feels like. The buckets follow the KMA's own everyday
 * wording for 풍속: under 4 m/s is calm, 4-8.9 is noticeable, 9 and above is
 * strong. Tenths of m/s, as stored.
 */
export const WIND_WORD_THRESHOLDS = { briskTenthMps: 40, strongTenthMps: 90 } as const;

export type WindWord = "CALM" | "BREEZY" | "STRONG";

export function describeWindStrength(windSpeedTenthMps: number | null): WindWord | null {
  if (windSpeedTenthMps === null || !Number.isFinite(windSpeedTenthMps) || windSpeedTenthMps < 0) return null;
  if (windSpeedTenthMps >= WIND_WORD_THRESHOLDS.strongTenthMps) return "STRONG";
  if (windSpeedTenthMps >= WIND_WORD_THRESHOLDS.briskTenthMps) return "BREEZY";
  return "CALM";
}

const WIND_TEXT: Record<WindWord, Record<Lang, string>> = {
  CALM: { ko: "바람은 약해요", en: "the wind is light", zh: "风力较弱", ja: "風は弱めです" },
  BREEZY: { ko: "바람은 조금 불어요", en: "there is a noticeable breeze", zh: "有一些风", ja: "風はやや吹いています" },
  STRONG: { ko: "바람은 강해요", en: "the wind is strong", zh: "风力较强", ja: "風は強めです" },
};

const WIND_ALONE: Record<WindWord, Record<Lang, string>> = {
  CALM: { ko: "바람은 약해요", en: "The wind is light", zh: "风力较弱", ja: "風は弱めです" },
  BREEZY: { ko: "바람은 조금 불어요", en: "There is a noticeable breeze", zh: "有一些风", ja: "風はやや吹いています" },
  STRONG: { ko: "바람은 강해요", en: "The wind is strong", zh: "风力较强", ja: "風は強めです" },
};

/**
 * Air quality is quoted, never computed.
 *
 * The grade is Seoul's own published label for the reading; KORETAIL does not
 * own a PM scale and must not invent one, so a label it does not recognise is
 * dropped rather than guessed at. This is also a DIFFERENT source from the
 * KMA forecast the rest of the sentence comes from — the caller is
 * responsible for naming both.
 */
export type AirGrade = "GOOD" | "MODERATE" | "BAD" | "VERY_BAD";

const SEOUL_AIR_GRADE: Record<string, AirGrade> = {
  "좋음": "GOOD", "보통": "MODERATE", "나쁨": "BAD", "매우나쁨": "VERY_BAD", "매우 나쁨": "VERY_BAD",
};

export function readAirGrade(publishedGrade: string | null | undefined): AirGrade | null {
  if (typeof publishedGrade !== "string") return null;
  return SEOUL_AIR_GRADE[publishedGrade.trim()] ?? null;
}

export const AIR_GRADE_TEXT: Record<AirGrade, Record<Lang, string>> = {
  GOOD: { ko: "좋음", en: "good", zh: "优", ja: "良い" },
  MODERATE: { ko: "보통", en: "moderate", zh: "普通", ja: "普通" },
  BAD: { ko: "나쁨", en: "bad", zh: "差", ja: "悪い" },
  VERY_BAD: { ko: "매우 나쁨", en: "very bad", zh: "很差", ja: "非常に悪い" },
};

/*
 * Written out per locale, in both the joined and the standalone form.
 *
 * The file's rule is that a comfort sentence is never assembled from
 * fragments — a conjugation patched on with a regex reads like machine
 * translation in Korean and Japanese exactly where it matters most.
 */
const AIR_JOINED: Record<AirGrade, Record<Lang, string>> = {
  GOOD: { ko: "미세먼지는 좋음이고", en: "air quality is good", zh: "空气质量为优", ja: "大気質は良好で" },
  MODERATE: { ko: "미세먼지는 보통이고", en: "air quality is moderate", zh: "空气质量普通", ja: "大気質は普通で" },
  BAD: { ko: "미세먼지는 나쁨이고", en: "air quality is bad", zh: "空气质量较差", ja: "大気質は悪く" },
  VERY_BAD: { ko: "미세먼지는 매우 나쁨이고", en: "air quality is very bad", zh: "空气质量很差", ja: "大気質は非常に悪く" },
};

const AIR_ALONE: Record<AirGrade, Record<Lang, string>> = {
  GOOD: { ko: "미세먼지는 좋음이에요", en: "Air quality is good", zh: "空气质量为优", ja: "大気質は良好です" },
  MODERATE: { ko: "미세먼지는 보통이에요", en: "Air quality is moderate", zh: "空气质量普通", ja: "大気質は普通です" },
  BAD: { ko: "미세먼지는 나쁨이에요", en: "Air quality is bad", zh: "空气质量较差", ja: "大気質は悪いです" },
  VERY_BAD: { ko: "미세먼지는 매우 나쁨이에요", en: "Air quality is very bad", zh: "空气质量很差", ja: "大気質は非常に悪いです" },
};

/** The air grade to quote: the worse of the two readings, because that is the one a person feels. */
export function worseAirGrade(pm10Grade: string | null | undefined, pm25Grade: string | null | undefined): AirGrade | null {
  const order: AirGrade[] = ["GOOD", "MODERATE", "BAD", "VERY_BAD"];
  const grades = [readAirGrade(pm10Grade), readAirGrade(pm25Grade)].filter((grade): grade is AirGrade => grade !== null);
  if (!grades.length) return null;
  return grades.reduce((worst, grade) => (order.indexOf(grade) > order.indexOf(worst) ? grade : worst));
}

export interface WeatherGuideExtras {
  /** Seoul's published PM grades, quoted as-is. Null when not observed. */
  pm10Grade?: string | null;
  pm25Grade?: string | null;
}

/**
 * The finished line, or null when there is not enough official data to say
 * anything.
 *
 * `extras` appends one more clause about air quality and wind — the owner's
 * two "so what do I do about it" questions, which the numbers above the line
 * never answered. It is appended to the existing sentence rather than
 * replacing it, and each half is omitted when its own source published
 * nothing, so the line never implies a reading that does not exist.
 */
export function buildWeatherGuide(input: WeatherGuideInput, lang: Lang, extras: WeatherGuideExtras = {}): string | null {
  const kind = deriveWeatherGuideKind(input);
  if (!kind) return null;
  const base = GUIDE_TEXT[kind][lang];

  const air = worseAirGrade(extras.pm10Grade, extras.pm25Grade);
  const wind = describeWindStrength(input.windSpeedTenthMps);
  if (!air && !wind) return base;

  // "미세먼지는 좋음이고, 바람은 약해요" — one clause when only one half is
  // known, so a missing reading never leaves a dangling conjunction.
  const clause = air && wind
    ? {
        ko: `${AIR_JOINED[air].ko}, ${WIND_TEXT[wind].ko}`,
        // English starts a new sentence here, so it takes the capitalised form.
        en: `${AIR_ALONE[air].en} and ${WIND_TEXT[wind].en}`,
        zh: `${AIR_JOINED[air].zh}，${WIND_TEXT[wind].zh}`,
        ja: `${AIR_JOINED[air].ja}、${WIND_TEXT[wind].ja}`,
      }[lang]
    : air ? AIR_ALONE[air][lang] : WIND_ALONE[wind!][lang];

  // No terminal period: this file's display copy never ends in one, and the
  // existing locale test enforces it.
  const joiner = { ko: ". ", en: ". ", zh: "。", ja: "。" }[lang];
  return `${base}${joiner}${clause}`;
}
