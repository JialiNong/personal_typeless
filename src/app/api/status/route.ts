export async function GET() {
  return Response.json({
    openai: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
}
