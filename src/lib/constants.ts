export const WHISPER_MODEL = "Xenova/whisper-base";

export const LANGUAGES = [
  { id: "auto", label: "Auto", whisper: null },
  { id: "zh", label: "中文", whisper: "chinese" },
  { id: "en", label: "English", whisper: "english" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export type CleanupSource = "openai" | "local";
