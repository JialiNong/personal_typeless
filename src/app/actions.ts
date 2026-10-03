"use server";

import { cleanupTranscriptText } from "@/lib/cleanup-server";

export async function cleanupAction(
  _previous: {
    raw: string;
    text: string;
    source: "openai" | "local" | "";
    error: string;
    warning: string;
  },
  formData: FormData,
) {
  const raw = String(formData.get("transcript") ?? "");
  const transcript = raw.trim();

  if (!transcript) {
    return {
      raw,
      text: "",
      source: "" as const,
      error: "Nothing to clean yet. Paste or record some speech first.",
      warning: "",
    };
  }

  const result = await cleanupTranscriptText(transcript);
  return {
    raw: transcript,
    text: result.text,
    source: result.source,
    error: "",
    warning: result.warning ?? "",
  };
}
