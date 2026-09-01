import type { Lang } from "../app/retailpulse-data";

export type IndustryId = "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism";

/**
 * Operating guidance per business type.
 *
 * Two rules hold for everything in here. First, nothing is a prediction: no
 * figure, ratio or expected footfall appears, because the product never
 * publishes a number an official body did not publish. Second, `watch` names
 * the signal rows that are actually rendered above this section, so a reader
 * is pointed at real evidence on the same screen rather than at a claim.
 *
 * The checklist is grouped by when the work happens — before opening, during
 * the busy band, before closing — because an operator reads it at one of those
 * three moments, not as one undifferentiated list.
 */
export type ChecklistPhase = "before" | "peak" | "close";
export type ChecklistRow = [phase: ChecklistPhase, label: string, action: string];

export const checklistPhaseLabels: Record<ChecklistPhase, Record<Lang, string>> = {
  before: { ko: "문 열기 전", en: "BEFORE OPEN", zh: "开店前", ja: "開店前" },
  peak: { ko: "혼잡 시간대", en: "BUSY BAND", zh: "拥挤时段", ja: "混雑時間帯" },
  close: { ko: "마감 전", en: "BEFORE CLOSE", zh: "打烊前", ja: "閉店前" },
};

export const checklistPhaseOrder: ChecklistPhase[] = ["before", "peak", "close"];

export const industryProfiles: Record<IndustryId, {
  label: Record<Lang, string>;
  short: string;
  watch: Record<Lang, string>;
  checklist: Record<Lang, ChecklistRow[]>;
}> = {
  beauty: {
    label: { ko: "뷰티·화장품", en: "Beauty & cosmetics", zh: "美妆·化妆品", ja: "ビューティー・化粧品" }, short: "BEAUTY",
    watch: {
      ko: "위의 실시간 활동과 단기외국인 생활인구를 먼저 보세요. 외국인 방문 비중이 응대 언어와 매대 구성을 좌우합니다.",
      en: "Read live activity and short-stay foreign living population above first: the share of overseas visitors drives both staffing language and shelf mix.",
      zh: "先看上方的实时活动与短期停留外国人生活人口，境外访客比例会左右接待语种与陈列组合。",
      ja: "上のリアルタイム活動と短期滞在外国人生活人口をまず確認します。外国人比率が接客言語と売場構成を左右します。",
    },
    checklist: {
      ko: [
        ["before", "재고", "선케어·마스크팩·미니세트처럼 여행객이 찾는 품목의 잔량과 진열 위치를 확인"],
        ["before", "표기", "가격표와 성분 안내에 영문·중문 표기가 빠진 매대가 없는지 점검"],
        ["peak", "응대", "다국어 응대가 가능한 인력을 혼잡 시간대가 시작되기 전에 배치"],
        ["peak", "테스터", "테스터 위생 상태와 소진 여부를 시간대 중간에 한 번 더 확인"],
        ["close", "보충", "그날 가장 빨리 빠진 품목을 적어 다음 발주 기준으로 사용"],
        ["close", "정산", "사후면세 서류와 결제 취소 건을 당일 안에 정리"],
      ],
      en: [
        ["before", "STOCK", "Check remaining quantity and shelf position for traveller-driven items: sun care, sheet masks, mini sets"],
        ["before", "LABELS", "Look for shelves missing English or Chinese price and ingredient labels"],
        ["peak", "STAFF", "Place multilingual staff before the busy band begins"],
        ["peak", "TESTERS", "Re-check tester hygiene and whether any tester has run out midway"],
        ["close", "RESTOCK", "Write down the fastest-moving items of the day and use them for the next order"],
        ["close", "REFUNDS", "Clear tax-refund paperwork and payment cancellations the same day"],
      ],
      zh: [
        ["before", "库存", "确认防晒、面膜、旅行装等旅客常买商品的余量与陈列位置"],
        ["before", "标签", "检查是否有货架缺少英文或中文的价格与成分说明"],
        ["peak", "接待", "在拥挤时段开始前安排具备多语种能力的人员"],
        ["peak", "试用装", "时段中途再次确认试用装的卫生状况与是否用尽"],
        ["close", "补货", "记录当日售出最快的商品，作为下次订货依据"],
        ["close", "结算", "当天处理完退税单据与支付取消件"],
      ],
      ja: [
        ["before", "在庫", "日焼け止め・シートマスク・ミニセットなど旅行者需要品の残量と陳列位置を確認"],
        ["before", "表示", "英語・中国語の価格と成分表示が抜けている棚がないか点検"],
        ["peak", "接客", "混雑時間帯が始まる前に多言語対応のスタッフを配置"],
        ["peak", "テスター", "テスターの衛生状態と使い切りを時間帯の途中で再確認"],
        ["close", "補充", "その日に最も早く減った商品を記録し次の発注基準にする"],
        ["close", "精算", "免税書類と決済取消をその日のうちに整理"],
      ],
    },
  },
  fashion: {
    label: { ko: "패션·잡화", en: "Fashion & goods", zh: "时尚·杂货", ja: "ファッション・雑貨" }, short: "FASHION",
    watch: {
      ko: "위의 실시간 활동과 날씨를 함께 보세요. 비 예보는 매장 체류 시간과 피팅 대기 길이에 바로 영향을 줍니다.",
      en: "Read live activity together with the weather row above: a rain forecast changes dwell time and fitting-room queues directly.",
      zh: "把上方的实时活动与天气一起看，降水预报会直接影响店内停留时间与试衣排队。",
      ja: "上のリアルタイム活動と天気を併せて確認します。雨予報は滞在時間と試着待ちに直結します。",
    },
    checklist: {
      ko: [
        ["before", "진열", "날씨 예보에 맞춰 입구 진열을 아우터·우산 등으로 바꿀지 결정"],
        ["before", "재고", "인기 사이즈의 잔량과 창고 보충 주기를 미리 확인"],
        ["peak", "동선", "피팅 대기 줄과 결제 줄이 겹치지 않도록 동선을 분리"],
        ["peak", "피팅", "피팅룸 회전만 담당할 인력을 한 명 고정 배치"],
        ["close", "정리", "피팅 후 반납된 상품을 당일 안에 원래 자리로"],
        ["close", "안내", "한국·유럽·미국 사이즈 대조 안내물이 훼손되지 않았는지 확인"],
      ],
      en: [
        ["before", "DISPLAY", "Decide from the weather row whether the entrance display should shift to outerwear or umbrellas"],
        ["before", "STOCK", "Check remaining popular sizes and the stockroom replenishment cycle"],
        ["peak", "FLOW", "Separate the fitting queue from the checkout queue"],
        ["peak", "FITTING", "Assign one person solely to fitting-room turnover"],
        ["close", "RESET", "Return every item left after fitting to its place the same day"],
        ["close", "SIGNAGE", "Check the KR/EU/US sizing guide is still intact and legible"],
      ],
      zh: [
        ["before", "陈列", "根据天气信息决定入口陈列是否换成外套或雨具"],
        ["before", "库存", "确认热门尺码的余量与仓库补货周期"],
        ["peak", "动线", "把试衣排队与结账排队的动线分开"],
        ["peak", "试衣", "固定安排一名员工专门负责试衣间周转"],
        ["close", "归位", "当天把试穿后退回的商品全部归位"],
        ["close", "标识", "确认韩国、欧洲、美国尺码对照说明完好可读"],
      ],
      ja: [
        ["before", "陳列", "天気の行を見て入口の陳列をアウターや傘に切り替えるか判断"],
        ["before", "在庫", "人気サイズの残量と倉庫の補充サイクルを事前に確認"],
        ["peak", "動線", "試着待ちの列と会計の列が重ならないよう動線を分ける"],
        ["peak", "試着", "試着室の回転だけを担当するスタッフを一人固定配置"],
        ["close", "戻し", "試着後に戻された商品をその日のうちに元の位置へ"],
        ["close", "表示", "韓国・欧州・米国のサイズ対照表示が傷んでいないか確認"],
      ],
    },
  },
  food: {
    label: { ko: "식음료·카페", en: "Food & café", zh: "餐饮·咖啡", ja: "飲食・カフェ" }, short: "F&B",
    watch: {
      ko: "위의 날씨와 주변 행사를 먼저 보세요. 강수확률과 근처 행사 유무가 포장 주문과 좌석 회전을 가릅니다.",
      en: "Read the weather and nearby-events rows above first: rain probability and a nearby event split takeaway demand from seat turnover.",
      zh: "先看上方的天气与周边活动，降水概率与附近是否有活动会左右外带需求与翻台节奏。",
      ja: "上の天気と周辺イベントをまず確認します。降水確率と近隣の催しがテイクアウトと席回転を分けます。",
    },
    checklist: {
      ko: [
        ["before", "준비", "인기 메뉴의 사전 준비량과 재료 소진 예상 시점을 정해두기"],
        ["before", "표시", "알레르기·원산지 정보를 다국어로 비치했는지 확인"],
        ["peak", "회전", "좌석 회전 기준과 대기 안내 문구를 미리 정해 직원과 공유"],
        ["peak", "주문", "포장 주문과 매장 주문 접수 창구를 분리"],
        ["close", "위생", "냉장·냉동 온도 기록과 폐기 대상 재료를 확인"],
        ["close", "발주", "당일 품절 시각을 적어 다음 날 준비량 기준으로 사용"],
      ],
      en: [
        ["before", "PREP", "Fix prep volume for popular items and the expected run-out time"],
        ["before", "LABELS", "Confirm allergen and origin information is available in multiple languages"],
        ["peak", "TURNOVER", "Agree seat-turnover rules and queue wording with staff in advance"],
        ["peak", "ORDERS", "Split takeaway and dine-in order intake"],
        ["close", "HYGIENE", "Record fridge and freezer temperatures and check what has to be discarded"],
        ["close", "ORDERING", "Note today's sell-out times and use them to set tomorrow's prep"],
      ],
      zh: [
        ["before", "备料", "确定热门菜品的备料量与预计售罄时间"],
        ["before", "标识", "确认过敏原与原产地信息已提供多语种版本"],
        ["peak", "翻台", "提前与员工统一翻台标准与排队引导用语"],
        ["peak", "点单", "把外带点单与堂食点单的受理窗口分开"],
        ["close", "卫生", "记录冷藏冷冻温度并确认需要废弃的食材"],
        ["close", "订货", "记录当日售罄时间，作为次日备料依据"],
      ],
      ja: [
        ["before", "仕込み", "人気メニューの仕込み量と品切れ見込み時刻を決めておく"],
        ["before", "表示", "アレルギー・原産地情報を多言語で用意しているか確認"],
        ["peak", "回転", "席回転の基準と待ち案内の文言を事前にスタッフと共有"],
        ["peak", "注文", "テイクアウトと店内の注文受付を分ける"],
        ["close", "衛生", "冷蔵・冷凍温度の記録と廃棄対象の食材を確認"],
        ["close", "発注", "当日の品切れ時刻を記録し翌日の仕込み量の基準にする"],
      ],
    },
  },
  convenience: {
    label: { ko: "편의·약국", en: "Convenience & pharmacy", zh: "便利店·药店", ja: "コンビニ・薬局" }, short: "ESSENTIALS",
    watch: {
      ko: "위의 실시간 활동과 날씨를 보세요. 갑작스러운 비 예보는 우산·상비약처럼 바로 사 가는 품목의 수요와 직결됩니다.",
      en: "Read live activity and the weather row above: a sudden rain forecast maps directly onto impulse items such as umbrellas and first-aid goods.",
      zh: "查看上方的实时活动与天气，突然的降水预报直接对应雨伞、常备药等即买商品。",
      ja: "上のリアルタイム活動と天気を確認します。急な雨予報は傘や常備薬など即購入品の需要に直結します。",
    },
    checklist: {
      ko: [
        ["before", "진열", "여행용 상비품과 생활용품을 계산대 가까운 자리에 두었는지 확인"],
        ["before", "결제", "해외카드·간편결제 단말기 동작을 하루 시작 전에 시험"],
        ["peak", "계산", "계산 대기 줄이 매대 통로를 막지 않도록 줄 위치를 조정"],
        ["peak", "문의", "복용법·환불·영수증처럼 자주 나오는 문의를 다국어 안내 카드로 준비"],
        ["close", "유통기한", "유통기한이 임박한 상품과 의약품 보관 상태를 점검"],
        ["close", "보충", "그날 가장 빨리 빠진 품목을 적어 발주에 반영"],
      ],
      en: [
        ["before", "DISPLAY", "Confirm travel essentials and daily goods sit close to the counter"],
        ["before", "PAYMENT", "Test foreign card and mobile payment terminals before the day starts"],
        ["peak", "CHECKOUT", "Move the queue so it does not block the aisles"],
        ["peak", "QUESTIONS", "Keep multilingual cards for frequent questions: dosage, refunds, receipts"],
        ["close", "EXPIRY", "Check near-expiry items and medicine storage conditions"],
        ["close", "RESTOCK", "Write down the fastest-selling items and reflect them in the order"],
      ],
      zh: [
        ["before", "陈列", "确认旅行常备品与生活用品放在收银台附近"],
        ["before", "支付", "开始营业前测试境外卡与移动支付终端"],
        ["peak", "结账", "调整排队位置，避免堵塞货架通道"],
        ["peak", "咨询", "准备多语种提示卡应对服用方法、退款、收据等常见咨询"],
        ["close", "效期", "检查临期商品与药品的保存状态"],
        ["close", "补货", "记录当日售出最快的商品并反映到订货"],
      ],
      ja: [
        ["before", "陳列", "旅行常備品と日用品がレジの近くにあるか確認"],
        ["before", "決済", "海外カード・モバイル決済端末の動作を営業前に試す"],
        ["peak", "会計", "会計の待機列が売場の通路を塞がない位置に調整"],
        ["peak", "問い合わせ", "服用方法・返金・領収書など頻出の問い合わせを多言語カードで用意"],
        ["close", "期限", "期限が近い商品と医薬品の保管状態を点検"],
        ["close", "補充", "その日に最も早く減った商品を記録し発注に反映"],
      ],
    },
  },
  popup: {
    label: { ko: "팝업·체험", en: "Pop-up & experience", zh: "快闪·体验", ja: "ポップアップ・体験" }, short: "POP-UP",
    watch: {
      ko: "위의 주변 행사와 실시간 활동을 함께 보세요. 근처에 다른 행사가 겹치면 대기 줄과 입장 안내 방식을 미리 바꿔야 합니다.",
      en: "Read nearby events with live activity above: another event on the same block changes how you queue and how you word entry guidance.",
      zh: "把上方的周边活动与实时活动一起看，附近若有其他活动重叠，需提前调整排队与入场引导方式。",
      ja: "上の周辺イベントとリアルタイム活動を併せて確認します。近くで別の催しが重なる場合は待機列と入場案内を事前に変えます。",
    },
    checklist: {
      ko: [
        ["before", "회차", "체험 회차당 인원과 소요 시간을 미리 고정"],
        ["before", "게시", "예약·입장 규칙과 촬영 가능 범위를 다국어로 게시"],
        ["peak", "대기", "대기 줄 위치와 대기 안내 문구를 정리해 입구에 배치"],
        ["peak", "안전", "실내 최대 인원과 비상 통로 확보 상태를 시간대 중간에 확인"],
        ["close", "소모품", "체험용 소모품 잔량을 세어 다음 날 필요량을 산정"],
        ["close", "기록", "회차별 실제 소요 시간과 대기 길이를 적어 다음 운영에 반영"],
      ],
      en: [
        ["before", "SESSIONS", "Fix headcount and duration per session in advance"],
        ["before", "POSTING", "Post booking rules, entry rules and photography limits in multiple languages"],
        ["peak", "QUEUE", "Put the queue position and waiting guidance at the entrance"],
        ["peak", "SAFETY", "Re-check indoor capacity and clear emergency routes midway through the band"],
        ["close", "SUPPLIES", "Count remaining consumables and set tomorrow's quantity"],
        ["close", "RECORD", "Write down the real duration and queue length per session for the next run"],
      ],
      zh: [
        ["before", "场次", "提前固定每场体验的人数与时长"],
        ["before", "公告", "以多语种张贴预约规则、入场规则与拍摄范围"],
        ["peak", "排队", "在入口明确排队位置与等候引导文案"],
        ["peak", "安全", "时段中途再次确认室内最大人数与紧急通道畅通"],
        ["close", "耗材", "清点体验耗材余量并核定次日所需数量"],
        ["close", "记录", "记录各场次实际时长与排队长度，用于下次运营"],
      ],
      ja: [
        ["before", "回数", "一回あたりの人数と所要時間を事前に決める"],
        ["before", "掲示", "予約・入場ルールと撮影可能範囲を多言語で掲示"],
        ["peak", "待機", "待機列の位置と待ち案内の文言を整理して入口に配置"],
        ["peak", "安全", "屋内の最大人数と非常通路の確保を時間帯の途中で確認"],
        ["close", "消耗品", "体験用消耗品の残量を数え翌日の必要量を算定"],
        ["close", "記録", "回ごとの実所要時間と待ち列の長さを記録し次の運営に反映"],
      ],
    },
  },
  tourism: {
    label: { ko: "관광·숙박", en: "Tourism & stay", zh: "旅游·住宿", ja: "観光・宿泊" }, short: "TOURISM",
    watch: {
      ko: "공항 화면의 공식 예상 출국객 흐름과 이 지역의 실시간 활동을 함께 보세요. 체크인·체크아웃이 공항 혼잡과 겹치는지가 핵심입니다.",
      en: "Read the official expected-departure flow on the Airport screen together with live activity here: the question is whether check-in and check-out overlap the airport's busy band.",
      zh: "把机场页面的官方预计出境客流与本地区实时活动一起看，关键是入住与退房是否与机场拥挤时段重叠。",
      ja: "空港画面の公式予想出国客の流れと、この地域のリアルタイム活動を併せて確認します。チェックイン・チェックアウトが空港の混雑と重なるかが要点です。",
    },
    checklist: {
      ko: [
        ["before", "일정", "체크인·체크아웃 시간이 공항 혼잡 시간대와 겹치는지 확인"],
        ["before", "안내", "교통·환승 안내와 주변 지도 자료를 다국어로 준비"],
        ["peak", "짐", "짐 보관 수요가 몰리는 시간대에 보관 공간과 담당자를 확보"],
        ["peak", "프런트", "체크인 대기 줄과 문의 응대 창구를 분리"],
        ["close", "객실", "다음 날 이른 체크인 요청이 있는 객실을 먼저 정비"],
        ["close", "인계", "다음 날 공항 혼잡 시간대를 야간 근무자에게 인계"],
      ],
      en: [
        ["before", "SCHEDULE", "Check whether check-in and check-out overlap the airport busy band"],
        ["before", "GUIDANCE", "Prepare transit guidance and area maps in multiple languages"],
        ["peak", "LUGGAGE", "Secure storage space and a named owner for concentrated luggage demand"],
        ["peak", "FRONT DESK", "Separate the check-in queue from the enquiry desk"],
        ["close", "ROOMS", "Service rooms with an early check-in request for tomorrow first"],
        ["close", "HANDOVER", "Hand tomorrow's airport busy band to the night shift"],
      ],
      zh: [
        ["before", "日程", "确认入住与退房时间是否与机场拥挤时段重叠"],
        ["before", "指引", "以多语种准备交通换乘说明与周边地图"],
        ["peak", "行李", "为行李寄存需求集中的时段确保空间与专责人员"],
        ["peak", "前台", "把入住排队与咨询受理分开"],
        ["close", "客房", "优先整备次日有提前入住需求的客房"],
        ["close", "交接", "把次日机场拥挤时段交接给夜班人员"],
      ],
      ja: [
        ["before", "日程", "チェックイン・チェックアウトが空港の混雑時間帯と重なるか確認"],
        ["before", "案内", "交通・乗り換え案内と周辺地図を多言語で用意"],
        ["peak", "荷物", "荷物預かり需要が集中する時間帯に保管スペースと担当者を確保"],
        ["peak", "フロント", "チェックイン待ちの列と問い合わせ窓口を分ける"],
        ["close", "客室", "翌日の早いチェックイン希望がある客室を先に整備"],
        ["close", "引き継ぎ", "翌日の空港混雑時間帯を夜勤担当に引き継ぐ"],
      ],
    },
  },
};
