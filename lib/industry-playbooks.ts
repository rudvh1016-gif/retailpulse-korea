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
    airport: l('액체류·향수·세트 상품은 결제 전에 고객의 환승 여부와 휴대 조건을 확인할 수 있도록 공식 안내를 연결하세요. 면세 포장·영수증 보관 안내는 해당 매장 절차와 항공사 확인에 따르며, 환승 공항 통과를 보장하지 마세요.', 'For liquids, fragrances and sets, link official carriage guidance before purchase and ask whether the traveller is connecting. Follow store procedures for duty-free packaging and receipts; have the airline confirm transfer restrictions rather than guaranteeing clearance.', '液体、香水和套装结账前提供官方携带指引，并确认是否转机。免税包装及收据按门店流程处理，转机限制请航空公司确认，勿保证通关。', '液体・香水・セットは購入前に公式の持込案内と乗継の有無を確認。免税包装・領収書は店舗手順に従い、乗継制限は航空会社へ確認し、通過を保証しません。'),
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
    airport: l('탑승까지 여유가 적은 고객은 사이즈 확인·결제·포장 순서를 먼저 안내하세요. 수선·배송을 제공한다면 실제 가능한 완료 시점과 수령 방법만 설명하세요.', 'For travellers short on time, explain sizing, checkout and packing first. If alterations or shipping are available, state only confirmed completion and receipt arrangements.', '赶时间的旅客先说明尺码确认、收银和包装顺序。若提供修改或配送，只说明已确认的完成时间和收货方式。', '時間の少ない旅客にはサイズ確認・会計・包装の順序を先に案内。補正・配送は確認できた完了時点と受取方法だけを伝えます。'),
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
    airport: l('탑승 시각을 확인한 고객에게 실제 조리 대기를 먼저 설명하고, 제공 가능한 빠른 메뉴·포장 선택지를 안내하세요. 운항 지연만으로 주문 증가나 영업 연장을 결정하지 마세요.', 'Tell travellers the actual preparation queue before they order and offer available quick or takeaway options. A flight delay alone does not justify extra preparation or extended hours.', '旅客下单前说明实际制作等候，提供确实可供的快速菜单或外带选择，勿仅因航班延误增加备料或延长营业。', '注文前に実際の調理待ちを伝え、提供可能な早いメニュー・持帰りを案内。遅延だけで増産や営業時間延長を決めません。'),
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
    airport: l('출국·입국 고객이 바로 찾을 수 있도록 필수품 위치와 결제 안내를 정리하세요. 반입 가능 여부는 목적지·항공사 공식 안내로 확인하고, 약품 관련 문의는 약사에게 연결하세요.', 'Keep essentials and payment information easy to find for arriving and departing travellers. Check destination and airline carriage guidance; refer medicine questions to a pharmacist.', '便于出入境旅客查找必需品和支付说明。携带限制核对目的地及航空公司官方信息，药品问题交给药师。', '出入国客が必需品と決済案内をすぐ見つけられるよう整理。持込は目的地・航空会社の公式案内を確認し、薬の相談は薬剤師へつなぎます。'),
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
    airport: l('탑승 전 고객에게 체험·대기 시간을 먼저 설명하세요. 공항 승인 구역 안에서 운영하고 탑승 동선·비상 통로를 가리지 않도록 현장 관리자와 확인하세요.', 'Explain session and waiting time before participation. Operate within approved airport space and confirm clear boarding and emergency routes with the site manager.', '参与前说明体验和等候时间，在机场批准区域内运营，与现场负责人确认不妨碍登机及应急通道。', '参加前に体験・待ち時間を案内。空港の承認区画内で運営し、搭乗動線と非常通路を塞がないよう現地管理者と確認します。'),
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
    airport: l('픽업은 고객이 확인한 항공편·터미널·만남 장소로 준비하고 운항 변경을 재확인하세요. 항공기 도착 시각을 입국장 밖에서 만날 시각으로 확정하지 마세요.', 'Prepare pickups from the traveller’s confirmed flight, terminal and meeting point, and recheck changes. An aircraft arrival time is not a guaranteed meeting time outside arrivals.', '按客人确认的航班、航站楼和会面地点准备接机并复核变更，飞机到达时间不是旅客走出到达厅的确定时间。', '送迎は顧客が確認した便・ターミナル・集合場所を基に準備し変更を再確認。航空機到着時刻を到着ロビー外で会える時刻と確定しません。'),
  },
};

export type AirportStoreArea = 'landside' | 'airside' | 'arrival' | 'arrivalDutyFree' | 'concourse';
export const airportStoreAreas: Record<AirportStoreArea, { label: Copy; signal: Copy; action: Copy }> = {
  landside: {
    label: l('출국장 일반구역', 'Departures · public area', '出境大厅·公共区', '出発階・一般区域'),
    signal: l('선택 터미널의 출국장 예상 승객과 현재 출국장 대기를 구분해 확인하세요.', 'Read the selected terminal’s departure-hall forecast separately from current checkpoint waits.', '分别查看所选航站楼出境大厅预计人数和当前安检等候。', '選択ターミナルの出国場予想と現在の検査待ちを分けて確認します。'),
    action: l('체크인 전후 고객의 문의와 실제 매장 대기를 보고 보충·결제 업무를 준비하세요. 보안검색 대기 인원을 매장 방문 인원으로 계산하지 마세요.', 'Prepare replenishment and checkout from actual enquiries and store queues around check-in. Checkpoint queues are not store visits.', '按值机前后实际咨询及店内排队准备补货收银，勿将安检等候人数算作门店客流。', 'チェックイン前後の質問と実際の店内待ちを基に補充・会計を準備。検査待ちを来店人数として扱いません。'),
  },
  airside: {
    label: l('출국장 면세구역', 'Departures · duty-free area', '出境·免税区', '出国・免税区域'),
    signal: l('출국장 공식 예보는 터미널 단위입니다. 항공편 변경과 매장·시설의 공식 위치를 함께 확인하세요.', 'The official departure-hall forecast is terminal-wide. Check flight changes and the store’s official location separately.', '出境大厅官方预测以航站楼为单位，另行核对航班变更及店铺官方位置。', '出国場公式予報はターミナル単位です。便の変更と店舗の公式位置も別に確認します。'),
    action: l('보안검색 이후 매장 도착까지의 시간은 고정하지 마세요. 실제 유입과 탑승 마감 문의를 보고 상담·결제·포장을 배분하고 액체류·환승 안내를 확인하세요.', 'Do not assume a fixed delay from security to the store. Allocate advice, checkout and packing using actual arrivals and boarding-time enquiries; check liquid and transfer guidance.', '勿设定安检后抵达门店的固定间隔。依据实际到店及登机时间咨询分配接待、收银、包装，并核对液体及转机指引。', '検査から店舗到着までの時間を固定しません。実流入と搭乗時刻の質問から相談・会計・包装を分担し、液体・乗継案内を確認します。'),
  },
  arrival: {
    label: l('입국장 일반구역', 'Arrivals · public area', '入境大厅·公共区', '到着階・一般区域'),
    signal: l('입국 화면의 입국 심사 예상 인원과 도착 항공편을 확인하세요. 출국 예보를 대신 쓰지 마세요.', 'Use the arrivals screen’s immigration forecast and arriving flights, not departure forecasts.', '使用入境页面的入境审查预计人数及到达航班，不以出境预测替代。', '入国画面の審査予想と到着便を確認し、出国予報で代用しません。'),
    action: l('수하물 수취와 입국 절차 뒤 실제 유입을 보며 결제·픽업·필수품 안내를 준비하세요. 착륙 시각이나 심사 예상 인원을 매장 도착 시각·구매 인원으로 바꾸지 마세요.', 'Prepare checkout, pickup and essentials guidance from actual flow after immigration and baggage reclaim. Landing times and immigration forecasts do not establish store arrival times or buyers.', '按入境手续和取行李后的实际人流准备收银、接送和必需品说明，勿把着陆时间或审查预测换成到店时间或购买人数。', '入国手続と荷物受取後の実際の流れを見て会計・送迎・必需品案内を準備。着陸時刻や審査予想を来店時刻・購入人数に置き換えません。'),
  },
  arrivalDutyFree: {
    label: l('입국장 면세구역', 'Arrivals · duty-free area', '入境·免税区', '入国・免税区域'),
    signal: l('입국 화면과 해당 매장의 공식 위치·운영시간을 확인하세요. 출국장 면세구역과 이용 동선이 다릅니다.', 'Check arrivals and the store’s official location and hours. This is a different journey from departure duty-free shopping.', '核对入境信息及店铺官方位置和营业时间，其动线不同于出境免税区。', '入国情報と店舗の公式位置・時間を確認。出国免税区域とは利用動線が異なります。'),
    action: l('입국 고객의 실제 대기와 상품 문의를 보고 역할을 배분하세요. 구매 조건·반입·신고 안내는 매장과 관세청의 최신 공식 안내로 확인하세요.', 'Allocate work using actual arriving-customer queues and enquiries. Check current store and customs guidance for purchase conditions, imports and declarations.', '按入境顾客实际排队和咨询分配工作，购买条件、携带入境和申报依据店铺及海关最新官方指引。', '入国客の実際の待ちと質問で分担を調整。購入条件・持込・申告は店舗と税関の最新公式案内で確認します。'),
  },
  concourse: {
    label: l('탑승동', 'Concourse', '登机楼', 'コンコース'),
    signal: l('탑승동으로 확인된 항공편·매장 위치를 확인하세요. 터미널 전체 예상 승객을 탑승동 숫자로 표시하지 않습니다.', 'Use flights and locations confirmed as concourse. Terminal-wide passenger forecasts are not concourse counts.', '查看已确认属于登机楼的航班与店铺位置，航站楼总体预测不等于登机楼人数。', 'コンコースと確認された便・店舗位置を確認。ターミナル全体の予想をコンコースの人数にしません。'),
    action: l('실제 매장 앞 흐름과 탑승구 변경을 확인해 보충·응대 순서를 조정하세요. 탑승구 번호만으로 매장과의 거리나 고객 이동 시간을 추정하지 마세요.', 'Adjust replenishment and service using observed flow and gate changes. A gate number alone does not establish store distance or walking time.', '按店前实际人流和登机口变更调整补货接待，勿仅凭登机口号码推断距离或步行时间。', '店前の実際の流れと搭乗口変更で補充・接客を調整。搭乗口番号だけで距離や移動時間を推定しません。'),
  },
};
