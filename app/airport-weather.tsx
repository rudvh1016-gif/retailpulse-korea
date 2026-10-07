import type { Lang } from './retailpulse-data';

/** No verified airport observation is connected. Seoul weather is a different location. */
export function AirportWeather({ lang }: { lang: Lang }) {
  const title = { ko: '공항 날씨', en: 'Airport weather', zh: '机场天气', ja: '空港の天気' }[lang];
  const unavailable = {
    ko: '현재 인천공항 관측 날씨를 확인할 수 없습니다.',
    en: 'Current observed weather at Incheon Airport is unavailable.',
    zh: '目前无法确认仁川机场的实测天气。',
    ja: '現在の仁川空港の観測天気を確認できません。',
  }[lang];
  return <section className="airport-detail-section airport-weather" aria-labelledby="airport-weather-title" data-testid="airport-weather" data-state="UNAVAILABLE">
    <div className="airport-detail-head"><h3 id="airport-weather-title">{title}</h3></div>
    <p className="airport-empty-line" role="status">{unavailable}</p>
  </section>;
}
