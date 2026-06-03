/** Host-selected mode for browser Web Speech API (`recognition.lang`). */
export type SpeechLanguageMode = "auto" | "sr-RS" | "en-US";

const LANG_ALIASES: Record<string, string> = {
  sr: "sr-RS",
  "sr-latn": "sr-RS",
  "sr-latn-rs": "sr-RS",
  "sr-cyrl": "sr-RS",
  "sr-cyrl-rs": "sr-RS",
  "sr-sp": "sr-RS",
  en: "en-US",
};

/** Map browser/OS tags to Chrome Web Speech BCP-47 codes. */
export function normalizeSpeechRecognitionLang(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) return "en-US";
  const lower = trimmed.toLowerCase();
  if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
  if (lower.startsWith("sr")) return "sr-RS";
  return trimmed;
}

export function getBrowserSpeechLanguage(): string {
  if (typeof navigator === "undefined") return "en-US";
  const lang = navigator.language?.trim();
  return lang ? normalizeSpeechRecognitionLang(lang) : "en-US";
}

/** Resolve the BCP-47 tag passed to `SpeechRecognition.lang`. */
export function resolveSpeechRecognitionLanguage(mode?: SpeechLanguageMode | null): string {
  if (mode && mode !== "auto") {
    return normalizeSpeechRecognitionLang(mode);
  }
  return getBrowserSpeechLanguage();
}

export const SPEECH_LANGUAGE_SETUP_OPTIONS: {
  value: SpeechLanguageMode;
  label: string;
  description: string;
}[] = [
  {
    value: "sr-RS",
    label: "Serbian",
    description: "Use for interviews spoken in Serbian (sr-RS in Chrome/Edge).",
  },
  {
    value: "en-US",
    label: "English",
    description: "Use when the interview is conducted in English.",
  },
  {
    value: "auto",
    label: "Browser default",
    description: "Follows your browser language — often wrong if the UI is English but speech is Serbian.",
  },
];

export function speechLanguageDisplayLabel(langTag: string): string {
  if (langTag === "sr-RS") return "Serbian (sr-RS)";
  if (langTag === "en-US") return "English (en-US)";
  return langTag;
}
