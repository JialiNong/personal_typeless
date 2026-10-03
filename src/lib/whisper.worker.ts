/// <reference lib="webworker" />

import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

import { WHISPER_MODEL } from "./constants";

env.allowLocalModels = false;
env.useBrowserCache = true;

type Incoming =
  | { type: "load" }
  | { type: "transcribe"; audio: Float32Array; language: string | null };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

function post(data: Record<string, unknown>) {
  self.postMessage(data);
}

async function loadModel() {
  const onProgress = (progress: ProgressInfo) => {
    if (progress.status === "progress") {
      post({
        type: "progress",
        percent: Math.round(progress.progress),
        file: progress.file,
      });
      return;
    }

    if (progress.status === "initiate") {
      post({ type: "progress", percent: 0, file: progress.file });
    }
  };

  const options = {
    dtype: "q8" as const,
    progress_callback: onProgress,
  };

  try {
    transcriber = await pipeline(
      "automatic-speech-recognition",
      WHISPER_MODEL,
      { ...options, device: "webgpu" },
    );
  } catch {
    transcriber = await pipeline(
      "automatic-speech-recognition",
      WHISPER_MODEL,
      { ...options, device: "wasm" },
    );
  }

  post({ type: "ready" });
}

async function transcribe(audio: Float32Array, language: string | null) {
  if (!transcriber) {
    throw new Error("Whisper is still loading.");
  }

  const result = await transcriber(audio, {
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(language ? { language } : {}),
  });

  const text = Array.isArray(result)
    ? result.map((chunk) => chunk.text).join(" ").trim()
    : result.text.trim();

  post({ type: "result", text });
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  try {
    const message = event.data;
    if (message.type === "load") {
      await loadModel();
      return;
    }
    if (message.type === "transcribe") {
      await transcribe(message.audio, message.language);
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
