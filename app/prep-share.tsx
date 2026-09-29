'use client';

import { useId, useRef, useState } from 'react';
import type { Lang } from './retailpulse-data';
import { shareCopy, shareText, type ShareDocument } from '../lib/prep-share';
import { wrapText } from '../lib/share-wrap';

type ShareStatus = 'idle' | 'copied' | 'copyFailed' | 'imageReady' | 'imageFailed' | 'shareChosen' | 'shareCancelled' | 'shareFailed';

const IMAGE_WIDTH = 1080;
const PAD = 72;

/**
 * Draws the share document on a white page and returns a PNG. It uses the
 * page's own font stack after the fonts have loaded, so the image carries
 * the same glyphs as the screen, and it makes no network request.
 */
export async function renderShareImage(doc: ShareDocument, fontFamily: string): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  const styles = {
    title: { font: `600 46px ${fontFamily}`, color: '#111111', lead: 60 },
    heading: { font: `600 30px ${fontFamily}`, color: '#111111', lead: 44 },
    text: { font: `400 30px ${fontFamily}`, color: '#111111', lead: 44 },
    item: { font: `400 28px ${fontFamily}`, color: '#111111', lead: 42 },
    note: { font: `400 22px ${fontFamily}`, color: '#666666', lead: 34 },
  } as const;
  const maxWidth = IMAGE_WIDTH - PAD * 2;
  const laid: Array<{ style: keyof typeof styles; text: string; y: number; rule?: boolean }> = [];
  let y = PAD;
  const place = (style: keyof typeof styles, text: string, before = 0) => {
    context.font = styles[style].font;
    y += before;
    for (const piece of wrapText(text, maxWidth, (value) => context.measureText(value).width)) { y += styles[style].lead; laid.push({ style, text: piece, y }); }
  };
  place('title', doc.title);
  for (const line of doc.lines) {
    if (line.kind === 'heading') { y += 18; laid.push({ style: 'heading', text: '', y: y + 4, rule: true }); place('heading', line.text, 12); }
    else if (line.kind === 'note') place('note', line.text, 6);
    else place(line.kind, line.text);
  }
  canvas.width = IMAGE_WIDTH;
  canvas.height = Math.min(y + PAD, 8000);
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('canvas_unavailable');
  draw.fillStyle = '#FFFFFF';
  draw.fillRect(0, 0, canvas.width, canvas.height);
  draw.textBaseline = 'alphabetic';
  for (const item of laid) {
    if (item.rule) { draw.fillStyle = '#e5e5e5'; draw.fillRect(PAD, item.y, maxWidth, 2); continue; }
    draw.font = styles[item.style].font;
    draw.fillStyle = styles[item.style].color;
    draw.fillText(item.text, PAD, item.y - 10);
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image_encode_failed'))), 'image/png'));
}

export function PrepShare({ lang, doc, fileName }: { lang: Lang; doc: ShareDocument; fileName: string }) {
  const id = useId();
  const section = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ShareStatus>('idle');
  const [fallback, setFallback] = useState(false);
  const text = shareText(doc);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('copyFailed');
      setFallback(true);
    }
  };
  const image = async () => {
    try {
      const family = getComputedStyle(section.current ?? document.body).fontFamily || 'sans-serif';
      const blob = await renderShareImage(doc, family);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus('imageReady');
    } catch {
      setStatus('imageFailed');
      setFallback(true);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: doc.title, text });
      setStatus('shareChosen');
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'shareCancelled' : 'shareFailed');
    }
  };

  return <div className="prep-block prep-share" ref={section} data-testid="prep-share" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{shareCopy.title[lang]}</h3>
    <div className="prep-share-actions">
      <button type="button" onClick={copy}>{shareCopy.copy[lang]}</button>
      <button type="button" onClick={image}>{shareCopy.image[lang]}</button>
      {canShare && <button type="button" onClick={share}>{shareCopy.share[lang]}</button>}
    </div>
    <p className="prep-note" role="status" aria-live="polite" data-testid="share-status" data-status={status}>{status === 'idle' ? '' : shareCopy[status][lang]}</p>
    {fallback && <label className="prep-share-fallback">{shareCopy.selectable[lang]}
      <textarea readOnly value={text} rows={12} onFocus={(event) => event.currentTarget.select()} data-testid="share-fallback"/>
    </label>}
    <details className="prep-evidence"><summary>{shareCopy.preview[lang]}</summary><pre className="prep-share-preview" data-testid="share-preview">{text}</pre></details>
  </div>;
}
