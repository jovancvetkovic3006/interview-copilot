import { describe, expect, it } from "vitest";
import {
  getBrowserSpeechLanguage,
  normalizeSpeechRecognitionLang,
  resolveSpeechRecognitionLanguage,
  speechLanguageDisplayLabel,
} from "./speech-recognition-language";

describe("normalizeSpeechRecognitionLang", () => {
  it("maps Serbian locale variants to sr-RS", () => {
    expect(normalizeSpeechRecognitionLang("sr")).toBe("sr-RS");
    expect(normalizeSpeechRecognitionLang("sr-Latn-RS")).toBe("sr-RS");
    expect(normalizeSpeechRecognitionLang("sr-Cyrl-RS")).toBe("sr-RS");
  });

  it("maps bare en to en-US", () => {
    expect(normalizeSpeechRecognitionLang("en")).toBe("en-US");
  });

  it("passes through explicit tags", () => {
    expect(normalizeSpeechRecognitionLang("de-DE")).toBe("de-DE");
  });
});

describe("resolveSpeechRecognitionLanguage", () => {
  it("uses explicit Serbian mode", () => {
    expect(resolveSpeechRecognitionLanguage("sr-RS")).toBe("sr-RS");
  });

  it("uses explicit English mode", () => {
    expect(resolveSpeechRecognitionLanguage("en-US")).toBe("en-US");
  });

  it("falls back to browser when auto or omitted", () => {
    const browser = getBrowserSpeechLanguage();
    expect(resolveSpeechRecognitionLanguage("auto")).toBe(browser);
    expect(resolveSpeechRecognitionLanguage(null)).toBe(browser);
    expect(resolveSpeechRecognitionLanguage(undefined)).toBe(browser);
  });
});

describe("speechLanguageDisplayLabel", () => {
  it("labels known tags", () => {
    expect(speechLanguageDisplayLabel("sr-RS")).toContain("Serbian");
    expect(speechLanguageDisplayLabel("en-US")).toContain("English");
  });
});
