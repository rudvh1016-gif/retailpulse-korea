'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { siteOrigin } from './seo-config';
import { copySiteLink, shareSiteLink, siteShareUrl, type SiteShareResult } from '../lib/site-share';
import styles from './site-share.module.css';

const copy = {
  ko: {
    title: 'KORETAIL 함께 보기', help: '공항의 흐름과 여행 정보를 간편하게 나눠보세요.',
    share: '공유하기', busy: '준비 중…', copy: '링크 복사', link: '공유 링크',
    text: '인천공항의 흐름과 여행 준비 정보, KORETAIL',
    copied: '링크를 복사했어요. 원하는 곳에 공유해 주세요.',
    shared: '공유창을 열었어요. 아래에서 링크를 다시 복사할 수 있어요.',
    cancelled: '공유를 취소했어요. 링크는 아래에서 복사할 수 있어요.',
    manual: '자동 복사가 안 돼요. 아래 링크를 길게 누르거나 선택해 복사해 주세요.',
  },
  en: {
    title: 'Share KORETAIL', help: 'Pass along airport trends and travel information.',
    share: 'Share', busy: 'Preparing…', copy: 'Copy link', link: 'Share link',
    text: 'Incheon Airport trends and travel preparation with KORETAIL',
    copied: 'Link copied. Paste it wherever you like.',
    shared: 'Share sheet opened. You can also copy the link below.',
    cancelled: 'Sharing cancelled. You can still copy the link below.',
    manual: 'Automatic copying is unavailable. Press and hold or select the link below to copy it.',
  },
  zh: {
    title: '分享 KORETAIL', help: '轻松分享机场动态和出行信息。',
    share: '分享', busy: '准备中…', copy: '复制链接', link: '分享链接',
    text: '在 KORETAIL 查看仁川机场动态和出行准备信息',
    copied: '链接已复制，可粘贴到您想分享的地方。',
    shared: '已打开分享窗口，也可以复制下方链接。',
    cancelled: '已取消分享，仍可复制下方链接。',
    manual: '无法自动复制，请长按或选中下方链接进行复制。',
  },
  ja: {
    title: 'KORETAIL を共有', help: '空港の動向や旅行情報を手軽に共有できます。',
    share: '共有する', busy: '準備中…', copy: 'リンクをコピー', link: '共有リンク',
    text: '仁川空港の動向と旅行準備の情報を KORETAIL で',
    copied: 'リンクをコピーしました。好きな場所に貼り付けてください。',
    shared: '共有画面を開きました。下のリンクもコピーできます。',
    cancelled: '共有をキャンセルしました。下のリンクはコピーできます。',
    manual: '自動コピーできません。下のリンクを長押し、または選択してコピーしてください。',
  },
} as const;

export function SiteShare({ lang }: { lang: Lang }) {
  const id = useId();
  const words = copy[lang];
  const url = siteShareUrl(siteOrigin, lang);
  const [status, setStatus] = useState<SiteShareResult | 'idle'>('idle');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef(0);
  useLayoutEffect(() => () => { attempt.current++; }, []);

  const act = async (copyOnly = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++attempt.current;
    setBusy(true);
    setStatus('idle');
    setRevealed(true);
    const result = await (copyOnly
      ? copySiteLink(url, navigator)
      : shareSiteLink({ title: 'KORETAIL', text: words.text, url }, navigator));
    if (current !== attempt.current) return;
    setStatus(result);
    setBusy(false);
    inFlight.current = false;
  };

  return <div className={styles.share} data-testid="site-share" role="group" aria-labelledby={`${id}-title`}>
    <div className={styles.row}>
      <div className={styles.intro}>
        <p className={styles.title} id={`${id}-title`}>{words.title}</p>
        <p className={styles.help}>{words.help}</p>
      </div>
      <button type="button" className={styles.primary} onClick={() => void act()} disabled={busy} aria-busy={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>
        {busy ? words.busy : words.share}
      </button>
    </div>
    <p className={styles.status} role="status" aria-live="polite" data-status={status}>{status === 'idle' ? '' : words[status]}</p>
    {revealed && <div className={styles.linkRow}>
      <label className="sr-only" htmlFor={`${id}-url`}>{words.link}</label>
      <input id={`${id}-url`} type="url" name="site-share-url" readOnly value={url} spellCheck={false} autoComplete="off" onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} />
      <button type="button" className={styles.copy} onClick={() => void act(true)} disabled={busy}>{words.copy}</button>
    </div>}
  </div>;
}
