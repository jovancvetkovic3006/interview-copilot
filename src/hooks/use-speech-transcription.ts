"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { transcriptionTrace, transcriptionTraceWarn } from "@/lib/transcription-trace";

interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface UseSpeechTranscriptionOptions {
  onTranscript?: (text: string) => void;
  language?: string;
}

/** If no STT activity for this long while recording, recreate the recognition instance. */
const WATCHDOG_IDLE_MS = 45_000;
/** Proactively rotate the recognition session before Chromium's ~60s continuous limit. */
const PROACTIVE_ROTATION_MS = 50_000;

export function useSpeechTranscription(options: UseSpeechTranscriptionOptions = {}) {
  const { onTranscript, language = "sr-RS" } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingActiveRef = useRef(false);
  const interimPendingRef = useRef("");
  const interimFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecoverableSpeechLogRef = useRef(0);
  const skipOnEndRestartUntilRef = useRef(0);
  const networkRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkBackoffMsRef = useRef(2000);
  const lastOnEndTraceRef = useRef(0);
  const sessionNetworkErrorsRef = useRef(0);
  const lastActivityRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const languageRef = useRef(language);
  const recreateRecognitionRef = useRef<() => void>(() => {});

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const clearNetworkRetryTimer = useCallback(() => {
    if (networkRetryTimerRef.current != null) {
      clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    }
  }, []);

  const clearInterimFlushTimer = useCallback(() => {
    if (interimFlushTimerRef.current != null) {
      clearTimeout(interimFlushTimerRef.current);
      interimFlushTimerRef.current = null;
    }
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current != null) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const scheduleInterimFlush = useCallback(() => {
    if (interimFlushTimerRef.current != null) return;
    interimFlushTimerRef.current = setTimeout(() => {
      interimFlushTimerRef.current = null;
      const t = interimPendingRef.current;
      setInterimText(t);
      if (t) {
        transcriptionTrace("interim (throttled)", {
          chars: t.length,
          preview: t.length > 96 ? `${t.slice(0, 96)}…` : t,
        });
      }
    }, 120);
  }, []);

  const teardownRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const attachRecognition = useCallback(
    (recognition: SpeechRecognition, isFreshSession: boolean) => {
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = languageRef.current;

      recognition.onstart = () => {
        networkBackoffMsRef.current = 2000;
        skipOnEndRestartUntilRef.current = 0;
        markActivity();
        if (isFreshSession) sessionStartedAtRef.current = Date.now();
        transcriptionTrace("recognition.onstart — listening");
        setSpeechNotice(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        markActivity();
        setSpeechNotice(null);
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const finalText = result[0].transcript.trim();
            if (finalText) {
              const segment: TranscriptSegment = {
                text: finalText,
                timestamp: Date.now(),
                isFinal: true,
              };
              setSegments((prev) => [...prev, segment]);
              transcriptionTrace("recognition final segment", {
                resultIndex: event.resultIndex,
                sliceIndex: i,
                chars: finalText.length,
                text: finalText.length > 200 ? `${finalText.slice(0, 200)}…` : finalText,
              });
              onTranscriptRef.current?.(finalText);
            }
            interimPendingRef.current = "";
            clearInterimFlushTimer();
            setInterimText("");
          } else {
            interim += result[0].transcript;
          }
        }
        if (interim) {
          markActivity();
          interimPendingRef.current = interim;
          scheduleInterimFlush();
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "no-speech") return;

        if (event.error === "aborted") {
          if (recordingActiveRef.current) {
            queueMicrotask(() => {
              if (!recognitionRef.current || !recordingActiveRef.current) return;
              try {
                recognitionRef.current.start();
              } catch {
                recreateRecognitionRef.current();
              }
            });
          }
          return;
        }

        if (event.error === "network") {
          sessionNetworkErrorsRef.current += 1;
          const n = sessionNetworkErrorsRef.current;
          if (recordingActiveRef.current && n >= 10) {
            setSpeechNotice(
              "Speech has had many connection errors this session. Try desktop Chrome/Edge (not an embedded browser), turn off VPN or strict ad-block, or Stop and try again later."
            );
          }
          const now = Date.now();
          if (now - lastRecoverableSpeechLogRef.current > 10_000) {
            lastRecoverableSpeechLogRef.current = now;
            transcriptionTrace("recognition recoverable (retry scheduled)", {
              error: event.error,
              message: event.message || undefined,
              active: recordingActiveRef.current,
              nextDelayMs: networkBackoffMsRef.current,
            });
          }

          const delay = networkBackoffMsRef.current;
          networkBackoffMsRef.current = Math.min(15_000, Math.floor(delay * 1.5));
          skipOnEndRestartUntilRef.current = now + delay + 500;
          clearNetworkRetryTimer();
          networkRetryTimerRef.current = setTimeout(() => {
            networkRetryTimerRef.current = null;
            skipOnEndRestartUntilRef.current = 0;
            if (recognitionRef.current && recordingActiveRef.current) {
              try {
                recognitionRef.current.start();
                markActivity();
              } catch {
                recreateRecognitionRef.current();
              }
            }
          }, delay);
          return;
        }

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          recordingActiveRef.current = false;
          teardownRecognition();
          clearWatchdog();
          setIsRecording(false);
          transcriptionTraceWarn("recognition stopped: mic blocked", event.error);
          setSpeechNotice(
            "Speech was blocked (microphone). Allow the microphone for this site, then tap Record again."
          );
          return;
        }

        transcriptionTraceWarn("recognition.onerror (unexpected)", {
          error: event.error,
          message: event.message || undefined,
          active: recordingActiveRef.current,
        });
        console.error("[transcription] Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        const willRestart = Boolean(recognitionRef.current && recordingActiveRef.current);
        const now = Date.now();
        if (now - lastOnEndTraceRef.current > 8000) {
          lastOnEndTraceRef.current = now;
          transcriptionTrace("recognition.onend", { willRestart });
        }
        if (!recognitionRef.current || !recordingActiveRef.current) return;
        if (now < skipOnEndRestartUntilRef.current) return;

        // Proactive rotation before Chromium's session cap instead of a fragile restart loop.
        if (now - sessionStartedAtRef.current >= PROACTIVE_ROTATION_MS) {
          transcriptionTrace("recognition proactive rotation after session age");
          recreateRecognitionRef.current();
          return;
        }

        try {
          recognitionRef.current.start();
          markActivity();
          transcriptionTrace("recognition restarted after onend");
        } catch {
          transcriptionTraceWarn("recognition restart after onend failed — recreating");
          recreateRecognitionRef.current();
        }
      };
    },
    [clearInterimFlushTimer, clearNetworkRetryTimer, clearWatchdog, markActivity, scheduleInterimFlush, teardownRecognition]
  );

  const startRecognitionInstance = useCallback(
    (isFreshSession: boolean) => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return false;

      teardownRecognition();
      const recognition = new SpeechRecognition();
      attachRecognition(recognition, isFreshSession);
      recognitionRef.current = recognition;
      try {
        recognition.start();
        markActivity();
        return true;
      } catch (e) {
        recognitionRef.current = null;
        transcriptionTraceWarn("recognition.start() threw", e);
        return false;
      }
    },
    [attachRecognition, markActivity, teardownRecognition]
  );

  const recreateRecognition = useCallback(() => {
    if (!recordingActiveRef.current) return;
    transcriptionTrace("recreating SpeechRecognition instance");
    const ok = startRecognitionInstance(true);
    if (!ok) {
      setSpeechNotice("Speech recognition paused — tap Stop then Record to restart.");
    }
  }, [startRecognitionInstance]);

  useEffect(() => {
    recreateRecognitionRef.current = recreateRecognition;
  }, [recreateRecognition]);

  useEffect(() => {
    return () => {
      clearInterimFlushTimer();
      clearNetworkRetryTimer();
      clearWatchdog();
    };
  }, [clearInterimFlushTimer, clearNetworkRetryTimer, clearWatchdog]);

  const startRecording = useCallback(() => {
    clearNetworkRetryTimer();
    clearWatchdog();
    skipOnEndRestartUntilRef.current = 0;
    networkBackoffMsRef.current = 2000;
    sessionNetworkErrorsRef.current = 0;
    sessionStartedAtRef.current = Date.now();
    lastActivityRef.current = Date.now();

    transcriptionTrace("startRecording invoked", { lang: language, secureContext: window.isSecureContext });

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      transcriptionTraceWarn("abort: no SpeechRecognition API (use Chrome or Edge on desktop)");
      setIsSupported(false);
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      transcriptionTraceWarn("abort: insecure context (need https or localhost)");
      setSpeechNotice("Speech needs a secure page (https or localhost). Open the app over HTTPS and try again.");
      return;
    }

    setSpeechNotice(null);
    recordingActiveRef.current = true;

    const ok = startRecognitionInstance(true);
    if (ok) {
      setIsRecording(true);
      transcriptionTrace("recognition.start() ok");
      watchdogTimerRef.current = setInterval(() => {
        if (!recordingActiveRef.current) return;
        const idle = Date.now() - lastActivityRef.current;
        const sessionAge = Date.now() - sessionStartedAtRef.current;
        if (idle >= WATCHDOG_IDLE_MS || sessionAge >= PROACTIVE_ROTATION_MS) {
          transcriptionTrace("watchdog triggered recreate", { idle, sessionAge });
          recreateRecognitionRef.current();
        }
      }, 15_000);
    } else {
      recordingActiveRef.current = false;
      setSpeechNotice("Could not start speech recognition. Try again or use Chrome / Edge.");
    }
  }, [language, clearNetworkRetryTimer, clearWatchdog, startRecognitionInstance]);

  const stopRecording = useCallback(() => {
    transcriptionTrace("stopRecording");
    clearNetworkRetryTimer();
    clearWatchdog();
    skipOnEndRestartUntilRef.current = 0;
    networkBackoffMsRef.current = 2000;
    sessionNetworkErrorsRef.current = 0;
    recordingActiveRef.current = false;
    setSpeechNotice(null);
    interimPendingRef.current = "";
    clearInterimFlushTimer();
    teardownRecognition();
    setIsRecording(false);
    setInterimText("");
  }, [clearInterimFlushTimer, clearNetworkRetryTimer, clearWatchdog, teardownRecognition]);

  const getFullTranscript = useCallback(() => {
    return segments.map((s) => s.text).join(" ");
  }, [segments]);

  const clearTranscript = useCallback(() => {
    transcriptionTrace("clearTranscript (local segments + interim)");
    interimPendingRef.current = "";
    clearInterimFlushTimer();
    setSegments([]);
    setInterimText("");
  }, [clearInterimFlushTimer]);

  return {
    isRecording,
    isSupported,
    speechNotice,
    interimText,
    segments,
    startRecording,
    stopRecording,
    getFullTranscript,
    clearTranscript,
  };
}
