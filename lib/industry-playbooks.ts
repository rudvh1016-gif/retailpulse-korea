import type { Lang } from '../app/retailpulse-data';
import type { IndustryId } from './industry-guidance';

type Copy = Record<Lang, string>;
const l = (ko: string, en: string, zh: string, ja: string): Copy => ({ ko, en, zh, ja });
export interface OperatingPriority { title: Copy; action: Copy; reason: Copy }
interface Playbook { focus: Copy; priorities: OperatingPriority[]; record: Copy; airport: Copy }

/** Editorial operating guidance. No live signal is interpreted as store sales,
 * customer nationality, staffing headcount or an automatic order quantity. */
export const industryPlaybooks: Record<IndustryId, Playbook> = {
  beauty: {
    focus: l('고객이 비교하고, 시험하고, 구매하기까지 막히는 지점을 줄이세요.', 'Remove friction between comparing, trying and buying.', '减少从比较、试用到购买的阻碍。', '比較・試用・購入の間の滞りを減らしましょう。'),
    priorities: [
      {
        title: l('품목보다 색상·용량 단위로 재고 확인', 'Check stock by shade and size', '按色号与容量查库存', '色番・容量ごとに在庫確認'),
        action: l('선케어·마스크팩·기초·색조를 나눠 판매 가능 수량과 창고 재고를 대조하세요. 인기 여부는 자체 판매 기록으로 확인하고, 품절 옵션의 대체 색상·용량과 가격 차이를 안내표로 준비하세요.', 'Separate sun care, masks, skin care and makeup; reconcile sellable shelf and stockroom quantities. Use your own sales records to identify popular options, then list alternative shades, sizes and price differences for missing ones.', '按防晒、面膜、护肤和彩妆核对可售数量与仓库库存。用本店销售记录判断畅销选项，并列出缺货色号或容量的替代品及价差。', '日焼け止め・マスク・基礎化粧品・メイクを分け、販売可能な店頭在庫と倉庫在庫を照合。人気は自店の販売記録で確認し、欠品した色番・容量の代替品と価格差を用意します。'),
        reason: l('같은 상품도 고객이 찾는 옵션이 없으면 판매로 이어지지 않습니다. 지역 인구만으로 특정 상품의 수요를 정할 수 없습니다.', 'A stocked product may still lack the requested option. Area population cannot establish demand for a specific product.', '有同款商品不等于有所需选项，区域人口不能证明具体商品需求。', '同じ商品でも希望の仕様がなければ購入につながりません。地域人口だけで個別商品の需要は判断できません。'),
      },
      {
        title: l('상담과 테스터 이용을 한 흐름으로', 'Connect consultation and testers', '衔接咨询与试用', '相談からテスターへ'),
        action: l('사용 목적·선호 제형·예산을 먼저 확인하고 제품 표시사항으로 차이를 설명하세요. 일회용 도구, 테스터 교체·청소 기록을 점검하고 테스터를 판매 재고와 분리하세요. 성분·주의사항은 공식 제품 안내로 확인하세요.', 'Ask about intended use, texture preference and budget; explain differences using product labels. Check single-use tools and tester cleaning/replacement records, and separate testers from sellable stock. Refer ingredient and precaution questions to official product information.', '先询问用途、质地偏好和预算，依据标签说明差异。检查一次性工具及试用品清洁更换记录，试用品与可售库存分开；成分和注意事项以官方产品说明为准。', '用途・好みの質感・予算を聞き、商品表示に沿って違いを説明。使い捨て道具とテスターの清掃・交換記録を確認し、販売在庫と分離。成分や注意事項は公式説明で確認します。'),
        reason: l('설명과 위생 관리가 함께 준비되어야 비교 상담이 끊기지 않습니다. 효능이나 피부 적합성을 임의로 단정하지 마세요.', 'Clear product information and maintained testers support continuous service. Do not promise effects or suitability for a customer’s skin.', '产品说明与试用卫生准备齐全才便于比较；勿自行保证功效或肤质适用性。', '説明と衛生管理を整えることで比較相談を続けやすくします。効果や肌への適合を断定しません。'),
      },
      {
        title: l('상담·결제·포장을 나눠 대기 확인', 'Separate advice, checkout and packing', '分开咨询、结账与包装', '相談・会計・包装の待ちを確認'),
        action: l('혼잡 예보 시간대 전에 상담 담당과 결제·포장 담당의 역할을 정하세요. 선물세트 구성·가격, 결제수단, 교환 안내를 준비하고 실제 문의 언어에 맞춰 안내물을 보완하세요. 긴 줄이 생기는 업무부터 조정하세요.', 'Before the forecast busy period, assign consultation and checkout/packing responsibilities. Prepare gift-set contents and prices, payment options and exchange information. Adapt language support to actual enquiries and adjust the task where a queue forms.', '预报繁忙时段前明确咨询与收银包装分工，准备礼盒内容及价格、支付方式和换货说明。按实际咨询语言补充指引，优先调整出现长队的环节。', '予報の混雑時間前に相談と会計・包装の分担を決めます。ギフト内容・価格、決済方法、交換案内を準備。実際の問い合わせ言語に合わせ、列ができる業務から調整します。'),
        reason: l('외국인 생활인구나 항공사 국적은 고객의 언어·구매 취향이 아닙니다. 실제 상담과 대기 상황을 기준으로 바꾸세요.', 'Foreign resident counts and airline nationality do not reveal a customer’s language or preferences. Use observed enquiries and queues.', '外国人生活人口和航空公司国籍不代表顾客语言或购买偏好，应看实际咨询和排队情况。', '外国人生活人口や航空会社の国籍は顧客の言語・嗜好ではありません。実際の相談と待ちで判断します。'),
      },
    ],
    record: l('색상·용량별 품절 시각, 대체품 구매 여부, 반복된 성분·가격 문의, 상담·결제 대기를 기록하세요. 발주량은 실제 판매·잔량·입고 소요일로 결정하세요.', 'Record stockout times by option, substitute purchases, repeated ingredient/price questions and consultation/checkout queues. Base orders on actual sales, remaining stock and delivery lead time.', '记录各色号容量缺货时间、替代品购买情况、重复的成分价格问题及咨询收银排队。按实际销量、余量和到货周期订货。', '仕様別の欠品時刻、代替購入、成分・価格の質問、相談・会計の待ちを記録。実販売・残量・納期を基に発注します。'),
    airport: l('액체류·향수·세트는 계산 전에 환승 여부를 확인하고, 기내 반입 가능 여부는 공식 안내로 확인해 주세요. 환승 공항의 반입 제한은 항공사에 확인하도록 안내하고, 통과된다고 약속하지 마세요.', 'For liquids, fragrances and sets, ask about connections before checkout and point to official carriage guidance. Have the airline confirm transfer restrictions; never promise clearance.', '液体、香水、套装结账前先问是否转机，并提供官方携带指引。转机限制请航空公司确认，勿保证通关。', '液体・香水・セットは会計前に乗継の有無を確認し、公式の持込案内を示します。乗継制限は航空会社に確認してもらい、通過を保証しません。'),
  },
  fashion: {
    focus: l('찾는 사이즈를 빠르게 확인하고, 피팅에서 결제까지 이어지게 하세요.', 'Make size lookup, fitting and checkout easy to follow.', '让尺码查询、试穿与结账顺畅衔接。', 'サイズ確認から試着・会計までをつなぎましょう。'),
    priorities: [
      {
        title: l('사이즈·색상별 대체안 준비', 'Prepare size and colour alternatives', '准备尺码颜色替代方案', 'サイズ・色の代替案を準備'),
        action: l('스타일·색상·사이즈별 재고를 대조하고 품절 옵션은 대체 상품과 실측 치수를 준비하세요. 해외 사이즈 표시는 브랜드 공식 대조표를 기준으로 안내하세요.', 'Check stock by style, colour and size. Prepare alternatives with garment measurements; use the brand’s official size chart for international conversions.', '按款式、颜色和尺码核对库存，缺货时准备替代款及实测尺寸，国际尺码以品牌官方对照表为准。', '型・色・サイズ別に照合し、欠品には代替商品と実寸を準備。海外サイズはブランド公式表で案内します。'),
        reason: l('브랜드별 핏이 달라 같은 사이즈 표기만으로 맞는다고 보장할 수 없습니다.', 'A shared size label does not guarantee the same fit across brands.', '不同品牌版型不同，同一尺码标记不保证合身。', '同じサイズ表記でもブランドによってフィットは異なります。'),
      },
      {
        title: l('피팅 대기와 반납 상품 분리', 'Separate fitting queues and returns', '分开试衣排队与归还商品', '試着待ちと返却品を分ける'),
        action: l('혼잡 예보와 실제 대기를 함께 보고 피팅 접수·상품 회수 역할을 배분하세요. 반납 상품을 사이즈별로 정리하고 결제 줄과 통로가 겹치는지 확인하세요.', 'Use the forecast and actual queue to assign fitting intake and item-return work. Sort returned items by size and keep checkout queues clear of aisles.', '结合拥挤预报与实际排队安排试衣接待和商品回收，按尺码整理归还品，避免收银队伍占用通道。', '予報と実際の列を見て試着受付・回収を分担。返却品をサイズ別に整理し、会計列が通路と重ならないか確認します。'),
        reason: l('피팅룸 수만 늘려도 상품 회수와 결제가 막히면 대기가 남습니다.', 'More fitting availability does not solve bottlenecks in item returns or checkout.', '仅增加试衣空间不能解决回收商品或收银堵塞。', '試着枠を増やしても回収や会計が滞ると待ちは解消しません。'),
      },
      {
        title: l('날씨에 맞는 안내와 포장', 'Adjust information and packing for weather', '按天气调整说明与包装', '天気に合わせた案内と包装'),
        action: l('강수 예보가 있으면 젖은 우산 보관과 상품 보호 포장을 점검하세요. 입구 상품 교체는 실제 문의·판매 기록을 보고 결정하고 소재 관리·교환 조건을 결제 전에 설명하세요.', 'With rain forecast, check umbrella storage and protective packing. Change entrance displays using actual enquiries and sales; explain fabric care and exchange conditions before payment.', '有降雨预报时检查雨伞存放和防水包装。根据实际咨询及销售调整入口陈列，并在付款前解释面料护理和换货条件。', '雨予報では傘置場と商品保護包装を確認。入口の陳列変更は実際の質問・販売を基に決め、素材の扱いと交換条件を会計前に案内します。'),
        reason: l('비 예보는 운영 준비의 근거이며 의류 판매 증가의 증거는 아닙니다.', 'Rain informs preparation; it is not evidence of higher apparel sales.', '降雨预报可用于运营准备，不是服装销量上升的证据。', '雨予報は準備の材料であり、衣料売上増の証拠ではありません。'),
      },
    ],
    record: l('사이즈별 품절, 피팅 대기, 구매하지 않은 이유, 반품·교환 사유를 기록해 재고와 안내를 조정하세요.', 'Record size stockouts, fitting queues, reasons for not buying and return/exchange reasons to refine stock and service.', '记录尺码缺货、试衣排队、未购买及退换原因，用于调整库存与说明。', 'サイズ欠品、試着待ち、見送り・返品交換の理由を記録し、在庫と案内を見直します。'),
    airport: l('시간이 급한 손님에게는 사이즈 확인, 계산, 포장 순서로 안내하세요. 수선·배송은 확실히 마칠 수 있는 시점과 받는 방법만 알려 주세요.', 'For travellers short on time: sizing, checkout, packing. For alterations or shipping, give only confirmed completion and receipt details.', '赶时间的旅客按尺码确认、收银、包装的顺序办理。修改或配送只说明已确认的完成时间和收货方式。', '急ぐ旅客にはサイズ確認・会計・包装の順で案内。補正・配送は確認できた完了時点と受取方法だけを伝えます。'),
  },
  food: {
    focus: l('주문량보다 조리·픽업·좌석의 병목을 먼저 확인하세요.', 'Check preparation, pickup and seating bottlenecks.', '先检查制作、取餐与座位的瓶颈。', '調理・受取・席の滞りを先に確認しましょう。'),
    priorities: [
      {
        title: l('메뉴별 준비량과 소진 기록 대조', 'Compare preparation and sell-out records', '对照备料与售罄记录', '仕込みと品切れ記録を照合'),
        action: l('같은 요일의 실제 판매·잔량·폐기 기록으로 준비량을 잡고, 재료를 공유하는 메뉴의 소진 순서를 확인하세요. 행사나 혼잡 예보만 보고 한 번에 과다 준비하지 마세요.', 'Plan from actual same-weekday sales, leftovers and waste. Check which menus share ingredients; avoid a large batch solely because an event or busy period is forecast.', '依据同星期实际销量、余量和废弃记录备料，确认共用原料的消耗顺序，勿仅凭活动或拥挤预报大量备料。', '同じ曜日の実販売・残量・廃棄から仕込み量を決め、共通材料の消耗を確認。イベントや混雑予報だけで大量に仕込みません。'),
        reason: l('지역 혼잡은 주문량이 아니며 메뉴별 조리 시간과 폐기 부담이 다릅니다.', 'Area crowding is not order volume; preparation time and waste vary by menu.', '区域拥挤不等于订单量，各菜单制作时间和损耗不同。', '地域の混雑は注文数ではなく、調理時間や廃棄負担も品目で異なります。'),
      },
      {
        title: l('주문·제조·픽업 동선 나누기', 'Separate ordering, preparation and pickup', '分开点单、制作与取餐', '注文・調理・受取動線を分ける'),
        action: l('포장과 매장 주문의 픽업 위치를 안내하고 실제 밀린 주문을 기준으로 예상 대기를 알리세요. 음료 제조·결제·완료품 전달 중 막히는 업무에 역할을 재배치하세요.', 'Signpost takeaway and dine-in pickup and explain waiting times using the actual backlog. Reassign responsibilities at the bottleneck: drinks, payment or handoff.', '标明外带与堂食取餐点，按实际积单说明等候时间，并在饮品制作、收银或出餐的堵塞环节调整分工。', '持帰り・店内注文の受取場所を案内し、実際の未処理注文から待ち時間を伝えます。飲料・会計・受渡しの滞る業務に分担を調整します。'),
        reason: l('좌석이 비어 있어도 제조 대기가 길 수 있어 대기 원인을 나눠 봐야 합니다.', 'Empty seats do not rule out a preparation queue; identify the cause separately.', '有空座位也可能制作积压，需分别确认等候原因。', '空席があっても調理待ちは生じるため、原因を分けて確認します。'),
      },
      {
        title: l('메뉴 안내와 실내 대기 점검', 'Check menu information and indoor queues', '检查菜单说明与室内等候', 'メニュー説明と屋内待機を確認'),
        action: l('알레르기 문의는 확인된 원재료표로 응대하고 모르는 내용은 조리 담당에게 확인하세요. 비가 오거나 주변 행사가 겹치면 대기 줄이 출입구·픽업대를 가리는지 현장에서 점검하세요.', 'Answer allergen questions from verified ingredient information and check uncertainties with the kitchen. During rain or nearby events, inspect whether queues block entrances or pickup.', '过敏原咨询依据已确认的原料表，不确定时询问厨房。降雨或周边活动期间，现场检查队伍是否挡住入口和取餐台。', 'アレルギーの質問は確認済み原材料表で対応し、不明点は調理担当へ確認。雨や近隣イベント時は列が入口・受取口を塞がないか現地で確認します。'),
        reason: l('행사 일정과 날씨는 사전 점검 계기이며 개별 매장의 방문을 보장하지 않습니다.', 'Events and weather prompt checks; they do not guarantee visits to your store.', '活动和天气是提前检查的契机，不保证门店客流。', '催しと天気は点検のきっかけで、個店への来店を保証しません。'),
      },
    ],
    record: l('메뉴별 품절 시각·폐기량, 주문부터 전달까지의 대기, 좌석과 포장 비중을 자체 기록으로 비교하세요.', 'Compare menu sell-out times and waste, order-to-handoff waits and dine-in/takeaway mix using your own records.', '用本店记录比较菜单售罄时间、损耗、下单至取餐等候以及堂食外带比例。', '品目別の品切れ・廃棄、注文から受渡しの待ち、店内・持帰り構成を自店記録で比較します。'),
    airport: l('주문 전에 음식이 나오기까지 필요한 실제 시간(밀린 주문 포함)을 먼저 알리고, 빨리 나오는 메뉴와 포장 메뉴를 안내하세요. 항공편 지연만으로 재료를 늘리거나 영업시간을 연장하지 마세요.', 'Before ordering, state the real wait including the queue, and offer quick or takeaway items. A flight delay alone does not justify extra prep or longer hours.', '下单前说明实际等候时间（含积压订单），推荐快速菜单或外带。勿仅因航班延误增加备料或延长营业。', '注文前に実際の待ち時間（溜まった注文を含む）を伝え、早いメニューや持帰りを案内。遅延だけで増産や営業延長をしません。'),
  },
  convenience: {
    focus: l('필수품을 찾기 쉽게 하고, 결제와 전문 상담을 구분하세요.', 'Make essentials easy to find and separate checkout from specialist advice.', '方便寻找必需品，区分结账与专业咨询。', '必需品を見つけやすくし、会計と専門相談を分けましょう。'),
    priorities: [
      {
        title: l('소모품·여행용품 잔량 확인', 'Check consumables and travel essentials', '检查消耗品与旅行用品余量', '消耗品・旅行用品の残量確認'),
        action: l('음료·위생용품·우산 등 취급 품목의 진열과 창고 잔량을 대조하세요. 날씨에 맞는 품목 안내는 준비하되 발주는 실제 판매와 입고 일정으로 결정하세요.', 'Check shelf and stockroom quantities for the drinks, hygiene goods and umbrellas you stock. Prepare weather-relevant signs, but order from actual sales and delivery schedules.', '核对所售饮料、卫生用品、雨伞等的陈列与库存。准备天气相关指引，订货仍依据实际销售和到货安排。', '飲料・衛生用品・傘など取扱商品の店頭と倉庫残量を照合。天気に合う案内を用意し、発注は実販売と入荷予定で判断します。'),
        reason: l('생활 편의품과 의약품은 같은 구매 판단으로 묶을 수 없습니다.', 'Convenience goods and medicines need different purchase decisions.', '生活用品和药品不能采用相同的购买判断。', '日用品と医薬品は同じ購入判断でまとめられません。'),
      },
      {
        title: l('결제 오류와 대기 동선 점검', 'Check payments and queue placement', '检查支付及排队位置', '決済と待機動線を点検'),
        action: l('해외카드·간편결제 이용 가능 여부와 영수증 안내를 직원끼리 확인하세요. 대기 줄이 상품 통로를 막으면 결제 대기 위치를 바꾸고 반복 오류를 기록하세요.', 'Confirm accepted foreign cards and mobile payments and receipt instructions with staff. Move queues clear of aisles and record recurring payment errors.', '向员工确认可用境外卡、移动支付及收据说明。队伍挡住货架通道时调整排队位置并记录重复支付错误。', '海外カード・モバイル決済の対応と領収書案内を共有。列が通路を塞ぐ場合は位置を変え、繰返す決済エラーを記録します。'),
        reason: l('구매가 짧게 끝나는 매장일수록 결제 문제가 전체 대기를 만들 수 있습니다.', 'Payment issues can hold up the whole queue in a quick-purchase store.', '快速购买型门店的支付问题可能拖慢整条队伍。', '短時間購入の店では決済の問題が列全体の待ちにつながります。'),
      },
      {
        title: l('약국 상담은 약사에게 연결', 'Route medicine questions to the pharmacist', '药品咨询交由药师', '医薬品の相談は薬剤師へ'),
        action: l('약국은 복용법·상호작용·증상 문의를 약사에게 연결하고 확인된 제품 설명을 제공하세요. 편의점은 취급 가능한 상품 안내와 결제 안내를 분리해 준비하세요.', 'In pharmacies, refer dosage, interactions and symptom questions to the pharmacist and use verified product information. In convenience stores, keep stocked-product and payment guidance distinct.', '药店将用法、相互作用和症状问题交给药师，并提供确认过的产品说明；便利店分别准备所售商品与支付指引。', '薬局では用法・相互作用・症状の質問を薬剤師につなぎ、確認済みの説明を提供。コンビニでは取扱商品と決済の案内を分けます。'),
        reason: l('혼잡이나 국적 자료로 의약품을 추천하거나 복용 안내를 대신할 수 없습니다.', 'Crowding or nationality data cannot select medicines or replace professional advice.', '拥挤或国籍数据不能用于推荐药品或代替专业用药咨询。', '混雑や国籍の資料で薬を勧めたり服薬相談を代替したりできません。'),
      },
    ],
    record: l('품절·결제 실패·반복 문의를 상품과 시간대별로 기록하세요. 민감한 건강정보는 운영 메모에 남기지 마세요.', 'Record stockouts, payment failures and common questions by item and period; keep sensitive health information out of operating notes.', '按商品和时段记录缺货、支付失败及重复问题，运营笔记不记录敏感健康信息。', '商品・時間帯別に欠品、決済失敗、よくある質問を記録。運営メモに機微な健康情報は残しません。'),
    airport: l('필수품 위치와 계산 방법을 한눈에 보이게 하세요. 기내·목적지 반입은 목적지·항공사 공식 안내로 확인하고, 약 관련 질문은 약사에게 연결하세요.', 'Make essentials and payment info easy to find. Check carriage rules with destination and airline guidance; refer medicine questions to a pharmacist.', '让必需品位置和支付方式一目了然。携带限制以目的地和航空公司官方信息为准，药品问题转交药师。', '必需品の場所と決済方法をひと目で分かるように。持込は目的地・航空会社の公式案内で確認し、薬の相談は薬剤師へつなぎます。'),
  },
  popup: {
    focus: l('입장 조건·대기·체험 시간을 한 번에 알 수 있게 하세요.', 'Show entry rules, queues and session duration together.', '一并说明入场条件、等候和体验时长。', '入場条件・待ち・体験時間を一度に伝えましょう。'),
    priorities: [
      {
        title: l('예약과 현장 입장 기준 정리', 'Clarify booking and walk-in rules', '明确预约与现场入场规则', '予約・当日入場の基準を整理'),
        action: l('운영시간, 예약 필요 여부, 현장 접수 위치, 체험 소요 시간과 참여 조건을 입구에 모으세요. 일정 변경은 직원 안내와 게시물에 함께 반영하세요.', 'Put hours, reservation requirements, walk-in registration, session duration and participation conditions at the entrance. Keep staff instructions and signs aligned when plans change.', '入口集中展示营业时间、预约要求、现场登记点、体验时长和参与条件，变更时同步员工说明与公告。', '営業時間、予約要否、当日受付、所要時間、参加条件を入口に集約。変更はスタッフ案内と掲示に同時反映します。'),
        reason: l('입장 가능 여부를 뒤늦게 알면 불필요한 대기와 문의가 늘어납니다.', 'Late discovery of entry conditions creates avoidable waits and enquiries.', '迟知入场条件会增加无效等候与咨询。', '入場条件を後から知ると不要な待ちや質問が増えます。'),
      },
      {
        title: l('대기 줄과 체험 회차 분리', 'Separate waiting and session flow', '分开排队与体验场次', '待機列と体験の流れを分ける'),
        action: l('현장 대기와 예약 확인 동선을 분리하고 실제 체험 종료 속도로 다음 입장을 안내하세요. 비·주변 행사 때는 승인된 대기 공간과 비상 통로를 다시 확인하세요.', 'Separate walk-in queues from reservation checks and use actual session completion to guide the next entry. Recheck approved waiting space and emergency routes during rain or nearby events.', '分开现场排队和预约核验，按实际体验结束进度安排入场；雨天或附近活动时再次检查获准等候空间与应急通道。', '当日待機と予約確認を分け、実際の終了状況から次の入場を案内。雨や近隣催事時は承認済み待機場所と非常通路を再確認します。'),
        reason: l('주변 인구가 많아도 이 체험의 대기나 입장 인원은 별도 확인이 필요합니다.', 'Nearby population does not establish the queue or attendance for this experience.', '周边人口不能代表本体验的排队或入场人数。', '周辺人口からこの体験の待ちや参加人数は分かりません。'),
      },
      {
        title: l('체험 소모품과 재설정 시간 확보', 'Prepare supplies and session reset', '备足耗材与场次复位时间', '消耗品と次回準備を確保'),
        action: l('회차별 소모품과 장비 상태를 점검하고 체험 종료 후 정리 담당을 정하세요. 판매가 함께 있다면 체험 대기와 구매 결제를 분리하세요.', 'Check session supplies and equipment and assign reset responsibilities. If products are sold, separate experience queues from purchase checkout.', '检查每场耗材和设备并明确结束后的整理分工；同时售卖商品时分开体验队伍与购物结账。', '回ごとの消耗品と機材を確認し、終了後の整理を分担。販売も行う場合は体験待ちと購入会計を分けます。'),
        reason: l('체험 자체보다 회차 사이 정리가 다음 입장을 늦출 수 있습니다.', 'Resetting between sessions can delay entry more than the experience itself.', '场次间整理可能比体验本身更影响下一场入场。', '体験そのものより回の間の整理で次の入場が遅れることがあります。'),
      },
    ],
    record: l('회차별 실제 소요 시간·대기·미참여 사유·소모품 잔량을 기록하세요. 체험 참여와 상품 구매는 별도 집계하세요.', 'Record actual session duration, waits, non-participation reasons and supplies. Count participation separately from purchases.', '记录每场实际时长、等候、未参与原因和耗材余量；体验参与与购买分别统计。', '各回の実所要時間・待ち・不参加理由・消耗品残量を記録。体験参加と購入は別集計にします。'),
    airport: l('체험 전에 체험·대기 시간을 알려 주세요. 공항이 허가한 구역 안에서만 운영하고, 탑승 동선과 비상 통로를 막지 않는지 현장 관리자와 확인하세요.', 'Say how long the session and wait take before starting. Stay within approved airport space and confirm with the site manager that boarding and emergency routes stay clear.', '参与前说明体验和等候时间。只在机场批准区域内运营，并与现场负责人确认不妨碍登机和应急通道。', '参加前に体験と待ち時間を伝えます。承認された区画内でのみ運営し、搭乗動線と非常通路を塞がないか現地管理者と確認します。'),
  },
  tourism: {
    focus: l('도착부터 체크인·출발까지 필요한 안내를 연결하세요.', 'Connect arrival, check-in and onward-travel information.', '衔接抵达、入住与出发所需信息。', '到着・チェックイン・出発の案内をつなぎましょう。'),
    priorities: [
      {
        title: l('예약 고객의 도착·체크인 확인', 'Confirm booked arrivals and check-in', '确认预约客人的抵达与入住', '予約客の到着・チェックイン確認'),
        action: l('예약 명단의 도착 예정과 실제 연락 내용을 대조해 체크인·짐 보관 담당을 정하세요. 공항 입국 예상 인원을 숙소 예약 인원으로 환산하지 마세요.', 'Compare booked arrival plans with actual guest updates to assign check-in and luggage work. Do not turn airport arrival forecasts into accommodation bookings.', '对照预约抵达计划与客人实际联系内容安排入住及行李寄存，不将机场入境预测换算为住宿预订。', '予約の到着予定と実際の連絡を照合し、受付・荷物対応を分担。空港入国予想を宿泊予約数に換算しません。'),
        reason: l('실제 서비스 준비의 기준은 예약과 고객 연락입니다.', 'Bookings and guest communication are the basis for service preparation.', '实际服务准备以预订和客人联系为依据。', '実際のサービス準備は予約と顧客の連絡が基準です。'),
      },
      {
        title: l('날씨·행사에 맞춰 안내 검증', 'Verify weather and event guidance', '核实天气与活动指引', '天気・催事に合わせ案内を確認'),
        action: l('선택한 날짜의 날씨와 행사 운영 여부를 확인하고 실내 대안·휴관·예약 필요 여부를 안내하세요. 이동 시간과 영업시간은 해당 시설·교통기관에서 다시 확인하세요.', 'Check the selected date’s weather and event status; explain indoor alternatives, closures and bookings. Reconfirm travel times and opening hours with the venue or transport operator.', '核对所选日期天气和活动状态，说明室内备选、休馆与预约要求；交通时间和营业时间向设施或交通机构再次确认。', '選択日の天気と催事開催を確認し、屋内代案・休館・予約要否を案内。移動時間と営業時間は施設・交通機関で再確認します。'),
        reason: l('지난 자료나 행사 목록만으로 당일 입장 가능 여부를 보장할 수 없습니다.', 'Historical data or an event listing cannot guarantee same-day admission.', '历史资料或活动列表不能保证当日可入场。', '過去資料やイベント一覧だけでは当日入場を保証できません。'),
      },
      {
        title: l('인계 메모와 다국어 안내 정리', 'Prepare handoffs and language support', '整理交接与多语言说明', '引継ぎと多言語案内を整理'),
        action: l('짐 보관·체크아웃·픽업 장소·연락 방법을 한 장에 모으고 변경된 약속을 다음 근무자에게 전달하세요. 언어 지원은 실제 예약 요청으로 준비하세요.', 'Collect luggage, checkout, pickup-point and contact information in one handout, and pass changed arrangements to the next shift. Prepare language support from actual booking requests.', '将寄存、退房、接客点和联系方式整理成一页，变更安排交接给下一班；语言服务按实际预约要求准备。', '荷物・チェックアウト・集合場所・連絡方法を一枚にまとめ、変更事項を次の勤務へ引継ぎ。言語対応は実際の予約依頼で準備します。'),
        reason: l('항공사 등록 국가가 고객의 국적이나 사용하는 언어를 뜻하지 않습니다.', 'An airline’s registry country does not identify a guest’s nationality or language.', '航空公司注册国家不代表客人的国籍或使用语言。', '航空会社の登録国は顧客の国籍や使用言語を意味しません。'),
      },
    ],
    record: l('실제 체크인·픽업 지연, 자주 찾는 안내, 인계 누락을 기록해 다음 근무 안내에 반영하세요.', 'Record actual check-in/pickup delays, frequent questions and missed handoffs for the next shift.', '记录实际入住或接送延迟、常见咨询与交接遗漏，并用于下一班说明。', '実際の受付・送迎遅延、頻出案内、引継ぎ漏れを記録し次の勤務へ反映します。'),
    airport: l('손님이 확인해 준 항공편·터미널·만날 곳으로 픽업을 준비하고, 변경이 없는지 다시 확인하세요. 항공기 도착 시각을 입국장에서 만나는 시각으로 확정하지 마세요.', 'Prepare pickups from the confirmed flight, terminal and meeting point, and recheck for changes. An arrival time is not a firm meeting time.', '按客人确认的航班、航站楼和会面地点准备接机，并复核变更。飞机到达时间不等于会面时间。', 'お客様が確認した便・ターミナル・集合場所で送迎を準備し、変更を再確認します。到着時刻を会える時刻と確定しません。'),
  },
  liquor: {
    focus: l('계산과 포장이 막히지 않게 하고, 구매 한도·반입 안내를 정확히 하세요.', 'Keep checkout and packing moving, and give accurate limit and carriage guidance.', '保持收银与包装顺畅，准确说明购买限额与携带规定。', '会計と包装を滞らせず、購入限度・持込の案内を正確に。'),
    priorities: [
      {
        title: l('자주 팔리는 용량·세트 재고 확인', 'Check frequently sold sizes and sets', '核对常售容量与套装库存', 'よく売れる容量・セットの在庫確認'),
        action: l('자체 판매 기록으로 자주 팔리는 용량·세트를 정하고 판매 재고와 창고 재고를 대조하세요. 품절 시 대체 상품과 가격 차이를 안내표로 준비하세요.', 'Use your own sales records to identify frequently sold sizes and sets, then reconcile shelf and stockroom stock. Prepare alternatives and price differences for anything out of stock.', '用本店销售记录确定常售容量与套装，核对可售与仓库库存；缺货时准备替代品及价差说明。', '自店の販売記録でよく売れる容量・セットを決め、店頭と倉庫の在庫を照合。欠品時の代替品と価格差を用意します。'),
        reason: l('출국 예상 인원이나 목적지만으로 특정 상품의 수요를 정할 수 없습니다.', 'Expected departures or destinations cannot establish demand for a specific product.', '预计出境人数或目的地不能决定具体商品需求。', '出国予想や行き先だけで個別商品の需要は判断できません。'),
      },
      {
        title: l('계산과 포장 역할 나누기', 'Split checkout and packing', '分开收银与包装', '会計と包装の分担'),
        action: l('혼잡 예고 시간대 전에 계산 담당과 포장 담당을 정하고, 파손 방지 포장재와 봉투 잔량을 확인하세요. 줄이 길어지는 업무부터 조정하세요.', 'Before the busy notice hours, assign checkout and packing roles and check protective packing and bags. Adjust the task where the queue grows first.', '在预告的繁忙时段前分配收银与包装职责，检查防破损包装材料和袋子余量，优先调整排队变长的环节。', '混雑予告の時間帯前に会計と包装の担当を決め、破損防止の包装材と袋の残量を確認。列が伸びる業務から調整します。'),
        reason: l('계산과 포장이 한 줄에 몰리면 대기가 길어집니다.', 'Queues grow when checkout and packing share one line.', '收银与包装挤在同一队列时，等候会变长。', '会計と包装が一つの列に集まると待ちが長くなります。'),
      },
      {
        title: l('구매 한도·반입 안내를 공식 기준으로', 'Keep limit and carriage guidance official', '以官方标准说明限额与携带', '購入限度・持込案内を公式基準で'),
        action: l('면세 한도, 액체류 반입, 환승 시 휴대 조건은 관세청·항공사의 최신 공식 안내로 확인해 안내하세요. 환승 공항 통과를 보장하지 마세요.', 'Give duty-free limits, liquid carriage and transfer conditions from the latest customs and airline guidance. Do not guarantee clearance at a transfer airport.', '免税限额、液体携带与转机条件以海关和航空公司的最新官方说明为准，勿保证转机机场放行。', '免税限度・液体持込・乗継時の条件は税関と航空会社の最新公式案内で確認して案内。乗継空港の通過は保証しません。'),
        reason: l('규정은 변경될 수 있고 공항마다 다릅니다.', 'Rules change and differ by airport.', '规定可能变化，且各机场不同。', '規定は変わることがあり、空港ごとに異なります。'),
      },
    ],
    record: l('품목별 품절 시각, 대체품 구매 여부, 계산·포장 대기, 반복된 한도 문의를 기록하세요. 발주량은 실제 판매·잔량·입고 소요일로 정하세요.', 'Record stockout times, substitute purchases, checkout and packing queues and repeated limit questions. Base orders on actual sales, remaining stock and lead time.', '记录各商品缺货时间、替代品购买、收银包装排队及重复的限额咨询；按实际销量、余量和到货周期订货。', '品目別の欠品時刻、代替購入、会計・包装の待ち、限度の質問を記録。発注は実販売・残量・納期で決めます。'),
    airport: l('‘출국장 예상 승객’은 출국장 단위 예상치, ‘출발편’은 탑승구 단위 항공편 수입니다. 두 숫자를 더하거나 매장 손님 수로 바꾸지 말고, 매장 앞 실제 줄과 함께 보세요.', 'The departure-hall forecast is per hall; departures are counted per gate. Do not add them or read them as store visitors; check them against the real queue at your store.', '出境大厅预告按大厅，出发航班按登机口。不可相加，也不能当作到店人数，请结合店前实际排队。', '出国場の予告は出国場単位、出発便は搭乗口単位です。足したり来店客数に換えたりせず、店前の実際の待ちと合わせて見ます。'),
  },
  luxury: {
    focus: l('상담이 끊기지 않게 인력과 대기 응대를 정하세요.', 'Keep consultations uninterrupted with clear staffing and waiting service.', '明确人员与等候接待，使咨询不中断。', '人員と待ち対応を決めて相談を途切れさせない。'),
    priorities: [
      {
        title: l('상담 인력과 예약 확인', 'Confirm consultants and bookings', '确认咨询人员与预约', '相談スタッフと予約の確認'),
        action: l('상담 가능한 인력과 예약 시간을 확인해 역할을 정하세요. 예약이 없는 시간에도 대기 고객 응대 담당을 한 명 정해 두세요.', 'Confirm who can consult and at which booked times, and set roles. Keep one person on waiting customers even between bookings.', '确认可接待咨询的人员与预约时间并分配职责，没有预约时也安排一人负责等候顾客。', '相談できるスタッフと予約時間を確認し役割を決めます。予約のない時間も待ち客対応を一人決めておきます。'),
        reason: l('필요한 인원 수는 실제 예약과 대기로 판단합니다. 출국 예상 인원은 구매 고객 수가 아닙니다.', 'Staffing needs come from bookings and actual waits; expected departures are not buyers.', '所需人数依据实际预约和等候判断，预计出境人数不是购买人数。', '必要な人数は実際の予約と待ちで判断します。出国予想は購入客数ではありません。'),
      },
      {
        title: l('대기 고객 응대 방식 공유', 'Share how waiting customers are served', '共享等候顾客的接待方式', '待ち客への対応方法の共有'),
        action: l('순번과 대기 안내 문구를 정해 직원과 공유하고, 탑승 시각을 궁금해하는 고객에게는 항공사 안내를 확인하도록 안내하세요.', 'Agree queue order and wait wording with staff, and ask customers who mention boarding times to check with their airline.', '确定顺序与等候说明并与员工共享，提到登机时间的顾客请其向航空公司确认。', '順番と待ちの案内文を決めて共有し、搭乗時刻を気にする顧客には航空会社の案内を確認してもらいます。'),
        reason: l('탑승 마감은 고객마다 달라 매장이 대신 보장할 수 없습니다.', 'Boarding cut-offs differ per customer and the store cannot guarantee them.', '登机截止时间因人而异，店铺无法代为保证。', '搭乗締切は顧客ごとに異なり、店舗が保証することはできません。'),
      },
      {
        title: l('인기 모델 재고와 대체 안내', 'Stock of often-asked models and alternatives', '常问款式库存与替代说明', '人気モデルの在庫と代替案内'),
        action: l('문의가 많은 모델의 재고를 미리 확인하고 대체 모델과 가격 차이를 안내할 수 있게 준비하세요.', 'Check stock of often-asked models ahead of time and prepare alternatives with price differences.', '提前确认常被询问款式的库存，并准备替代款与价差说明。', '問い合わせの多いモデルの在庫を事前に確認し、代替モデルと価格差を案内できるようにします。'),
        reason: l('인기 여부는 자체 판매와 문의 기록으로 확인합니다.', 'Popularity comes from your own sales and enquiry records.', '是否畅销以本店销售与咨询记录判断。', '人気は自店の販売と問い合わせの記録で確認します。'),
      },
    ],
    record: l('상담 대기 시간, 예약 변경, 문의가 많은 모델, 품절 시각을 기록해 다음 근무 준비에 쓰세요.', 'Record consultation waits, booking changes, often-asked models and stockout times for the next shift.', '记录咨询等候时间、预约变更、常问款式和缺货时间，用于下一班准备。', '相談の待ち時間、予約変更、よく聞かれるモデル、欠品時刻を記録し次の勤務準備に使います。'),
    airport: l('‘출국장 예상 승객’과 ‘탑승구 기준 출발편’은 세는 장소도, 기준 시각도 다릅니다. 매장 앞에 실제로 서 있는 줄을 보고 응대 인원을 조정하세요.', 'The departure-hall notice and departures by gate are different places and clocks. Adjust service staff from the actual queue at the store.', '出境大厅预告与按登机口的出发航班是不同的地点与时间轴，请按店前实际排队调整接待人员。', '出国場の予告と搭乗口基準の出発便は別の場所と時間軸です。店前の実際の待ちで対応人数を調整します。'),
  },
};

export type AirportStoreArea = 'landside' | 'airside' | 'arrival' | 'arrivalDutyFree' | 'concourse';
export const airportStoreAreas: Record<AirportStoreArea, { label: Copy; action: Copy }> = {
  landside: {
    label: l('출국장 일반구역', 'Departures · public area', '出境大厅·公共区', '出発階・一般区域'),
    action: l('매장 앞 줄과 손님 질문을 직접 보고 인원을 정하세요. 보안검색 줄은 매장 손님 수가 아닙니다.', 'Staff from the queue in front of your store and what customers ask. The security queue is not your customer count.', '按店前实际排队和顾客咨询安排人手。安检排队人数不等于门店客流。', '店前の待ち行列とお客様の質問を見て人員を決めます。保安検査の列は来店人数ではありません。'),
  },
  airside: {
    label: l('출국장 면세구역', 'Departures · duty-free area', '出境·免税区', '出国・免税区域'),
    action: l('탑승 시간을 문의하는 손님과 실제 줄을 보고 상담·계산·포장 담당을 나누세요. 액체류·환승 안내도 확인하세요.', 'Split advice, checkout and packing by the actual queue and boarding-time questions. Check liquid and transfer guidance.', '按实际排队和登机时间咨询分配接待、收银、包装，并核对液体与转机指引。', '実際の待ちと搭乗時刻の質問で相談・会計・包装を分担し、液体・乗継案内を確認します。'),
  },
  arrival: {
    label: l('입국장 일반구역', 'Arrivals · public area', '入境大厅·公共区', '到着階・一般区域'),
    action: l('입국 심사와 짐 찾기를 마치고 실제로 나오는 손님을 보며 준비하세요. 착륙 시각이나 예상 입국객 수로 매장 손님 수를 짐작하지 마세요.', 'Prepare from the travellers actually coming out after immigration and baggage. Landing times and immigration forecasts do not tell you store visits.', '按通关取行李后实际走出的旅客准备，勿用着陆时间或入境预测推断到店人数。', '入国審査と荷物受取を終えて実際に出てくる客を見て準備します。着陸時刻や審査予想を来店人数にしません。'),
  },
  arrivalDutyFree: {
    label: l('입국장 면세구역', 'Arrivals · duty-free area', '入境·免税区', '入国・免税区域'),
    action: l('입국 손님의 실제 줄과 질문으로 담당을 나누세요. 구매 조건·반입·신고는 매장과 관세청의 최신 안내로 확인하세요.', 'Split work by the actual arrival queue and questions. Check current store and customs guidance for purchase, import and declaration rules.', '按入境顾客实际排队和咨询分工。购买条件、携带入境与申报以店铺和海关最新指引为准。', '入国客の実際の待ちと質問で分担します。購入条件・持込・申告は店舗と税関の最新案内で確認します。'),
  },
  concourse: {
    label: l('탑승동', 'Concourse', '登机楼', 'コンコース'),
    action: l('매장 앞 손님 흐름과 탑승구 변경을 직접 보고 응대 순서를 조정하세요. 탑승구 번호만으로 거리나 이동 시간을 짐작하지 마세요.', 'Adjust service from the flow in front of the store and gate changes. A gate number alone does not tell distance or walking time.', '按店前实际人流和登机口变更调整接待，勿仅凭登机口号码推断距离或步行时间。', '店前の流れと搭乗口の変更で接客を調整します。搭乗口番号だけで距離や移動時間を推定しません。'),
  },
};
