import { cleanTranscriptLocally } from "@/lib/cleanup";

const SYSTEM_PROMPT = `You edit spoken notes for a bilingual speaker of Chinese and English.

Turn messy speech into clean, structured text.
- Remove fillers and 口癖: um, uh, like (when filler), you know, I mean, 那个, 就是, 然后, 嗯, 啊, 呃.
- Keep the speaker's meaning, voice, and original language mix. Do not translate.
- Use short paragraphs. Use a list only when the speaker made distinct points.
- Do not invent facts, titles, or details that were not said.
- Return only the cleaned text.`;

type CleanupBody = {
  transcript?: unknown;
};

export async function POST(request: Request) {
  let body: CleanupBody;

  try {
    body = (await request.json()) as CleanupBody;
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript.trim() : "";

  if (!transcript) {
    return Response.json({ error: "Nothing to clean yet." }, { status: 400 });
  }

  const localText = cleanTranscriptLocally(transcript);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json({
      text: localText,
      source: "local" as const,
    });
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
      const detail = await response.text();
      return Response.json({
        text: localText,
        source: "local" as const,
        warning:
          "OpenAI returned an error, so Typeless used the local cleanup instead.",
        detail: detail.slice(0, 300),
      });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return Response.json({
        text: localText,
        source: "local" as const,
        warning: "OpenAI sent an empty reply, so Typeless used local cleanup.",
      });
    }

    return Response.json({ text, source: "openai" as const });
  } catch {
    return Response.json({
      text: localText,
      source: "local" as const,
      warning: "OpenAI was unreachable, so Typeless used local cleanup.",
    });
  }
}
