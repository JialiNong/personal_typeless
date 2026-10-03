import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

import { WHISPER_MODEL } from "./constants";

export type WhisperProgress = {
  percent: number;
  file?: string;
};

type TranscribeArgs = {
  audio: Float32Array;
  language: string | null;
  onProgress?: (progress: WhisperProgress) => void;
};

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function configureEnv() {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}

function reportProgress(
  progress: ProgressInfo,
  onProgress?: (progress: WhisperProgress) => void,
) {
  if (progress.status === "progress_total") {
    onProgress?.({
      percent: Math.max(1, Math.round(progress.progress)),
      file: "Whisper model files",
    });
    return;
  }

  if (progress.status === "progress") {
    onProgress?.({
      percent: Math.max(1, Math.round(progress.progress)),
      file: progress.file,
    });
    return;
  }

  if (progress.status === "initiate" || progress.status === "download") {
    onProgress?.({ percent: 1, file: progress.file });
  }
}

async function loadPipeline(onProgress?: (progress: WhisperProgress) => void) {
  if (transcriber) return transcriber;
  if (loading) return loading;

  configureEnv();

  loading = pipeline("automatic-speech-recognition", WHISPER_MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (progress) => reportProgress(progress, onProgress),
  })
    .then((model) => {
      transcriber = model;
      return model;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });

  return loading;
}

export async function warmupWhisper(
  onProgress?: (progress: WhisperProgress) => void,
): Promise<void> {
  await loadPipeline(onProgress);
}

export async function transcribeAudio({
  audio,
  language,
  onProgress,
}: TranscribeArgs): Promise<string> {
  const model = await loadPipeline(onProgress);
  const result = await model(audio, {
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(language ? { language } : {}),
  });

  return Array.isArray(result)
    ? result.map((chunk) => chunk.text).join(" ").trim()
    : result.text.trim();
}
