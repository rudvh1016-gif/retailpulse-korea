/**
 * "앱처럼 설치하기" — the home-screen install guide.
 *
 * KORETAIL is a web app. Installing it adds a real home-screen icon that
 * opens full screen with no address bar; on Android the browser builds a
 * WebAPK so it appears in the app drawer and app switcher like any other
 * app. It is NOT a Play Store or App Store application, and nothing here
 * says otherwise — a reader who expects a store download and finds a
 * browser menu has been misled, so the guide says what this is in its
 * first sentence.
 *
 * The steps are deliberately written with an "or" for the wording that
 * differs by browser version (Chrome shows "앱 설치" on a site it can
 * install as a WebAPK and "홈 화면에 추가" otherwise). Naming only one
 * label would make the guide wrong for half its readers, and this file
 * cannot detect the reader's browser version.
 *
 * Copy only — no DOM, no platform detection beyond a user-agent reading —
 * so every string can be tested without a browser.
 */
export type InstallLang = "ko" | "en" | "zh" | "ja";

/** Which section to open first. Never used to hide the others. */
export type InstallPlatform = "ios" | "android" | "desktop";

export type InstallSectionKey = "android-chrome" | "android-samsung" | "ios-safari" | "desktop";

export interface InstallStep {
  /** The action, short enough to follow while holding the phone. */
  action: string;
  /** Where to look, in the reader's own words. Null when the action is complete on its own. */
  detail: string | null;
}

export interface InstallSection {
  key: InstallSectionKey;
  platform: InstallPlatform;
  /** "갤럭시 · 크롬" */
  heading: string;
  steps: InstallStep[];
  /** A caveat that belongs to this browser only. Null when there is none. */
  note: string | null;
}

export interface InstallQuestion {
  question: string;
  answer: string;
}

export interface InstallGuide {
  /** Header button label. */
  buttonLabel: string;
  title: string;
  /** What installing actually does, and what it is not. */
  intro: string;
  benefits: string[];
  /** Label for the one-tap install button, shown only when the browser offers it. */
  promptLabel: string;
  promptNote: string;
  /** Shown instead of everything else when already running installed. */
  installedTitle: string;
  installedBody: string;
  sections: InstallSection[];
  questionsTitle: string;
  questions: InstallQuestion[];
  closeLabel: string;
  /** What the reader should see when it worked. */
  doneTitle: string;
  doneBody: string;
}

const GUIDE: Record<InstallLang, InstallGuide> = {
  ko: {
    buttonLabel: "앱처럼 설치",
    title: "앱처럼 설치하기",
    intro: "KORETAIL은 웹으로 만들어졌습니다. 설치하면 홈 화면에 아이콘이 생기고, 주소창 없이 전체 화면으로 열립니다. 플레이스토어나 앱스토어에서 내려받는 앱은 아니며, 설치해도 용량은 거의 차지하지 않습니다.",
    benefits: [
      "홈 화면 아이콘을 한 번 눌러 바로 열립니다",
      "주소창과 탭이 사라져 화면을 더 넓게 씁니다",
      "즐겨찾기를 찾아 들어가지 않아도 됩니다",
      "설치해도 계정 가입이나 결제는 없습니다",
    ],
    promptLabel: "지금 설치하기",
    promptNote: "이 버튼은 지금 쓰는 브라우저가 바로 설치를 지원할 때만 보입니다. 보이지 않으면 아래 순서대로 따라 하시면 됩니다.",
    installedTitle: "이미 설치되어 있습니다",
    installedBody: "지금 설치된 앱으로 보고 계십니다. 다시 설치할 필요는 없습니다. 삭제하려면 홈 화면 아이콘을 길게 눌러 제거하시면 됩니다.",
    sections: [
      {
        key: "android-chrome",
        platform: "android",
        heading: "갤럭시 · 크롬",
        steps: [
          { action: "크롬으로 koretaildata.com 을 엽니다", detail: "카카오톡이나 인스타그램 안에서 열린 화면이라면 설치가 안 됩니다. 오른쪽 위 ⋮ 를 눌러 '다른 브라우저로 열기'를 선택하세요." },
          { action: "오른쪽 위 ⋮ (점 세 개)를 누릅니다", detail: "주소창 오른쪽 끝에 세로로 놓인 점 세 개입니다." },
          { action: "'앱 설치' 를 누릅니다", detail: "메뉴에 '앱 설치'가 없으면 '홈 화면에 추가'를 누르세요. 둘 중 하나는 반드시 있습니다." },
          { action: "'설치' 를 한 번 더 누릅니다", detail: "이름을 바꿀 수 있는 창이 뜨면 그대로 두고 설치를 누르면 됩니다." },
        ],
        note: null,
      },
      {
        key: "android-samsung",
        platform: "android",
        heading: "갤럭시 · 삼성 인터넷",
        steps: [
          { action: "삼성 인터넷으로 koretaildata.com 을 엽니다", detail: null },
          { action: "화면 아래쪽 ≡ (줄 세 개)를 누릅니다", detail: "삼성 인터넷은 메뉴가 화면 아래에 있습니다." },
          { action: "'현재 페이지 추가' 를 누릅니다", detail: "버전에 따라 '페이지 추가' 또는 다운로드 모양 아이콘으로 보일 수 있습니다." },
          { action: "'홈 화면' 을 고릅니다", detail: "'북마크'가 아니라 '홈 화면'이어야 아이콘이 생깁니다." },
        ],
        note: "주소창에 설치 아이콘이 바로 보이는 버전도 있습니다. 그때는 그 아이콘만 눌러도 됩니다.",
      },
      {
        key: "ios-safari",
        platform: "ios",
        heading: "아이폰 · 사파리",
        steps: [
          { action: "반드시 사파리로 koretaildata.com 을 엽니다", detail: "카카오톡·인스타그램·네이버 앱 안에서 열린 화면에서는 홈 화면 추가가 나오지 않습니다. 오른쪽 위 또는 아래의 '사파리로 열기'를 먼저 누르세요." },
          { action: "화면 아래 공유 버튼을 누릅니다", detail: "네모 상자에서 위쪽으로 화살표가 나온 모양(⬆)입니다. 화면 맨 아래 가운데에 있습니다. 안 보이면 화면을 한 번 아래로 쓸어내리면 나타납니다." },
          { action: "목록을 위로 올려 '홈 화면에 추가' 를 찾습니다", detail: "공유 목록의 중간쯤에 있습니다. 조금 스크롤해야 보입니다." },
          { action: "오른쪽 위 '추가' 를 누릅니다", detail: "이름은 그대로 두셔도 됩니다." },
        ],
        note: "아이폰은 사파리에서만 홈 화면에 추가할 수 있습니다. 크롬을 쓰시더라도 이 과정만 사파리로 해주시면 됩니다.",
      },
      {
        key: "desktop",
        platform: "desktop",
        heading: "컴퓨터 · 크롬 / 엣지",
        steps: [
          { action: "주소창 오른쪽 끝의 설치 아이콘을 누릅니다", detail: "화면과 아래쪽 화살표가 겹쳐진 모양입니다." },
          { action: "아이콘이 없으면 ⋮ 메뉴 → '캐스트, 저장 및 공유' → '페이지를 앱으로 설치' 를 누릅니다", detail: "엣지는 ··· 메뉴 → '앱' → '이 사이트를 앱으로 설치' 입니다." },
          { action: "'설치' 를 누릅니다", detail: null },
        ],
        note: null,
      },
    ],
    questionsTitle: "자주 막히는 곳",
    questions: [
      { question: "메뉴에 '앱 설치'가 없어요", answer: "'홈 화면에 추가'를 누르시면 됩니다. 결과는 같습니다. 두 항목 모두 없다면 카카오톡이나 인스타그램 안의 브라우저일 가능성이 큽니다. 크롬이나 사파리로 다시 열어주세요." },
      { question: "설치하면 요금이 나가나요?", answer: "아니요. KORETAIL은 무료이고, 설치에 가입·결제·광고가 없습니다. 앱 용량도 거의 차지하지 않습니다." },
      { question: "인터넷이 없어도 볼 수 있나요?", answer: "아니요. 화면에 나오는 숫자는 모두 공식 실시간 자료라서, 열 때마다 인터넷 연결이 필요합니다." },
      { question: "지우고 싶어요", answer: "홈 화면의 아이콘을 길게 누른 뒤 '삭제' 또는 '앱 제거'를 누르시면 됩니다. 저장된 개인정보는 없습니다." },
    ],
    closeLabel: "닫기",
    doneTitle: "잘 됐는지 확인하는 법",
    doneBody: "홈 화면에 KORETAIL 아이콘이 생겼다면 성공입니다. 아이콘을 눌렀을 때 위쪽에 주소창이 보이지 않으면 앱처럼 설치된 것입니다.",
  },
  en: {
    buttonLabel: "Install app",
    title: "Install like an app",
    intro: "KORETAIL is a web app. Installing it puts an icon on your home screen and opens full screen with no address bar. It is not a Play Store or App Store download, and it uses almost no storage.",
    benefits: [
      "Opens in one tap from your home screen",
      "No address bar or tabs, so more of the screen is the data",
      "No hunting through bookmarks",
      "No account and no payment, before or after",
    ],
    promptLabel: "Install now",
    promptNote: "This button appears only when your current browser can install directly. If you do not see it, follow the steps below.",
    installedTitle: "Already installed",
    installedBody: "You are looking at the installed app right now, so there is nothing to do. To remove it, press and hold the home-screen icon and delete it.",
    sections: [
      {
        key: "android-chrome",
        platform: "android",
        heading: "Galaxy / Android · Chrome",
        steps: [
          { action: "Open koretaildata.com in Chrome", detail: "A page opened inside another app (KakaoTalk, Instagram) cannot install. Use that app's menu to open it in a browser first." },
          { action: "Tap ⋮ at the top right", detail: "The three vertical dots at the end of the address bar." },
          { action: "Tap \"Install app\"", detail: "If the menu has no \"Install app\", tap \"Add to Home screen\" instead. One of the two is always there." },
          { action: "Tap \"Install\" to confirm", detail: "If it offers to rename the app, leave the name as it is." },
        ],
        note: null,
      },
      {
        key: "android-samsung",
        platform: "android",
        heading: "Galaxy · Samsung Internet",
        steps: [
          { action: "Open koretaildata.com in Samsung Internet", detail: null },
          { action: "Tap ≡ at the bottom of the screen", detail: "Samsung Internet keeps its menu at the bottom." },
          { action: "Tap \"Add page to\"", detail: "Some versions show a download-style icon instead." },
          { action: "Choose \"Home screen\"", detail: "Choose Home screen, not Bookmarks — only Home screen creates the icon." },
        ],
        note: "Newer versions show an install icon directly in the address bar; tapping that is enough.",
      },
      {
        key: "ios-safari",
        platform: "ios",
        heading: "iPhone · Safari",
        steps: [
          { action: "Open koretaildata.com in Safari — it must be Safari", detail: "A page opened inside KakaoTalk, Instagram or another app will not offer Add to Home Screen. Use \"Open in Safari\" first." },
          { action: "Tap the Share button at the bottom", detail: "A square with an arrow pointing up (⬆), centred at the very bottom. If it is hidden, swipe down once to bring it back." },
          { action: "Scroll the list up and find \"Add to Home Screen\"", detail: "It sits partway down the share sheet, so you need to scroll a little." },
          { action: "Tap \"Add\" at the top right", detail: "You can leave the name as it is." },
        ],
        note: "On iPhone, only Safari can add to the home screen. If you normally use Chrome, do just this one step in Safari.",
      },
      {
        key: "desktop",
        platform: "desktop",
        heading: "Computer · Chrome / Edge",
        steps: [
          { action: "Click the install icon at the right of the address bar", detail: "A small screen with a downward arrow." },
          { action: "No icon? Open ⋮ → \"Cast, save and share\" → \"Install page as app\"", detail: "In Edge it is ··· → \"Apps\" → \"Install this site as an app\"." },
          { action: "Click \"Install\"", detail: null },
        ],
        note: null,
      },
    ],
    questionsTitle: "If you get stuck",
    questions: [
      { question: "There is no \"Install app\" in the menu", answer: "Use \"Add to Home screen\" — the result is the same. If neither is there, you are probably inside another app's browser; reopen the page in Chrome or Safari." },
      { question: "Does installing cost anything?", answer: "No. KORETAIL is free, and installing involves no sign-up, no payment and no ads. It uses almost no storage." },
      { question: "Does it work offline?", answer: "No. Every number on screen is live official data, so an internet connection is needed each time you open it." },
      { question: "How do I remove it?", answer: "Press and hold the home-screen icon and choose Delete or Uninstall. No personal data is stored." },
    ],
    closeLabel: "Close",
    doneTitle: "How to tell it worked",
    doneBody: "You should see a KORETAIL icon on your home screen. Tap it: if there is no address bar across the top, it is installed as an app.",
  },
  zh: {
    buttonLabel: "安装为应用",
    title: "像应用一样安装",
    intro: "KORETAIL 是网页应用。安装后会在主屏幕生成图标，并以全屏方式打开，没有地址栏。它不是从应用商店下载的应用，几乎不占用存储空间。",
    benefits: [
      "从主屏幕一键打开",
      "没有地址栏和标签页，屏幕可以完整用来看数据",
      "不必再从书签里翻找",
      "无需注册，也没有任何付费",
    ],
    promptLabel: "立即安装",
    promptNote: "只有当前浏览器支持直接安装时才会出现此按钮。若未出现，请按下面的步骤操作。",
    installedTitle: "已经安装完成",
    installedBody: "您正在使用已安装的应用，无需重复安装。如需删除，长按主屏幕图标后删除即可。",
    sections: [
      {
        key: "android-chrome",
        platform: "android",
        heading: "三星 / 安卓 · Chrome",
        steps: [
          { action: "用 Chrome 打开 koretaildata.com", detail: "在 KakaoTalk、Instagram 等应用内打开的页面无法安装，请先选择「用浏览器打开」。" },
          { action: "点击右上角 ⋮（三个点）", detail: "位于地址栏右端的竖排三点。" },
          { action: "点击「安装应用」", detail: "如果菜单里没有「安装应用」，请点击「添加到主屏幕」，两者必有其一。" },
          { action: "再点击一次「安装」确认", detail: "若弹出可修改名称的窗口，保持原样直接安装即可。" },
        ],
        note: null,
      },
      {
        key: "android-samsung",
        platform: "android",
        heading: "三星 · 三星浏览器",
        steps: [
          { action: "用三星浏览器打开 koretaildata.com", detail: null },
          { action: "点击屏幕下方的 ≡（三条横线）", detail: "三星浏览器的菜单在屏幕下方。" },
          { action: "点击「添加当前页面」", detail: "部分版本显示为下载样式的图标。" },
          { action: "选择「主屏幕」", detail: "必须选「主屏幕」而不是「书签」，才会生成图标。" },
        ],
        note: "较新的版本会直接在地址栏显示安装图标，点击该图标即可。",
      },
      {
        key: "ios-safari",
        platform: "ios",
        heading: "iPhone · Safari",
        steps: [
          { action: "务必用 Safari 打开 koretaildata.com", detail: "在 KakaoTalk、Instagram 等应用内打开的页面不会出现「添加到主屏幕」，请先选择「在 Safari 中打开」。" },
          { action: "点击屏幕底部的分享按钮", detail: "方框中带有向上箭头的图标（⬆），位于屏幕最下方中间。若未显示，向下轻扫一次即可出现。" },
          { action: "向上滑动列表，找到「添加到主屏幕」", detail: "它在分享列表的中间位置，需要稍微滚动。" },
          { action: "点击右上角「添加」", detail: "名称保持默认即可。" },
        ],
        note: "iPhone 只能通过 Safari 添加到主屏幕。即使平时使用 Chrome，这一步也请在 Safari 中完成。",
      },
      {
        key: "desktop",
        platform: "desktop",
        heading: "电脑 · Chrome / Edge",
        steps: [
          { action: "点击地址栏右端的安装图标", detail: "显示为屏幕与向下箭头组合的小图标。" },
          { action: "没有图标时，依次点击 ⋮ →「投放、保存和共享」→「将页面安装为应用」", detail: "Edge 为 ··· →「应用」→「将此站点安装为应用」。" },
          { action: "点击「安装」", detail: null },
        ],
        note: null,
      },
    ],
    questionsTitle: "常见卡住的地方",
    questions: [
      { question: "菜单里没有「安装应用」", answer: "点击「添加到主屏幕」即可，结果相同。若两者都没有，通常是在其他应用内置浏览器中，请用 Chrome 或 Safari 重新打开。" },
      { question: "安装需要收费吗？", answer: "不需要。KORETAIL 免费使用，安装过程没有注册、付费或广告，也几乎不占存储空间。" },
      { question: "没有网络也能看吗？", answer: "不能。屏幕上的数字均为官方实时资料，每次打开都需要联网。" },
      { question: "想要删除", answer: "长按主屏幕上的图标，选择删除或卸载即可。不会留下个人信息。" },
    ],
    closeLabel: "关闭",
    doneTitle: "如何确认安装成功",
    doneBody: "主屏幕上出现 KORETAIL 图标即表示成功。点击图标后，如果顶部没有地址栏，就说明已作为应用安装。",
  },
  ja: {
    buttonLabel: "アプリとして追加",
    title: "アプリのようにインストール",
    intro: "KORETAIL はウェブアプリです。インストールするとホーム画面にアイコンができ、アドレスバーのない全画面で開きます。ストアからダウンロードするアプリではなく、容量もほとんど使いません。",
    benefits: [
      "ホーム画面から一度のタップで開けます",
      "アドレスバーとタブが消え、画面を広く使えます",
      "ブックマークを探す必要がありません",
      "登録も支払いもありません",
    ],
    promptLabel: "今すぐインストール",
    promptNote: "このボタンは、お使いのブラウザが直接インストールに対応している場合のみ表示されます。表示されないときは以下の手順どおりに進めてください。",
    installedTitle: "すでにインストール済みです",
    installedBody: "現在インストール済みのアプリで表示しています。再インストールの必要はありません。削除する場合はホーム画面のアイコンを長押ししてください。",
    sections: [
      {
        key: "android-chrome",
        platform: "android",
        heading: "Galaxy / Android · Chrome",
        steps: [
          { action: "Chrome で koretaildata.com を開きます", detail: "KakaoTalk や Instagram の中で開いた画面ではインストールできません。先に「ブラウザで開く」を選んでください。" },
          { action: "右上の ⋮（点三つ）をタップします", detail: "アドレスバー右端の縦三点です。" },
          { action: "「アプリをインストール」をタップします", detail: "メニューにない場合は「ホーム画面に追加」をタップしてください。どちらかは必ずあります。" },
          { action: "もう一度「インストール」をタップします", detail: "名前を変更できる画面が出たら、そのままインストールを押して構いません。" },
        ],
        note: null,
      },
      {
        key: "android-samsung",
        platform: "android",
        heading: "Galaxy · Samsung Internet",
        steps: [
          { action: "Samsung Internet で koretaildata.com を開きます", detail: null },
          { action: "画面下の ≡（横三本線）をタップします", detail: "Samsung Internet はメニューが画面下にあります。" },
          { action: "「現在のページを追加」をタップします", detail: "バージョンによってはダウンロード型のアイコンで表示されます。" },
          { action: "「ホーム画面」を選びます", detail: "「ブックマーク」ではなく「ホーム画面」を選ばないとアイコンはできません。" },
        ],
        note: "新しいバージョンではアドレスバーにインストールアイコンが直接表示されます。その場合はそれをタップするだけで完了です。",
      },
      {
        key: "ios-safari",
        platform: "ios",
        heading: "iPhone · Safari",
        steps: [
          { action: "必ず Safari で koretaildata.com を開きます", detail: "KakaoTalk や Instagram の中で開いた画面には「ホーム画面に追加」が出ません。先に「Safari で開く」を押してください。" },
          { action: "画面下部の共有ボタンをタップします", detail: "四角から上向きの矢印が出た形（⬆）で、画面いちばん下の中央にあります。見えないときは一度下にスワイプすると出てきます。" },
          { action: "リストを上にスクロールして「ホーム画面に追加」を探します", detail: "共有リストの中ほどにあるので、少しスクロールが必要です。" },
          { action: "右上の「追加」をタップします", detail: "名前はそのままで構いません。" },
        ],
        note: "iPhone では Safari からのみホーム画面に追加できます。普段 Chrome をお使いでも、この操作だけは Safari で行ってください。",
      },
      {
        key: "desktop",
        platform: "desktop",
        heading: "パソコン · Chrome / Edge",
        steps: [
          { action: "アドレスバー右端のインストールアイコンをクリックします", detail: "画面と下向き矢印が重なった形です。" },
          { action: "アイコンがない場合は ⋮ →「キャスト、保存、共有」→「ページをアプリとしてインストール」", detail: "Edge は ··· →「アプリ」→「このサイトをアプリとしてインストール」です。" },
          { action: "「インストール」をクリックします", detail: null },
        ],
        note: null,
      },
    ],
    questionsTitle: "つまずきやすいところ",
    questions: [
      { question: "メニューに「アプリをインストール」がありません", answer: "「ホーム画面に追加」で同じ結果になります。どちらも無い場合は他アプリ内のブラウザの可能性が高いので、Chrome または Safari で開き直してください。" },
      { question: "インストールに費用はかかりますか", answer: "かかりません。KORETAIL は無料で、登録・支払い・広告はありません。容量もほとんど使いません。" },
      { question: "オフラインでも見られますか", answer: "見られません。画面の数値はすべて公式のリアルタイム資料のため、開くたびにインターネット接続が必要です。" },
      { question: "削除したいです", answer: "ホーム画面のアイコンを長押しして削除またはアンインストールを選んでください。個人情報は保存されていません。" },
    ],
    closeLabel: "閉じる",
    doneTitle: "うまくいったかの確認",
    doneBody: "ホーム画面に KORETAIL のアイコンができていれば成功です。タップして上部にアドレスバーが無ければ、アプリとしてインストールされています。",
  },
};

export function installGuide(lang: InstallLang): InstallGuide {
  return GUIDE[lang];
}

/**
 * Which section to open first, from the user agent alone.
 *
 * Only ever chooses an ORDER. Every section stays on screen, because a
 * reader on a Galaxy may be installing for someone else's iPhone, and a
 * mis-detected browser must never hide the instructions that would have
 * worked.
 */
export function detectInstallPlatform(userAgent: string): InstallPlatform {
  const ua = userAgent.toLowerCase();
  // iPadOS reports itself as a Mac; the touch check is what separates them,
  // so callers that can see `maxTouchPoints` should pass it through the UA
  // string they build. Here the plain markers are enough.
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

/** Sections with the reader's own platform first, everything else after. */
export function orderedSections(guide: InstallGuide, platform: InstallPlatform): InstallSection[] {
  return [
    ...guide.sections.filter((section) => section.platform === platform),
    ...guide.sections.filter((section) => section.platform !== platform),
  ];
}
