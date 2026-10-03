import { VoiceStudio } from "@/components/voice-studio";

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <VoiceStudio
      initialRaw={first(params.raw)}
      initialClean={first(params.clean)}
      initialSource={first(params.source)}
      initialWarning={first(params.warning)}
      initialError={first(params.error)}
    />
  );
}
