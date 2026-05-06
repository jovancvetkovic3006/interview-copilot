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

export function useSpeechTranscription(options: UseSpeechTranscriptionOptions = {}) {
  const { onTranscript, language = "en-US" } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  /** Shown when the browser STT hits a recoverable error (e.g. cloud `network`). */
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /** Must be read from onerror/onend — `isRecording` state in those closures is often stale. */
  const recordingActiveRef = useRef(false);
  /** Throttle interim `setState` so rapid STT updates do not thrash React layout. */
  const interimPendingRef = useRef("");
  const interimFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Avoid spamming devtools when Chromium fires many `network` / `aborted` STT events. */
  const lastRecoverableSpeechLogRef = useRef(0);
  /** Suppress `onend` → immediate `start()` while we recover from `network` (avoids retry storms). */
  const skipOnEndRestartUntilRef = useRef(0);
  const networkRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Delay before next `start()` after `network` / `aborted`; reset on successful `onstart`. */
  const networkBackoffMsRef = useRef(2000);
  const lastOnEndTraceRef = useRef(0);
  /** Total `network`/`aborted` this record session (reset on start/stop) — for rare “many failures” hint only. */
  const sessionNetworkErrorsRef = useRef(0);

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

  useEffect(() => {
    return () => {
      clearInterimFlushTimer();
      clearNetworkRetryTimer();
    };
  }, [clearInterimFlushTimer, clearNetworkRetryTimer]);

  const startRecording = useCallback(() => {
    clearNetworkRetryTimer();
    skipOnEndRestartUntilRef.current = 0;
    networkBackoffMsRef.current = 2000;
    sessionNetworkErrorsRef.current = 0;

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

    // IMPORTANT: `recognition.start()` must run in the same user-activation turn as the click.
    // Awaiting getUserMedia first defers this to a microtask and Chrome will not start listening
    // (often with no visible error), so we rely on Web Speech to trigger the mic prompt.

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      networkBackoffMsRef.current = 2000;
      skipOnEndRestartUntilRef.current = 0;
      transcriptionTrace("recognition.onstart — listening");
      setSpeechNotice(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
            onTranscript?.(finalText);
          }
          interimPendingRef.current = "";
          clearInterimFlushTimer();
          setInterimText("");
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        interimPendingRef.current = interim;
        scheduleInterimFlush();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" is benign — just means silence was detected
      if (event.error === "no-speech") return;

      // `aborted` is common between phrases in Chromium — do NOT treat like `network` or we block
      // `onend` restarts and the next finals never arrive (looks like transcription “stops”).
      if (event.error === "aborted") {
        if (recordingActiveRef.current) {
          queueMicrotask(() => {
            if (!recognitionRef.current || !recordingActiveRef.current) return;
            try {
              recognitionRef.current.start();
            } catch {
              // Already started — onend will retry
            }
          });
        }
        return;
      }

      // True network failures: back off and avoid racing `onend` with an immediate start loop.
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
            } catch {
              // Already started
            }
          }
        }, delay);
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recordingActiveRef.current = false;
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          try {
            recognitionRef.current.stop();
          } catch {
            /* ignore */
          }
          recognitionRef.current = null;
        }
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
      if (now < skipOnEndRestartUntilRef.current) {
        return;
      }
      // Auto-restart after silence (Chromium often ends the session between phrases even with continuous=true)
      try {
        recognitionRef.current.start();
        transcriptionTrace("recognition restarted after onend");
      } catch (e) {
        transcriptionTraceWarn("recognition restart after onend failed", e);
      }
    };

    recognitionRef.current = recognition;
    recordingActiveRef.current = true;
    try {
      recognition.start();
      setIsRecording(true);
      transcriptionTrace("recognition.start() ok");
    } catch (e) {
      recordingActiveRef.current = false;
      recognitionRef.current = null;
      transcriptionTraceWarn("recognition.start() threw", e);
      setSpeechNotice("Could not start speech recognition. Try again or use Chrome / Edge.");
    }
  }, [language, onTranscript, clearInterimFlushTimer, scheduleInterimFlush, clearNetworkRetryTimer]);

  const stopRecording = useCallback(() => {
    transcriptionTrace("stopRecording");
    clearNetworkRetryTimer();
    skipOnEndRestartUntilRef.current = 0;
    networkBackoffMsRef.current = 2000;
    sessionNetworkErrorsRef.current = 0;
    recordingActiveRef.current = false;
    setSpeechNotice(null);
    interimPendingRef.current = "";
    clearInterimFlushTimer();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText("");
  }, [clearInterimFlushTimer, clearNetworkRetryTimer]);

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
