"use client";

import { Mic } from "lucide-react";

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

export default function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<AnyRecognition>(null);

  useEffect(() => {
    // Check browser support (Chrome, Edge, Safari)
    const SR =
      (window as Record<string, AnyRecognition>).SpeechRecognition ||
      (window as Record<string, AnyRecognition>).webkitSpeechRecognition;

    if (!SR) {
      setSupported(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: AnyRecognition) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event: AnyRecognition) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [onTranscript]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`inline-flex items-center gap-2 h-control px-3.5 rounded-control text-sm font-medium transition-colors duration-150 border
        ${
          isListening
            ? "bg-danger-bg border-danger text-danger-fg"
            : "bg-surface border-border text-text-2 hover:border-border-strong hover:text-text"
        }`}
      title={isListening ? "Stop recording" : "Start voice input"}
    >
      {/* Mic icon */}
      <Mic size={18} strokeWidth={1.75} />
      {isListening ? "Stop" : "Voice"}

      {/* Pulsing indicator when recording */}
      {isListening && (
        <span className="w-2 h-2 bg-danger rounded-full animate-pulse" />
      )}
    </button>
  );
}
