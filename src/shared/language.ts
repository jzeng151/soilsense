/** Web/planner languages. The Twilio phone line intentionally has its own EN/ES type. */
export const LANGUAGES = ["en", "es", "ko", "zh-Hans"] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_LOCALES: Record<Language, string> = { en: "en-US", es: "es-US", ko: "ko-KR", "zh-Hans": "zh-CN" };
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", es: "Español", ko: "한국어", "zh-Hans": "简体中文" };
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
export function parseLanguage(value: unknown): Language { return isLanguage(value) ? value : "en"; }
/** The model receives a trusted language name, never arbitrary client prompt text. */
export function responseLanguageInstruction(language: Language): string {
  const names: Record<Language, string> = { en: "English", es: "Spanish (Español)", ko: "Korean (한국어)", "zh-Hans": "Simplified Chinese (简体中文)" };
  return `Respond in ${names[language]}. Keep NASA/USDA product names, source citations, numbers and US units unchanged. Translate explanations, not the evidence or measurements. Follow this language preference unless the user explicitly requests another language.`;
}
