/**
 * useVoiceDictation — officer voice input for the Copilot command bar.
 *
 * Captures microphone audio as raw PCM via the Web Audio API, encodes a
 * complete 16 kHz mono WAV, and streams it to `/api/copilot/transcribe`.
 * Partial transcript deltas are surfaced live so the officer can see the
 * words as they are recognised.
 *
 * The hook never submits: it returns text. The officer reviews and decides.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type DictationState = "idle" | "recording" | "transcribing";

/** Why dictation is unavailable or stopped — drives the officer-facing copy. */
export type DictationIssueCode =
  | "unsupported-browser"
  | "insecure-context"
  | "permission-denied"
  | "permission-dismissed"
  | "no-microphone"
  | "microphone-busy"
  | "empty-recording"
  | "no-speech"
  | "transcription-failed";

export interface DictationIssue {
  code: DictationIssueCode;
  /** One-line headline. */
  title: string;
  /** What happened, in plain language. */
  detail: string;
  /** What the officer can do about it. Always offers a way forward. */
  hint: string;
  /** True when typing is the only remaining route (mic cannot be used at all). */
  blocking: boolean;
}

export type DictationPermission = "unknown" | "prompt" | "granted" | "denied";

interface Options {
  /** Called with each growing transcript while streaming (interim). */
  onPartial?: (text: string) => void;
  /** Called once with the final transcript. */
  onFinal?: (text: string) => void;
  /** Called with a structured, explainable failure. */
  onError?: (issue: DictationIssue) => void;
  /** Hard cap so a forgotten open mic can't grow unbounded. */
  maxSeconds?: number;
}

const TYPE_FALLBACK = "You can type the investigation instead — nothing is lost.";

const ISSUES: Record<DictationIssueCode, Omit<DictationIssue, "code">> = {
  "unsupported-browser": {
    title: "Voice input isn't available in this browser",
    detail: "This browser doesn't expose microphone capture to the Copilot.",
    hint: `Try Chrome, Edge or Safari. ${TYPE_FALLBACK}`,
    blocking: true,
  },
  "insecure-context": {
    title: "Voice input needs a secure connection",
    detail: "Browsers only release the microphone over HTTPS or on localhost.",
    hint: `Reopen Seaphore on its https:// address. ${TYPE_FALLBACK}`,
    blocking: true,
  },
  "permission-denied": {
    title: "Microphone access is blocked",
    detail: "This browser has blocked Seaphore from using the microphone.",
    hint: `Click the lock or camera icon in the address bar, set Microphone to Allow, then reload. ${TYPE_FALLBACK}`,
    blocking: true,
  },
  "permission-dismissed": {
    title: "Microphone permission wasn't granted",
    detail: "The permission prompt was closed before access was allowed.",
    hint: `Press the microphone button again and choose Allow. ${TYPE_FALLBACK}`,
    blocking: false,
  },
  "no-microphone": {
    title: "No microphone was found",
    detail: "This device has no microphone the browser can reach.",
    hint: `Connect a headset or microphone, then reload. ${TYPE_FALLBACK}`,
    blocking: true,
  },
  "microphone-busy": {
    title: "The microphone is in use",
    detail: "Another application or browser tab is holding the microphone.",
    hint: `Close the other call or recording, then try again. ${TYPE_FALLBACK}`,
    blocking: false,
  },
  "empty-recording": {
    title: "That recording was empty",
    detail: "No audio reached the Copilot — the microphone may be muted.",
    hint: "Check the mute switch and input level, then record again.",
    blocking: false,
  },
  "no-speech": {
    title: "No speech was detected",
    detail: "The recording contained audio but no recognisable words.",
    hint: "Speak a little closer to the microphone and try again.",
    blocking: false,
  },
  "transcription-failed": {
    title: "Transcription failed",
    detail: "The transcription service could not process the recording.",
    hint: `Try again in a moment. ${TYPE_FALLBACK}`,
    blocking: false,
  },
};

function buildIssue(code: DictationIssueCode, detail?: string): DictationIssue {
  const base = ISSUES[code];
  return { code, ...base, detail: detail ?? base.detail };
}


const TARGET_RATE = 16000;

function downsample(chunks: Float32Array[], from: number, to: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  if (to >= from) return merged;

  const ratio = from / to;
  const out = new Float32Array(Math.floor(merged.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), merged.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += merged[j]!;
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function useVoiceDictation(options: Options = {}) {
  const { onPartial, onFinal, onError, maxSeconds = 120 } = options;

  const [state, setState] = useState<DictationState>("idle");
  const [supported, setSupported] = useState(true);
  /** Set when the mic can never work here (unsupported / insecure origin). */
  const [unavailable, setUnavailable] = useState<DictationIssue | null>(null);
  const [permission, setPermission] = useState<DictationPermission>("unknown");
  /** The most recent failure, kept so the UI can show persistent guidance. */
  const [issue, setIssue] = useState<DictationIssue | null>(null);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Keep the latest callbacks without re-creating start/stop.
  const cbRef = useRef({ onPartial, onFinal, onError });
  cbRef.current = { onPartial, onFinal, onError };

  const raise = useCallback((code: DictationIssueCode, detail?: string) => {
    const next = buildIssue(code, detail);
    setIssue(next);
    cbRef.current.onError?.(next);
    return next;
  }, []);

  const clearIssue = useCallback(() => setIssue(null), []);

  // Capability + secure-origin detection. Distinguishing these two up front
  // means the officer is told *why* the button is dead, never just that it is.
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const hasAudioContext =
      typeof window.AudioContext !== "undefined" ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
        "undefined";
    const hasCapture = !!navigator.mediaDevices?.getUserMedia;

    if (!hasCapture && window.isSecureContext === false) {
      setSupported(false);
      setUnavailable(buildIssue("insecure-context"));
      return;
    }
    if (!hasCapture || !hasAudioContext) {
      setSupported(false);
      setUnavailable(buildIssue("unsupported-browser"));
      return;
    }
    setSupported(true);
    setUnavailable(null);
  }, []);

  // Track the browser's own permission state so the mic button can warn the
  // officer *before* they press it, and recover the moment they unblock it.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;

    const sync = () => {
      if (!status || cancelled) return;
      const next = status.state as DictationPermission;
      setPermission(next);
      if (next === "denied") setIssue(buildIssue("permission-denied"));
      else setIssue((current) => (current?.code === "permission-denied" ? null : current));
    };

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        sync();
        result.addEventListener("change", sync);
      })
      .catch(() => undefined); // Firefox/Safari may not expose the microphone name.

    return () => {
      cancelled = true;
      status?.removeEventListener("change", sync);
    };
  }, []);


  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => undefined);
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "dictation.wav");

      const response = await fetch("/api/copilot/transcribe", { method: "POST", body: form });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          (detail as { error?: string } | null)?.error ?? `Transcription failed (${response.status}).`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let text = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              type?: string;
              delta?: string;
              text?: string;
            };
            if (event.type === "transcript.text.delta" && event.delta) {
              text += event.delta;
              cbRef.current.onPartial?.(text);
            } else if (event.type === "transcript.text.done" && typeof event.text === "string") {
              text = event.text;
            }
          } catch {
            // Ignore keep-alive / non-JSON frames.
          }
        }
      }

      const final = text.trim();
      if (!final) throw new Error("No speech was detected — please try again.");
      cbRef.current.onFinal?.(final);
    } catch (error) {
      cbRef.current.onError?.(
        error instanceof Error ? error.message : "Voice input failed. Please try again.",
      );
    } finally {
      setState("idle");
    }
  }, []);

  const finish = useCallback(async () => {
    const rate = ctxRef.current?.sampleRate ?? TARGET_RATE;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    teardown();

    if (cancelledRef.current) {
      setState("idle");
      return;
    }

    const samples = downsample(chunks, rate, TARGET_RATE);
    const blob = encodeWav(samples, TARGET_RATE);
    if (blob.size < 2048) {
      setState("idle");
      cbRef.current.onError?.("That recording was empty — please try again.");
      return;
    }
    await transcribe(blob);
  }, [teardown, transcribe]);

  const start = useCallback(async () => {
    if (!supported) {
      cbRef.current.onError?.("Voice input is not supported in this browser.");
      return;
    }
    cancelledRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      cbRef.current.onError?.("Microphone access is needed to dictate an investigation.");
      return;
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);

    node.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunksRef.current.push(new Float32Array(input));
      let peak = 0;
      for (let i = 0; i < input.length; i += 32) peak = Math.max(peak, Math.abs(input[i]!));
      setLevel(peak);
    };

    source.connect(node);
    node.connect(ctx.destination);

    streamRef.current = stream;
    ctxRef.current = ctx;
    sourceRef.current = source;
    nodeRef.current = node;
    setState("recording");

    timerRef.current = setTimeout(() => void finish(), maxSeconds * 1000);
  }, [supported, maxSeconds, finish]);

  const stop = useCallback(() => void finish(), [finish]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    chunksRef.current = [];
    teardown();
    setState("idle");
  }, [teardown]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  return { state, supported, level, start, stop, cancel, toggle };
}
