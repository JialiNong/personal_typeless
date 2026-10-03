import { cleanTranscriptLocally } from "@/lib/cleanup";
import type { CleanupSource } from "@/lib/constants";

const SYSTEM_PROMPT = `You edit spoken notes for a bilingual speaker of Chinese and English.

Turn messy speech into clean, structured text.
- Remove fillers and 口癖: um, uh, like (when filler), you know, I mean, 那个, 就是, 然后, 嗯, 啊, 呃.
- Keep the speaker's meaning, voice, and original language mix. Do not translate.
- Use short paragraphs. Use a list only when the speaker made distinct points.
- Do not invent facts, titles, or details that were not said.
- Return only the cleaned text.`;

export type CleanupResult = {
  text: string;
  source: CleanupSource;
  warning?: string;
};

export async function cleanupTranscriptText(transcript: string): Promise<CleanupResult> {
  const localText = cleanTranscriptLocally(transcript);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { text: localText, source: "local" };
  }

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!response.ok) {
      return {
        text: localText,
        source: "local",
        warning: "OpenAI returned an error, so Typeless used the local cleanup instead.",
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return {
        text: localText,
        source: "local",
        warning: "OpenAI sent an empty reply, so Typeless used local cleanup.",
      };
    }

    return { text, source: "openai" };
  } catch {
    return {
      text: localText,
      source: "local",
      warning: "OpenAI was unreachable, so Typeless used local cleanup.",
    };
  }
}
