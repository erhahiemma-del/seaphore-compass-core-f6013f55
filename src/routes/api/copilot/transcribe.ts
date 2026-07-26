import { createFileRoute } from "@tanstack/react-router";

/**
 * Speech-to-text endpoint for officer dictation.
 *
 * The browser records the microphone as PCM and uploads a complete WAV file.
 * This route forwards it to the Lovable AI gateway and pipes the SSE
 * transcript stream straight back to the client. The API key never leaves
 * the server.
 *
 * Intelligence note: this is a *transport* surface only. It produces the
 * officer's own words as text — it never interprets, enriches or routes
 * them. The transcript re-enters the platform through the same canonical
 * submission path as typed input, so no pipeline or provenance rule changes.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
]);

const EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
};

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/copilot/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return fail(503, "Voice input is not configured on this deployment.");

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          return fail(400, "Expected a multipart/form-data audio upload.");
        }

        let audio: File | null = null;
        try {
          const form = await request.formData();
          const entry = form.get("audio");
          if (entry instanceof File) audio = entry;
        } catch {
          return fail(400, "Malformed audio upload.");
        }

        if (!audio || audio.size === 0) return fail(400, "No audio was received.");
        if (audio.size < 2048) {
          return fail(400, "That recording was too short — please try again.");
        }
        if (audio.size > MAX_BYTES) {
          return fail(413, "Recording is too long. Please dictate in shorter segments.");
        }

        const baseType = (audio.type || "audio/wav").split(";")[0]!.trim();
        if (!ALLOWED_TYPES.has(baseType)) {
          return fail(400, `Unsupported audio format: ${baseType}`);
        }

        const upstreamForm = new FormData();
        upstreamForm.append("model", STT_MODEL);
        upstreamForm.append("file", audio, `dictation.${EXTENSIONS[baseType] ?? "wav"}`);
        upstreamForm.append("stream", "true");

        const upstream = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstreamForm,
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          console.error(`Transcription failed [${upstream.status}]: ${detail}`);
          const message =
            upstream.status === 429
              ? "Voice input is rate limited. Please wait a moment and retry."
              : upstream.status === 402
                ? "Voice input is unavailable: AI credits exhausted."
                : `Transcription failed (${upstream.status}).`;
          return fail(upstream.status, message);
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
