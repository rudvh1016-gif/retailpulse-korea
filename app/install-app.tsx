"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  detectInstallPlatform,
  installGuide,
  orderedSections,
  type InstallLang,
  type InstallPlatform,
} from "../lib/install-guide";

/**
 * The "앱처럼 설치하기" header button and its guide.
 *
 * Two things a reader needs, in this order:
 *
 *   1. If the browser will do it in one tap, offer that tap. Chrome fires
 *      `beforeinstallprompt` when the site meets its install criteria; the
 *      event is kept so the install can happen from a button the reader can
 *      actually find, instead of a banner they may never see.
 *   2. Otherwise, the manual steps — which is every iPhone, always, because
 *      Safari has no install API at all.
 *
 * Every platform's steps stay on screen; detection only decides which one is
 * listed first. A wrong guess must never hide the instructions that work.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

/**
 * Return the boundary target for a modal Tab press. A `null` result means
 * the browser can perform its normal move between controls in the middle.
 * Keeping the boundary calculation pure makes the wrap behaviour testable
 * without pretending Node has a browser focus model.
 */
export function dialogTabTargetIndex(
  activeIndex: number,
  focusableCount: number,
  backwards: boolean,
): number | null {
  if (focusableCount <= 0) return null;
  if (activeIndex < 0) return backwards ? focusableCount - 1 : 0;
  if (backwards && activeIndex === 0) return focusableCount - 1;
  if (!backwards && activeIndex === focusableCount - 1) return 0;
  return null;
}

/** Standalone means the page is already running as the installed app. */
function runningInstalled(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  // iOS Safari never matches display-mode; it sets this legacy flag instead.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

/*
 * The browser is an external store, not React state.
 *
 * The server has no user agent and no display mode, so both readings must
 * start from a server snapshot and re-read after hydration; doing that with
 * `useState` + an effect is exactly the cascading render React now warns
 * about. `useSyncExternalStore` is the supported way to read a value that
 * only the client can know.
 */
function subscribeToDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The user agent never changes for the life of the document. */
function subscribeToNothing() {
  return () => {};
}

export function InstallAppButton({ lang }: { lang: InstallLang }) {
  const guide = installGuide(lang);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Set when the install completes in THIS tab, which stays a browser tab —
  // its display mode does not change, so the event is the only evidence.
  const [justInstalled, setJustInstalled] = useState(false);
  const platform = useSyncExternalStore<InstallPlatform>(
    subscribeToNothing,
    () => detectInstallPlatform(window.navigator.userAgent),
    () => "android",
  );
  const standalone = useSyncExternalStore(subscribeToDisplayMode, runningInstalled, () => false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const done = () => { setJustInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = triggerRef.current;

    // Start at the top of this long guide. Focusing the last (close) button
    // would immediately scroll a phone reader past all of the instructions.
    dialog.focus({ preventScroll: true });

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const targetIndex = dialogTabTargetIndex(activeIndex, focusable.length, event.shiftKey);
      if (targetIndex === null) return;
      event.preventDefault();
      focusable[targetIndex].focus();
    };

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", keepFocusInside);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  async function installNow() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // The event is single-use: Chrome will fire a fresh one if it still
    // applies, so drop this one either way rather than re-prompting a
    // reader who already said no.
    setDeferred(null);
    if (choice.outcome === "accepted") setJustInstalled(true);
  }

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="install-app-button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-controls="install-dialog"
      aria-expanded={open}
    >
      {guide.buttonLabel}
    </button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
        id="install-dialog"
        className="modal install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        aria-describedby="install-description"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">KORETAIL · INSTALL</p>
        <h2 id="install-title">{installed ? guide.installedTitle : guide.title}</h2>

        {installed ? <p id="install-description" className="install-intro">{guide.installedBody}</p> : <>
          <p id="install-description" className="install-intro">{guide.intro}</p>

          <ul className="install-benefits">
            {guide.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
          </ul>

          {deferred && <div className="install-prompt">
            <button className="install-prompt-action" onClick={installNow}>{guide.promptLabel}</button>
            <p>{guide.promptNote}</p>
          </div>}

          {orderedSections(guide, platform).map((section) => <section key={section.key} className="install-section">
            <h3>{section.heading}</h3>
            <ol>
              {section.steps.map((step) => <li key={step.action}>
                <strong>{step.action}</strong>
                {step.detail && <span>{step.detail}</span>}
              </li>)}
            </ol>
            {section.note && <p className="install-note">{section.note}</p>}
          </section>)}

          <section className="install-section install-done">
            <h3>{guide.doneTitle}</h3>
            <p>{guide.doneBody}</p>
          </section>

          <section className="install-section">
            <h3>{guide.questionsTitle}</h3>
            <dl className="install-questions">
              {guide.questions.map((item) => <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>)}
            </dl>
          </section>
        </>}

        <button onClick={() => setOpen(false)}>{guide.closeLabel}</button>
      </div>
    </div>}
  </>;
}
