import type { Lang } from "../app/retailpulse-data";
import type { IndustryId } from "./industry-ids";

export interface ShiftStoreCheck {
  id: string;
  title: string;
  summary: string;
  details: string[];
}

type LocalizedText = Readonly<Record<Lang, string>>;
type LocalizedCheck = Readonly<{
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  details: readonly [LocalizedText, LocalizedText, LocalizedText];
}>;

const row = (ko: string, en: string, zh: string, ja: string): LocalizedText => ({ ko, en, zh, ja });

const retailOffer: LocalizedCheck = {
  id: "price-offer",
  title: row("가격·혜택 안내", "Prices & offers", "价格与优惠说明", "価格・特典の案内"),
  summary: row(
    "표시 가격·최종 결제 금액과 행사 적용 조건 대조",
    "Match displayed prices, checkout totals and offer terms.",
    "核对标价、结账金额与优惠适用条件",
    "表示価格・最終決済額と特典の適用条件を照合",
  ),
  details: [
    row(
      "매장 공지의 현재 행사 기간·대상 상품·제외 조건을 정리합니다. 행사가 없으면 정상 판매 기준을 씁니다.",
      "List current offer dates, eligible items and exclusions from the store's approved notice. If no offer is active, use regular sale terms.",
      "按门店已确认的公告整理当前活动日期、适用商品及除外条件；没有活动时使用正常销售规则。",
      "店舗の承認済み案内から、実施中の特典期間・対象商品・除外条件を整理します。特典がなければ通常の販売条件を使います。",
    ),
    row(
      "중복 할인·회원/카드 조건·혜택 한도는 해당 행사에 있을 때만 적고, 표시 가격과 계산대 최종 적용가를 서로 맞게 조정합니다.",
      "Record stacking, member/card conditions and caps only where the offer specifies them. Match displayed prices to final register prices.",
      "仅记录活动实际规定的叠加、会员或银行卡条件及优惠上限，并核对标价与收银系统最终价格。",
      "併用・会員／カード条件・特典上限は該当するものだけ記載し、表示価格とレジの最終適用額を照合します。",
    ),
    row(
      "조건이 불명확한 문의를 넘길 담당자를 정하고, 직원 공유에는 확인된 가격·혜택 조건만 포함합니다.",
      "Name a contact for unresolved offer questions. Share only verified prices and terms with colleagues.",
      "指定处理不明确优惠条件的负责人，只向同事共享已核实的价格与条件。",
      "条件が不明な問合せの引継ぎ先を決め、スタッフには確認済みの価格・特典条件だけを共有します。",
    ),
  ],
};

const checks: Record<IndustryId | "unselected", readonly [LocalizedCheck, LocalizedCheck]> = {
  fashion: [
    {
      id: "display-stock",
      title: row("진열 상품·재고", "Display & stock", "陈列商品与库存", "陳列商品・在庫"),
      summary: row(
        "모델·색상별 판매 가능 재고와 품절 대안 정리",
        "List saleable stock by style/colour and sold-out alternatives.",
        "按款式、颜色整理可售库存与缺货替代品",
        "モデル・色別の販売可能在庫と欠品時の代替品を整理",
      ),
      details: [
        row(
          "진열·행사 상품의 모델·색상을 실제 판매 가능 재고와 맞추고, 예약·불량 등 판매 제외 수량은 구분합니다.",
          "Match displayed and promoted styles/colours to actual saleable stock. Separate reserved, damaged and otherwise unavailable units.",
          "将陈列及活动商品的款式、颜色与实际可售库存核对，区分预留、瑕疵等不可售数量。",
          "陳列・特典対象商品のモデルと色を実際の販売可能在庫と照合し、取り置き・不良品などの販売不可数を分けます。",
        ),
        row(
          "품절 상품은 안내할 대체 모델·색상을 적고, 입고일은 확정된 내용만 공유합니다.",
          "Note available alternative styles/colours for sold-out items. Share restock dates only when confirmed.",
          "为缺货商品记录可提供的替代款式或颜色，只共享已确认的到货日期。",
          "欠品商品に案内できる代替モデル・色を記載し、入荷日は確定した内容だけを共有します。",
        ),
        row(
          "상자·더스트백 등 해당 상품 포장재를 채우고, 재고 보충·포장 담당과 결제 후 인계 지점을 정합니다.",
          "Replenish suitable boxes, dust bags and wrapping. Assign restocking/packing roles and a handover point after payment.",
          "补齐适用的包装盒、防尘袋等包装材料，明确补货、包装人员及付款后的交接位置。",
          "商品に合う箱・保存袋などを補充し、在庫補充・包装担当と決済後の引渡し場所を決めます。",
        ),
      ],
    },
    retailOffer,
  ],
  beauty: [
    {
      id: "tester-stock",
      title: row("테스터·판매 재고", "Testers & stock", "试用品与可售库存", "テスター・販売在庫"),
      summary: row(
        "색상·용량별 재고와 테스터, 진행 중 증정품 준비",
        "Match shades/sizes to stock; prepare testers and active gifts.",
        "核对色号、容量库存，准备试用品及当前活动赠品",
        "色・容量別在庫とテスター、実施中の特典品を準備",
      ),
      details: [
        row(
          "테스터·진열품의 색상·용량을 판매 상품과 맞추고, 품절 색상은 실제 재고가 있는 대안을 적습니다.",
          "Match tester/display shades and sizes to sale items. List in-stock alternatives for unavailable shades.",
          "将试用品、陈列品的色号及容量与销售商品核对，为缺货色号记录确有库存的替代品。",
          "テスター・陳列品の色と容量を販売商品に合わせ、欠品色には在庫のある代替品を記載します。",
        ),
        row(
          "테스터 상태를 매장 관리 기준에 맞춰 점검하고, 시향지·화장솜 등 사용하는 소모품을 보충합니다.",
          "Inspect testers under store procedures and replenish the blotters, cotton pads or other supplies in use.",
          "按门店管理标准检查试用品状态，补齐试香纸、化妆棉等实际使用的耗材。",
          "店舗の管理基準でテスターの状態を点検し、ムエット・コットンなど使用する消耗品を補充します。",
        ),
        row(
          "증정 행사가 있으면 실제 증정품 수량·지급 조건을 맞추고, 품절 안내와 포장 담당을 정합니다.",
          "If a gift offer is active, match gift stock to its terms and assign sold-out guidance and packing roles.",
          "如有赠品活动，核对实际赠品数量与发放条件，明确缺货说明及包装负责人。",
          "プレゼント特典がある場合は実在庫と配布条件を照合し、欠品案内・包装の担当を決めます。",
        ),
      ],
    },
    retailOffer,
  ],
  food: [
    {
      id: "orders-pickup",
      title: row("주문·픽업 준비", "Orders & pickup", "点单与取餐准备", "注文・受取の準備"),
      summary: row(
        "판매 가능 메뉴·포장재와 주문·제조·픽업 역할 정리",
        "List available items, packing supplies and order-to-pickup roles.",
        "整理可售菜单、包装耗材及点单到取餐的分工",
        "提供可能メニュー・包装資材と注文から受取までの担当を整理",
      ),
      details: [
        row(
          "현재 재료·완제품 수량으로 판매 가능한 메뉴를 정리하고, 품절 메뉴는 주문 안내에 바로 반영합니다.",
          "List what can be sold from current ingredient/prepared-item stock and update ordering information for sold-out items.",
          "按当前原料及成品数量整理可售菜单，将售罄项目及时反映到点单说明中。",
          "現在の材料・調理済み品の数量から提供可能なメニューを整理し、品切れを注文案内に反映します。",
        ),
        row(
          "쓰는 규격의 음료 용기·덮개·홀더·봉투를 작업 위치에 채우고, 부족한 재료·포장재 보충 담당을 정합니다.",
          "Restock the correct drink containers, lids, holders and bags at workstations. Assign ingredient and packing-supply replenishment.",
          "在操作位置补齐对应规格的饮料容器、盖、杯托和袋子，指定原料及包装耗材补充人员。",
          "使用する規格の飲料容器・ふた・ホルダー・袋を作業場所に補充し、材料・包装資材の補充担当を決めます。",
        ),
        row(
          "실제 주문 대기를 보고 주문·제조·픽업 담당을 나누며, 준비된 주문을 넘길 위치와 호출 방법을 통일합니다.",
          "Use the actual queue to assign ordering, preparation and pickup roles. Agree where and how to call ready orders.",
          "按实际点单队列安排点单、制作、取餐人员，统一已完成订单的交接位置及叫号方式。",
          "実際の注文待ちを見て注文・調理・受取担当を分け、完成した注文の引渡し場所と呼出方法を合わせます。",
        ),
      ],
    },
    {
      id: "menu-price",
      title: row("메뉴 가격·안내", "Menu prices & guidance", "菜单价格与说明", "メニュー価格・案内"),
      summary: row(
        "옵션 포함 결제액과 실제 준비 시간, 메뉴 안내 통일",
        "Align totals with options, actual preparation times and menu guidance.",
        "统一含选项结账金额、实际制作时间及菜单说明",
        "オプション込みの決済額・実際の準備時間・メニュー案内を統一",
      ),
      details: [
        row(
          "메뉴판의 가격·크기·추가 옵션을 계산대와 맞추고, 행사 중인 메뉴는 적용·제외 조건을 함께 적습니다.",
          "Match menu prices, sizes and extras to the register. Record eligibility and exclusions for any active menu offer.",
          "核对菜单价格、规格、加料选项与收银系统；有活动的菜单同时记录适用及除外条件。",
          "メニュー表の価格・サイズ・追加オプションをレジと照合し、実施中の特典は適用・除外条件も記載します。",
        ),
        row(
          "준비 시간은 현재 주문 대기와 제조 담당의 확인을 기준으로 안내하고, 픽업 위치·호출 방식을 함께 알립니다.",
          "Give preparation times verified with the kitchen and current queue, together with pickup location and calling method.",
          "按当前排队及制作人员确认的情况说明准备时间，同时说明取餐位置和叫号方式。",
          "準備時間は現在の注文待ちと調理担当の確認に基づいて案内し、受取場所・呼出方法も伝えます。",
        ),
        row(
          "원재료·알레르기 문의는 매장 공식 자료로 안내하고, 불명확한 항목은 담당자에게 연결합니다.",
          "Answer ingredient/allergen questions from official store materials and refer unclear items to the responsible staff member.",
          "依据门店正式资料回答原料、过敏原问题，不明确的项目转交负责人。",
          "原材料・アレルゲンの問合せは店舗の公式資料で案内し、不明な項目は担当者に引き継ぎます。",
        ),
      ],
    },
  ],
  convenience: [
    {
      id: "shelf-checkout",
      title: row("진열·계산대 준비", "Shelves & checkout", "货架与收银准备", "陳列・レジの準備"),
      summary: row(
        "상품·가격표·판매 재고를 맞추고 계산대 소모품 보충",
        "Match shelf labels to saleable stock and replenish till supplies.",
        "核对商品、价签与可售库存，补齐收银耗材",
        "商品・値札・販売在庫を照合し、レジの消耗品を補充",
      ),
      details: [
        row(
          "진열 가격표의 상품·용량을 실제 판매 재고와 맞추고, 판매 제외 상품은 구분합니다.",
          "Match shelf-label items/sizes to actual saleable stock and separate unavailable units.",
          "将货架价签的商品、容量与实际可售库存核对，并区分不可售商品。",
          "棚の値札の商品・容量を実際の販売在庫と照合し、販売できない商品を分けます。",
        ),
        row(
          "품절 품목과 재고가 확인된 대체 품목을 적고, 진열 보충 담당에게 부족 수량을 전달합니다.",
          "List sold-out items and verified in-stock alternatives, then pass replenishment gaps to the shelf-stocking colleague.",
          "记录缺货品及已确认有库存的替代品，将缺少的数量交给补货人员。",
          "欠品と在庫確認済みの代替品を記載し、不足数を陳列補充の担当に伝えます。",
        ),
        row(
          "영수증 용지·봉투 등 계산대 소모품을 채우고, 실제 대기가 늘 때 지원할 담당자를 정합니다.",
          "Restock receipt paper, bags and other till supplies. Name checkout support for any actual queue buildup.",
          "补齐小票纸、袋子等收银耗材，明确实际排队增加时的支援人员。",
          "レシート用紙・袋などを補充し、実際にレジ待ちが増えた際の応援担当を決めます。",
        ),
      ],
    },
    retailOffer,
  ],
  popup: [
    {
      id: "experience-setup",
      title: row("체험·운영 준비", "Experience setup", "体验与运营准备", "体験・運営の準備"),
      summary: row(
        "운영 가능한 체험·소모품과 접수·진행 담당 정리",
        "Prepare available activities, supplies and reception/facilitation roles.",
        "整理可提供的体验、耗材及接待与执行分工",
        "実施可能な体験・消耗品と受付・進行担当を整理",
      ),
      details: [
        row(
          "운영 장비·재료 상태와 예약 현황을 보고 현재 제공 가능한 체험을 정리합니다.",
          "Use equipment/material readiness and confirmed bookings to list activities currently available.",
          "根据设备、材料状态及已确认预约，整理当前可提供的体验项目。",
          "設備・材料の状態と予約状況から、現在実施できる体験を整理します。",
        ),
        row(
          "체험에 사용하는 소모품을 채우고, 배포품이 있으면 실제 수량과 지급 조건을 대조합니다.",
          "Restock activity supplies. If items are distributed, match actual quantities to distribution terms.",
          "补齐体验耗材；如有发放物品，核对实际数量与发放条件。",
          "体験で使う消耗品を補充し、配布品がある場合は実数と配布条件を照合します。",
        ),
        row(
          "실제 대기 줄에 맞춰 접수·체험 진행·결제 담당을 정하고, 다음 차례 호출과 인계 위치를 통일합니다.",
          "Assign reception, facilitation and any payment roles to the actual queue. Agree calling and handover points.",
          "按实际队列安排接待、体验执行及需要的收银人员，统一叫号与交接位置。",
          "実際の待ち列に合わせて受付・体験進行・必要な決済担当を決め、呼出方法と引継ぎ場所を統一します。",
        ),
      ],
    },
    {
      id: "experience-terms",
      title: row("참여·결제 조건", "Participation & payment", "参与及付款条件", "参加・決済条件"),
      summary: row(
        "예약·참여 조건과 소요 시간, 유료 항목을 같은 문구로 안내",
        "Align booking terms, duration and any paid items in staff guidance.",
        "统一预约、参与条件、时长及收费项目的说明",
        "予約・参加条件と所要時間、有料項目の案内を統一",
      ),
      details: [
        row(
          "현재 운영 공지에서 예약 필요 여부·참여 조건·운영 종료 시간을 정리합니다.",
          "Use current operating notices to list booking requirements, participation conditions and closing time.",
          "按当前运营公告整理是否需预约、参与条件及结束时间。",
          "現在の運営案内から、予約の要否・参加条件・終了時刻を整理します。",
        ),
        row(
          "유료 체험·판매품이 있으면 표시 가격과 계산대 금액을 맞추고, 쿠폰 등 혜택은 실제 적용 조건만 적습니다.",
          "For paid activities/items, match displayed and register prices. List only actual coupon or other offer terms.",
          "如有付费体验或商品，核对标价与收银金额；优惠券等仅记录实际适用条件。",
          "有料体験・販売品があれば表示価格とレジ金額を照合し、クーポンなどは実際の適用条件だけを記載します。",
        ),
        row(
          "대기·체험 시간은 현장 담당자가 확인한 범위로 안내하고, 예외 문의를 넘길 담당자를 정합니다.",
          "Quote waiting/activity times verified by on-site staff and name a contact for exceptions.",
          "仅按现场人员已确认的范围说明等待、体验时间，并指定特殊问题的处理人。",
          "待ち時間・体験時間は現場担当が確認した範囲で案内し、例外の問合せ先を決めます。",
        ),
      ],
    },
  ],
  tourism: [
    {
      id: "booking-transfer",
      title: row("예약·이동 안내", "Bookings & meeting points", "预约与出行说明", "予約・移動の案内"),
      summary: row(
        "확정 예약과 집결 장소·시간, 연결 담당 정리",
        "Prepare confirmed bookings, meeting details and support contacts.",
        "整理已确认预约、集合地点与时间及对接人员",
        "確定予約と集合場所・時刻、引継ぎ担当を整理",
      ),
      details: [
        row(
          "확정 예약 상태·이용 일시를 예약 시스템과 대조하고, 확인 전에는 잔여 좌석·객실을 약속하지 않습니다.",
          "Match booking status and visit/stay dates to the booking system. Verify seats or rooms before promising availability.",
          "将预约状态、使用日期时间与预约系统核对，核实前不承诺剩余席位或客房。",
          "確定予約の状態・利用日時を予約システムと照合し、確認前に残席・空室を約束しません。",
        ),
        row(
          "집결·픽업 장소와 시간, 이동 방법·연락처를 현재 운영 안내에 맞춰 정리합니다.",
          "Prepare meeting/pickup locations and times, directions and contacts from current operating information.",
          "按当前运营说明整理集合、接送地点与时间、出行方式及联系方式。",
          "集合・送迎の場所と時刻、移動方法・連絡先を現在の運営案内に合わせて整理します。",
        ),
        row(
          "실제 상담 대기와 미처리 건을 보고 예약·이동 문의 담당을 나누며, 인계할 내용과 회신 담당을 적습니다.",
          "Use actual queues and open cases to assign booking/transport support. Note handover details and who will follow up.",
          "按实际咨询队列及未处理事项分配预约、出行咨询人员，记录交接内容与回复负责人。",
          "実際の相談待ちと未対応案件を見て予約・移動の担当を分け、引継ぎ内容と返答担当を記載します。",
        ),
      ],
    },
    {
      id: "booking-terms",
      title: row("이용 요금·조건", "Fees & booking terms", "费用与使用条件", "利用料金・条件"),
      summary: row(
        "최종 결제 금액과 이용·변경·취소 조건을 공식 안내로 통일",
        "Align final prices and use/change/cancellation terms with approved guidance.",
        "按正式说明统一最终付款金额及使用、变更、取消条件",
        "最終決済額と利用・変更・取消条件を公式案内に統一",
      ),
      details: [
        row(
          "예약 상품·이용일에 적용되는 요금과 포함·별도 항목을 공식 판매 안내에서 정리합니다.",
          "List the rate, inclusions and separately charged items for the booked product/date from approved sales information.",
          "依据正式销售说明，整理预约产品及使用日期适用的价格、包含项与另付费项。",
          "予約商品・利用日に適用される料金と含まれる項目・別料金の項目を公式販売案内から整理します。",
        ),
        row(
          "고객에게 안내한 최종 금액을 결제 화면과 맞추고, 변경·취소 조건은 해당 예약의 확정 약관을 사용합니다.",
          "Match the quoted final amount to checkout and use the confirmed terms for that booking's changes/cancellations.",
          "核对向顾客说明的最终金额与付款页面，变更、取消条件使用该预约已确认的条款。",
          "案内した最終金額を決済画面と照合し、変更・取消条件はその予約の確定した規約を使います。",
        ),
        row(
          "운영 변경이나 조건이 불명확한 문의를 확인할 담당자와 연락 방법을 직원에게 공유합니다.",
          "Share the contact and method for verifying service changes or unclear booking terms.",
          "向员工共享核实运营变更或不明确预约条件的负责人及联系方法。",
          "運営変更や条件が不明な問合せの確認先と連絡方法をスタッフに共有します。",
        ),
      ],
    },
  ],
  liquor: [
    {
      id: "product-packing",
      title: row("상품·포장 준비", "Products & packing", "商品与包装准备", "商品・包装の準備"),
      summary: row(
        "품목·용량별 판매 재고와 상품에 맞는 포장재 준비",
        "Match item/size stock and prepare suitable protective packing.",
        "按品种、容量核对可售库存并准备适用包装",
        "品目・容量別の販売在庫と商品に合う包装材を準備",
      ),
      details: [
        row(
          "품목·용량·포장 단위를 실제 판매 가능 재고와 맞추고, 품절 시 안내할 재고 있는 대안을 적습니다.",
          "Match item, size and pack unit to saleable stock. List verified alternatives for sold-out products.",
          "将品种、容量、包装单位与实际可售库存核对，为缺货商品记录确有库存的替代品。",
          "品目・容量・包装単位を販売可能在庫と照合し、欠品時に案内する在庫のある代替品を記載します。",
        ),
        row(
          "병 제품은 완충재·전용 상자 등 매장 기준의 포장재를 채우고, 포장 상태 점검 담당을 정합니다.",
          "For bottles, restock store-approved cushioning and boxes, and assign a final packing check.",
          "瓶装商品补齐符合门店标准的缓冲材料、专用包装盒，并指定包装状态检查人员。",
          "瓶商品は店舗基準の緩衝材・専用箱などを補充し、包装状態の点検担当を決めます。",
        ),
        row(
          "결제 후 상품 수량·포장 단위를 인계할 위치를 정하고, 상품별 안내는 현재 매장 공식 자료를 준비합니다.",
          "Agree where quantities and pack units are handed over after payment, and prepare current official product guidance.",
          "确定付款后核对商品数量、包装单位的交接位置，并准备当前门店正式商品说明。",
          "決済後に数量・包装単位を引き継ぐ場所を決め、商品別の案内は現在の店舗公式資料を用意します。",
        ),
      ],
    },
    retailOffer,
  ],
  luxury: [
    {
      id: "consultation-stock",
      title: row("상담 상품·인계", "Products & handover", "咨询商品与交接", "接客商品・引継ぎ"),
      summary: row(
        "모델·색상별 판매 재고와 예약품, 구성품·포장 인계 정리",
        "Separate saleable/reserved styles and prepare accessories and packing.",
        "按款式、颜色区分可售与预留商品，整理配件及包装交接",
        "モデル・色別の販売在庫と取り置き品、付属品・包装の引継ぎを整理",
      ),
      details: [
        row(
          "상담할 모델·색상의 판매 가능 재고를 실제 상품과 대조하고, 예약·보류 상품은 별도로 구분합니다.",
          "Verify the actual saleable styles/colours for consultations and separate reserved or on-hold items.",
          "将拟介绍款式、颜色的可售库存与实物核对，单独区分预留或暂缓销售商品。",
          "接客で案内するモデル・色の販売可能在庫を実物と照合し、取り置き・保留商品を分けます。",
        ),
        row(
          "상품별 구성품과 상자·보관백 등 포장재를 맞추고, 누락이 있으면 결제 전에 담당자에게 전달합니다.",
          "Match each item's accessories, box and storage bag. Refer missing components to the responsible colleague before payment.",
          "核对商品配件、包装盒、收纳袋等，如有缺失在付款前交由负责人处理。",
          "商品ごとの付属品・箱・保存袋などを照合し、不足があれば決済前に担当者へ伝えます。",
        ),
        row(
          "실제 상담 순서에 맞춰 결제·포장 담당을 정하고, 상품 상태와 구성품을 함께 인계합니다.",
          "Assign payment and packing roles to the actual consultation order, handing over item condition and components together.",
          "按实际咨询顺序安排收银、包装人员，并一并交接商品状态及配件。",
          "実際の接客順に合わせて決済・包装担当を決め、商品状態と付属品を一緒に引き継ぎます。",
        ),
      ],
    },
    retailOffer,
  ],
  unselected: [
    {
      id: "store-readiness",
      title: row("상품·운영 준비", "Store readiness", "商品与运营准备", "商品・運営の準備"),
      summary: row(
        "판매 가능 품목과 실제 대기, 직원 인계 순서 정리",
        "List available items, actual queues and staff handover roles.",
        "整理可提供商品、实际排队及员工交接顺序",
        "提供可能な品目・実際の待ち列とスタッフの引継ぎ順を整理",
      ),
      details: [
        row(
          "오늘 판매·제공 가능한 품목을 실제 재고나 운영 현황과 맞추고, 품절·운영 중단 항목을 적습니다.",
          "Match today's available items/services to actual stock or operations. List sold-out or unavailable items.",
          "按实际库存或运营状态核对今日可销售、提供的项目，记录缺货或暂停项目。",
          "今日提供できる品目を実在庫・運営状況と照合し、欠品・提供中止の項目を記載します。",
        ),
        row(
          "품절·이용 불가 항목의 대안은 실제 제공 가능한 것만 정리하고, 미확정 일정은 약속하지 않습니다.",
          "List only verified available alternatives and avoid promising unconfirmed restock or service dates.",
          "仅整理确可提供的替代项目，不承诺未确认的补货或恢复时间。",
          "欠品・利用不可の代替案は実際に提供できるものだけにし、未確定の日程は約束しません。",
        ),
        row(
          "실제 대기 상황을 보고 응대·결제·인계 담당을 나누고, 해당 업무에 필요한 소모품을 보충합니다.",
          "Use actual queues to assign service, payment and handover roles, and replenish the supplies those tasks need.",
          "按实际排队分配接待、收银及交接人员，补齐相应工作所需耗材。",
          "実際の待ち状況を見て応対・決済・引継ぎ担当を分け、必要な消耗品を補充します。",
        ),
      ],
    },
    retailOffer,
  ],
};

/**
 * Staff-verified, standing store checks: these are not flight-data conclusions.
 * Flight APIs cannot establish stock, prices, offers, queues or customer demand.
 * Keep these available when flight data is missing and never infer nationality
 * or language needs from a flight's destination. Null is deliberately generic.
 */
export function buildShiftStoreChecks(industry: IndustryId | null, lang: Lang): [ShiftStoreCheck, ShiftStoreCheck] {
  const localize = (check: LocalizedCheck): ShiftStoreCheck => ({
    id: check.id,
    title: check.title[lang],
    summary: check.summary[lang],
    details: check.details.map((detail) => detail[lang]),
  });
  const [first, second] = checks[industry ?? "unselected"];
  return [localize(first), localize(second)];
}
