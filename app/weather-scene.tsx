import type { Lang } from './retailpulse-data';
import { formatWeatherDetails, type WeatherGuideInput } from '../lib/weather-guide';
import { SignalScene } from './signal-scene';

const text = (lang: Lang, ko: string, en: string, zh: string, ja: string) => ({ ko, en, zh, ja })[lang];
const locale = { ko: 'ko-KR', en: 'en-GB', zh: 'zh-CN', ja: 'ja-JP' };

function stamp(value: string, lang: Lang): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale[lang], {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date) + ' KST' : value;
}

export interface WeatherSceneObservation {
  /** Already formatted official fields. No source lookup or inference here. */
  facts: readonly string[];
  source: string;
  observedAt: string;
  title?: string;
  explanation?: string | null;
}

/** Presentation only: reads the same deterministic formatter as the text UI. */
export function WeatherScene({ lang, forecast, source, issuedAt = [], targetAt = [], guide, observation, forecastFacts: providedFacts, forecastTitle, showScene = true }: {
  lang: Lang;
  forecast: WeatherGuideInput | null;
  source: string;
  issuedAt?: readonly string[];
  targetAt?: readonly string[];
  guide?: string;
  observation?: WeatherSceneObservation | null;
  /** Preserve an existing surface's formatted facts, including its missing-field rules. */
  forecastFacts?: readonly string[];
  forecastTitle?: string | null;
  showScene?: boolean;
}) {
  const forecastFacts = (providedFacts ?? formatWeatherDetails(forecast, lang).split(' · ')).filter(Boolean);
  const observedFacts = observation?.facts.filter(Boolean) ?? [];
  if (!forecastFacts.length && !observedFacts.length && !guide) return null;
  const issues = [...new Set(issuedAt.filter(value => Number.isFinite(Date.parse(value))))];
  const targets = [...new Set(targetAt.filter(value => Number.isFinite(Date.parse(value))))];
  return <div className={`weather-scene${showScene ? '' : ' weather-scene-without-model'}`} data-testid="weather-scene">
    {showScene && <SignalScene kind="temperature"/>}
    <div className="weather-scene-content">
      {(forecastFacts.length > 0 || guide) && <section className="weather-scene-forecast" aria-label={text(lang, '날씨 예보', 'Weather forecast', '天气预报', '天気予報')}>
        {forecastTitle !== null && <h3>{forecastTitle ?? text(lang, '날씨 예보', 'Weather forecast', '天气预报', '天気予報')}</h3>}
        <ul className="weather-scene-values">{forecastFacts.map(value => <li key={value}>{value}</li>)}</ul>
        <small className="weather-scene-source">{source}{issues.length > 0 && <> · {text(lang, '예보 발표', 'Forecast issued', '预报发布', '予報発表')} {issues.map(value => stamp(value, lang)).join(' · ')}</>}</small>
      </section>}
      {observation && observedFacts.length > 0 && <section className="weather-scene-observation" aria-label={observation.title ?? text(lang, '대기질 관측', 'Air-quality observation', '空气质量观测', '大気質の観測')}>
        <h4>{observation.title ?? text(lang, '대기질 관측', 'Air-quality observation', '空气质量观测', '大気質の観測')}</h4>
        <ul className="weather-scene-values">{observedFacts.map(value => <li key={value}>{value}</li>)}</ul>
        <p className="weather-scene-source">{observation.source} · {stamp(observation.observedAt, lang)}</p>
        {observation.explanation && <details className="weather-scene-details weather-scene-observation-details">
          <summary>{text(lang, '자료와 설명', 'Source and explanation', '资料与说明', '資料と説明')}</summary>
          <p className="context-observation-gap">{observation.explanation}</p>
        </details>}
      </section>}
      {(guide || targets.length > 0) && <details className="weather-scene-details">
        <summary>{text(lang, '안내와 예보 시각', 'Guidance and forecast times', '提示与预报时间', '案内と予報時刻')}</summary>
        {guide && <p className="weather-scene-guidance">{guide}</p>}
        {targets.length > 0 && <p>{text(lang, '공식 예보 대상 시각', 'Published forecast targets', '官方预报对象时间', '公式の予報対象時刻')} · {targets.map(value => stamp(value, lang)).join(' · ')}</p>}
      </details>}
    </div>
  </div>;
}
