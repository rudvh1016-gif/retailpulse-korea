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

/** The finished line, or null when there is not enough official data to say anything. */
export function buildWeatherGuide(input: WeatherGuideInput, lang: Lang): string | null {
  const kind = deriveWeatherGuideKind(input);
  return kind ? GUIDE_TEXT[kind][lang] : null;
}
