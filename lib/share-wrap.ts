/**
 * Line breaking for the share image, independent of the canvas so it can be
 * tested. Han, kana and full-width punctuation break between any two
 * characters, as Chinese and Japanese are set; Korean and Latin break
 * between words. A closing mark (。、」) never starts a line: it is pulled
 * back onto the line before, even if that line then runs a little long.
 */
// Escaped so the range ends are not mistaken for printed copy by the font subset corpus.
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;
const CLOSING = /^[。、，．）」』】〕〉》！？：；,.)\]!?%]/;

export function breakUnits(text: string): string[] {
  const units: string[] = [];
  let word = "";
  for (const character of text) {
    if (CJK.test(character)) {
      if (word) { units.push(word); word = ""; }
      units.push(character);
    } else if (/\s/.test(character)) {
      units.push(word + character);
      word = "";
    } else {
      word += character;
    }
  }
  if (word) units.push(word);
  return units;
}

export function wrapText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => { if (line.trim()) lines.push(line.trimEnd()); line = ""; };
  for (const unit of breakUnits(text)) {
    if (measure(line + unit) <= maxWidth) { line += unit; continue; }
    push();
    line = unit.trimStart();
    while (line && measure(line) > maxWidth) {
      let cut = line.length;
      while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  push();
  for (let index = 1; index < lines.length; index += 1) {
    while (CLOSING.test(lines[index])) {
      lines[index - 1] += lines[index][0];
      lines[index] = lines[index].slice(1);
    }
  }
  return lines.filter((value) => value.length > 0);
}
