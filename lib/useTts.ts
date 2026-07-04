"use client";
// Text-to-speech for the Listening game and listen-mode drills, backed by Gemini
// TTS via /api/tts. Synthesizes WAV audio server-side and plays it through an
// <audio> element. Mirrors the old Web Speech hook's surface (supported /
// speaking / speak / stop) plus a `loading` flag.
//
// Two caches avoid re-synthesizing: the server stores each clip on disk
// (content-addressed), and this hook keeps an in-session map of text -> object
// URL so replaying the exact same clip is instant with no network call at all.
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseTts {
  supported: boolean;
  speaking: boolean;
  loading: boolean;
  error: boolean; // last speak() failed to synthesize (e.g. TTS rate-limited/unavailable)
  speak: (text: string, opts?: { rate?: number }) => void;
  stop: () => void;
}

// Module-level so the cache survives component remounts within a page session.
// Object URLs are intentionally not revoked for the session's lifetime.
const blobCache = new Map<string, string>();

export function useTts(): UseTts {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof window !== "undefined" && "Audio" in window) setSupported(true);
    const audio = new Audio();
    audio.onplay = () => setSpeaking(true);
    audio.onended = () => setSpeaking(false);
    audio.onpause = () => setSpeaking(false);
    audio.onerror = () => setSpeaking(false);
    audioRef.current = audio;
    return () => {
      abortRef.current?.abort();
      audio.pause();
    };
  }, []);

  const play = useCallback((url: string, rate?: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    audio.playbackRate = rate ?? 1;
    void audio.play().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speak = useCallback((text: string, opts?: { rate?: number }) => {
    const audio = audioRef.current;
    if (!text.trim() || !audio) return;
    abortRef.current?.abort();
    audio.pause();
    setError(false); // fresh attempt

    // Instant replay from the in-session cache — no fetch, no loading state.
    const cached = blobCache.get(text);
    if (cached) { play(cached, opts?.rate); return; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("TTS failed");
        const blob = await res.blob();
        if (ctrl.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        blobCache.set(text, url);
        play(url, opts?.rate);
      })
      .catch(() => {
        // Ignore user-initiated aborts; surface real synthesis failures
        // (rate-limited / unavailable) so the UI can show an indicator.
        if (!ctrl.signal.aborted) setError(true);
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
  }, [play]);

  return { supported, speaking, loading, error, speak, stop };
}
