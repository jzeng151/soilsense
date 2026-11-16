// WCAG 3.1.2 (Language of Parts): text in another language than the page (English) must carry a lang tag,
// so screen readers switch pronunciation. Chat messages can be in any language, so we detect it.
import { franc } from "franc-min";

/** ISO 639-3 (franc) → BCP 47, for languages farmers are likely to use. */
const TAGS: Record<string, string> = {
  spa: "es", fra: "fr", deu: "de", hin: "hi", por: "pt", ita: "it", nld: "nl", rus: "ru", jpn: "ja",
  kor: "ko", cmn: "zh", vie: "vi", arb: "ar", ukr: "uk", pol: "pl", tgl: "tl", hmn: "hmn", tur: "tr",
};

/**
 * The language of a passage, or undefined when it is English or too short to tell
 * (then it simply inherits the page's lang="en").
 */
export function detectLang(text: string): string | undefined {
  const t = text.replace(/[`*_#>|[\]()-]/g, " ").trim();
  if (t.length < 20) return undefined;
  const code = franc(t, { minLength: 20 });
  return TAGS[code];
}
