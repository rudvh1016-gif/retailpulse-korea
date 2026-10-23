import type {Lang} from './retailpulse-data';

const focusCopy = {
 ko: {model: '구조 이해를 위한 모형 · 항공기 위치는 실제 운항 현황이 아닙니다', staff: '근무 중 확인', staffHelp: '터미널·시간대 정보와 고객 안내에 필요한 공식 소식을 확인하세요.', terminal: '터미널·시간대 확인 ↗', news: '관세·면세 공식 소식 ↗', allowances: '도착국 반입 면세한도 ↗', countryJump: '국가별 월 여객 비교는 국가별 흐름에서 보기 ↗', countries: '국가별 흐름', countriesHelp: '어느 노선의 흐름이 달라졌는지, 월별 실적으로 확인합니다.', prepare: '미리 준비', prepareHelp: '다가오는 휴일과 공식 안내를 미리 확인하세요.', newsMore: '관세·면세 공식 소식 확인 ↗'},
 en: {model: 'Illustrative model · Aircraft positions do not show actual operations', staff: 'During your shift', staffHelp: 'Check terminal and time-slot information and official updates for customer guidance.', terminal: 'Check terminals and times ↗', news: 'Official customs and duty-free updates ↗', allowances: 'Destination arrival allowances ↗', countryJump: 'Compare monthly passengers by route country ↗', countries: 'Route-country trends', countriesHelp: 'Compare monthly passenger records to see which routes have changed.', prepare: 'Prepare ahead', prepareHelp: 'Check upcoming holidays and official guidance.', newsMore: 'View official customs and duty-free updates ↗'},
} as const;
export function airportFocusCopy(lang: Lang) { return focusCopy[lang === 'en' ? 'en' : 'ko']; }
