import { cleanupTranscriptText } from "@/lib/cleanup-server";

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

  const result = await cleanupTranscriptText(transcript);
  return Response.json(result);
}
