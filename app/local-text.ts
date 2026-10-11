import type { Lang } from "./retailpulse-data";

/** One localized string from the four-language record. Shared by the shell and the split-out views. */
export function localText(lang: Lang, values: Record<Lang, string>) {
  return values[lang];
}
