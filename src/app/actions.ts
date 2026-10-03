"use server";

import { redirect } from "next/navigation";

import { cleanupTranscriptText } from "@/lib/cleanup-server";

export async function cleanupAction(formData: FormData) {
  const raw = String(formData.get("transcript") ?? "");
  const transcript = raw.trim();
  const query = new URLSearchParams();

  if (!transcript) {
    query.set("error", "Nothing to clean yet. Paste or record some speech first.");
    if (raw) query.set("raw", raw);
    redirect(`/?${query.toString()}`);
  }

  const result = await cleanupTranscriptText(transcript);
  query.set("raw", transcript);
  query.set("clean", result.text);
  query.set("source", result.source);
  if (result.warning) query.set("warning", result.warning);
  redirect(`/?${query.toString()}`);
}
