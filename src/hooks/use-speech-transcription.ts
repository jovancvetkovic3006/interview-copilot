"use client";

import { useState, useRef, useCallback } from "react";

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
  const [interimText, setInterimText] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
            onTranscript?.(finalText);
          }
          setInterimText("");
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" is benign — just means silence was detected
      if (event.error === "no-speech") return;
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setIsSupported(false);
      }
      // Auto-restart on recoverable errors
      if (event.error === "network" || event.error === "aborted") {
        setTimeout(() => {
          if (recognitionRef.current && isRecording) {
            try {
              recognitionRef.current.start();
            } catch {
              // Already started
            }
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (speech recognition stops after silence)
      if (recognitionRef.current && isRecording) {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [language, onTranscript, isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText("");
  }, []);

  const getFullTranscript = useCallback(() => {
    return segments.map((s) => s.text).join(" ");
  }, [segments]);

  const clearTranscript = useCallback(() => {
    setSegments([]);
    setInterimText("");
  }, []);

  return {
    isRecording,
    isSupported,
    interimText,
    segments,
    startRecording,
    stopRecording,
    getFullTranscript,
    clearTranscript,
  };
}
