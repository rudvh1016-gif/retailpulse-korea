import {readExistingSummary} from './flow-data.mjs';
// A reusable, DOM-only data binding. Review values live in review-snapshot.json.
// Call setData with current API/calculation output when integrating; no provider fetch here.
const copy={
ko:{visualNote:'개념 모형 · 실제 위치·관측 경로 아님',eyebrow:'KORETAIL · 서울 · 이태원',title:'이동과 외국인 흐름',lead:'역을 오가는 이동, 지역에 머무는 생활인구, 관광 목적 이동을 서로 다른 집계 기준과 함께 살펴봅니다.',record:'기존 API 응답 검토본 · 실시간 수치 아님 · 기준일과 단위는 항목별로 표시',stationIndex:'01 · 역을 오가는 이동',stationTitle:'이태원역 · 6호선',stationScope:'최근 일별 집계',alighting:'하차',boarding:'승차',stationWarning:'승하차는 전체 이용객 집계입니다. 외국인 수나 주변 매장 방문 수가 아닙니다.',livingIndex:'02 · 지역에 머무는 인구',livingTitle:'단기체류 외국인 생활인구',livingScope:'한 시점의 추정 인구',livingLabel:'생활인구 추정값',livingWarning:'실제 방문객을 센 값이 아닙니다. 하루 동안의 총 방문자 수로 합산하지 않습니다.',movementIndex:'03 · 목적별 이동',movementTitle:'관광 목적 이동',movementScope:'공식 파일에 담긴 배치 집계',movementLabel:'추정 이동값 · 원자료 단위 미확인',movementWarning:'원자료 단위를 확인하기 전에는 사람 수나 이동 횟수로 해석하지 않습니다. 공개 월은 집계 기준일과 다릅니다.',detailsTitle:'집계 기준과 모형 설명',modelDisclaimer:'Blender로 만든 개념 모형입니다. 역 구조·건물 위치·이동 경로는 공식 좌표나 관측된 동선이 아닙니다. 모형 속 인물·열차·경로 수와 높이는 통계값 또는 국적을 표현하지 않습니다.',comparisonDisclaimer:'세 수치는 모집단·기간·집계 방식이 다릅니다. 서로 더하거나, 승하차 중 외국인 비율을 계산하거나, 오늘의 방문객 수로 바꾸지 않습니다.',footer:'검토용 자산 · 숫자·날짜·단위는 HTML 데이터로 갱신 · 클라이언트 3D 엔진 없음',people:'명',estimate:'명 · 추정',missing:'자료 없음',date:'집계일',reference:'기준 시각',source:'출처',release:'공식 파일 공개 월',unverified:'단위 미확인',unknownDate:'기준일 미확인'},
en:{visualNote:'Concept model · Not actual locations or observed routes',eyebrow:'KORETAIL · SEOUL · ITAEWON',title:'Movement and foreign population',lead:'View station ridership, people present in the area, and tourism-purpose movement with their distinct reporting periods.',record:'Captured API review · Metrics are not real-time · Each retains its own date and unit',stationIndex:'01 · Station movement',stationTitle:'Itaewon Station · Line 6',stationScope:'Recent daily aggregate',alighting:'Alighting',boarding:'Boarding',stationWarning:'Ridership covers all passengers. It is not a count of foreign visitors or shop visits.',livingIndex:'02 · People present in the area',livingTitle:'Short-stay foreign living population',livingScope:'Population estimate at one reference time',livingLabel:'Living population estimate',livingWarning:'This is an estimate, not an observed visitor count. Do not sum it as total daily visitors.',movementIndex:'03 · Movement by purpose',movementTitle:'Tourism-purpose movement',movementScope:'Batch aggregate from an official file',movementLabel:'Estimated movement value · Original unit unverified',movementWarning:'Do not interpret this as people or trips until the original unit is verified. Release month is not the measurement date.',detailsTitle:'Reporting basis and model notes',modelDisclaimer:'Concept models made in Blender. Station layouts, buildings, and paths are not official coordinates or observed routes. The number and height of figures, trains, and paths do not encode statistics or nationality.',comparisonDisclaimer:'These metrics use different populations, periods, and aggregation methods. Do not add them, derive a foreign visitor share from ridership, or label them as today’s visitors.',footer:'Review assets · Values, dates, and units update in HTML · No client 3D engine',people:'people',estimate:'people · est.',missing:'No data',date:'Reporting date',reference:'Reference time',source:'Source',release:'Official file release month',unverified:'Unit unverified',unknownDate:'Date unverified'},
zh:{visualNote:'概念模型 · 非实际位置或观测路线',eyebrow:'KORETAIL · 首尔 · 梨泰院',title:'移动与外国人口',lead:'分别查看车站乘降量、区域生活人口和旅游目的移动，并保留各自的统计基准。',record:'已连接 API 的审核快照 · 非实时指标 · 日期与单位按项目显示',stationIndex:'01 · 车站移动',stationTitle:'梨泰院站 · 6号线',stationScope:'近期每日汇总',alighting:'下车',boarding:'上车',stationWarning:'乘降量包含所有乘客，并非外国游客数或店铺访问数。',livingIndex:'02 · 区域内人口',livingTitle:'短期停留外国人生活人口',livingScope:'某一基准时刻的人口估计',livingLabel:'生活人口估计值',livingWarning:'这不是实际访客计数，不可累加为每日总访客数。',movementIndex:'03 · 按目的移动',movementTitle:'旅游目的移动',movementScope:'官方文件中的批次统计',movementLabel:'移动估计值 · 原始单位尚未核实',movementWarning:'核实原始单位前，不可理解为人数或移动次数。文件发布月份不是统计基准日期。',detailsTitle:'统计基准与模型说明',modelDisclaimer:'使用 Blender 制作的概念模型。车站结构、建筑和路径并非官方坐标或观测路线。人物、列车、路径的数量和高度不表示统计值或国籍。',comparisonDisclaimer:'三个指标的人群、期间和汇总方法不同。不可相加、推算乘客中的外国人比例或改称今日访客数。',footer:'审核用资源 · 数字、日期和单位由 HTML 数据更新 · 无客户端 3D 引擎',people:'人',estimate:'人 · 估计',missing:'无数据',date:'统计日期',reference:'基准时刻',source:'来源',release:'官方文件发布月份',unverified:'单位未核实',unknownDate:'日期未核实'},
ja:{visualNote:'概念モデル · 実際の位置や観測経路ではありません',eyebrow:'KORETAIL · ソウル · 梨泰院',title:'移動と外国人人口',lead:'駅の乗降、地域の生活人口、観光目的の移動を、それぞれの集計基準とともに確認します。',record:'既存APIのレビュースナップショット · リアルタイム値ではありません · 日付と単位は項目ごとに表示',stationIndex:'01 · 駅の移動',stationTitle:'梨泰院駅 · 6号線',stationScope:'直近日別集計',alighting:'降車',boarding:'乗車',stationWarning:'乗降数は全利用者の集計です。外国人や店舗への訪問者の数ではありません。',livingIndex:'02 · 地域にいる人口',livingTitle:'短期滞在外国人生活人口',livingScope:'ある基準時点の推計人口',livingLabel:'生活人口の推計値',livingWarning:'実際の訪問者を数えた値ではありません。一日の総訪問者数として合算しません。',movementIndex:'03 · 目的別の移動',movementTitle:'観光目的の移動',movementScope:'公式ファイルのバッチ集計',movementLabel:'推計移動値 · 原資料の単位未確認',movementWarning:'原資料の単位が確認できるまでは人数や移動回数と解釈しません。公開月は集計基準日とは異なります。',detailsTitle:'集計基準とモデルの説明',modelDisclaimer:'Blenderで作成した概念モデルです。駅の構造・建物・経路は公式座標や観測された動線ではありません。人・列車・経路の数や高さは統計値や国籍を表しません。',comparisonDisclaimer:'三つの値は母集団・期間・集計方法が異なります。合算や外国人比率の算出、今日の訪問者数への置き換えは行いません。',footer:'レビュー用素材 · 数値・日付・単位はHTMLデータで更新 · クライアント3Dエンジンなし',people:'人',estimate:'人 · 推計',missing:'データなし',date:'集計日',reference:'基準時刻',source:'出典',release:'公式ファイル公開月',unverified:'単位未確認',unknownDate:'基準日未確認'}
};
const locale={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
let currentData=JSON.parse(document.querySelector('#review-data').textContent), currentLang='ko',connectionState='captured';
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;
function metric(key,value,unit){
 const el=document.querySelector('[data-metric="'+key+'"]');
 el.classList.toggle('missing',!valid(value));
 el.querySelector('.value').textContent=valid(value)?new Intl.NumberFormat(locale[currentLang],{maximumFractionDigits:1}).format(value):copy[currentLang].missing;
 el.querySelector('.unit').textContent=valid(value)?unit:'';
}
export function setData(data,{state='captured'}={}){ currentData=data??{};connectionState=state;render(currentLang); }
export function render(lang='ko'){
 currentLang=copy[lang]?lang:'ko'; const t=copy[currentLang],d=currentData;
 document.documentElement.lang=currentLang;
 for(const el of document.querySelectorAll('[data-copy]'))el.textContent=t[el.dataset.copy]??'';
 if(connectionState==='loading'||connectionState==='unavailable')document.querySelector('[data-copy="record"]').textContent=connectionCopy[currentLang][connectionState==='loading'?'loading':'failed'];
 for(const button of document.querySelectorAll('nav button'))button.setAttribute('aria-pressed',String(button.dataset.lang===currentLang));
 metric('alighting',d.station?.alightingCount,t.people); metric('boarding',d.station?.boardingCount,t.people);
 metric('living',d.foreignLivingPopulation?.value,t.estimate);
 // Unit is intentionally blank until the official original unit has been verified.
 metric('movement',d.tourismPurposeMovement?.value,'');
 const sd=date(d.station?.referenceDate)??t.unknownDate;
 document.querySelector('[data-basis="station"]').textContent=t.date+' · '+sd+' · '+t.source+' · Seoul Open Data';
 const raw=d.foreignLivingPopulation?.referenceAt;
 const instant=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(raw)?raw.slice(0,10)+' '+raw.slice(11,16)+' KST':t.unknownDate;
 document.querySelector('[data-basis="living"]').textContent=t.reference+' · '+instant+' · '+t.source+' · Seoul Open Data';
 const rm=d.tourismPurposeMovement?.releaseMonth;
 const release=typeof rm==='string'&&/^\d{4}-\d{2}$/.test(rm)?rm:t.unknownDate;
 document.querySelector('[data-basis="movement"]').textContent=t.date+' · '+(date(d.tourismPurposeMovement?.referenceDate)??t.unknownDate)+' · '+t.release+' · '+release+' · '+t.source+' · Seoul / KT';
}
for(const [lang,label]of[['ko','한국어'],['en','English'],['zh','中文'],['ja','日本語']]){
 const b=document.createElement('button');b.type='button';b.dataset.lang=lang;b.textContent=label;b.addEventListener('click',()=>render(lang));document.querySelector('nav').append(b);
}
let connectionSequence=0, pendingController;
const connectionCopy={ko:{loading:'기존 API 집계 조회 중 · 항목별 기준일 확인 전',failed:'집계 조회 실패 · 현재 자료를 확인할 수 없습니다'},en:{loading:'Loading existing API aggregates · Dates pending',failed:'Aggregate lookup failed · Current data unavailable'},zh:{loading:'正在查询既有 API 汇总 · 日期待确认',failed:'统计查询失败 · 当前数据不可用'},ja:{loading:'既存APIの集計を読み込み中 · 基準日確認前',failed:'集計の取得に失敗しました · 現在の資料を確認できません'}};
export async function connect(options={}){
 const sequence=++connectionSequence; pendingController?.abort(); pendingController=new AbortController();
 setData({},{state:'loading'});
 try{
  const data=await readExistingSummary({...options,signal:pendingController.signal});
  if(sequence!==connectionSequence)return {state:'superseded'};
  setData(data,{state:'ready'});return {state:'ready',data};
 }catch(error){
  if(sequence!==connectionSequence)return {state:'superseded'};
  setData({},{state:'unavailable'});
  return {state:'unavailable',reason:error.name==='AbortError'?'aborted':'read_failed'};
 }
}
window.koretailSeoulFlow={setData,render,connect,snapshot:structuredClone(currentData)};
render();