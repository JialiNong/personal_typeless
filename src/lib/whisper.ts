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

type WorkerIncoming =
  | { type: "progress"; percent: number; file?: string }
  | { type: "ready" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

let worker: Worker | null = null;
let workerReady = false;
let workerFailed = false;
let mainThread: AutomaticSpeechRecognitionPipeline | null = null;

function configureEnv() {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
}

function createWorker(): Worker {
  return new Worker(new URL("./whisper.worker.ts", import.meta.url), {
    type: "module",
    name: "whisper",
  });
}

function waitForWorker(
  instance: Worker,
  onProgress?: (progress: WhisperProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<WorkerIncoming>) => {
      const payload = event.data;
      if (payload.type === "progress") {
        onProgress?.({ percent: payload.percent, file: payload.file });
        return;
      }
      if (payload.type === "ready") {
        instance.removeEventListener("message", handle);
        resolve();
        return;
      }
      if (payload.type === "error") {
        instance.removeEventListener("message", handle);
        reject(new Error(payload.message));
      }
    };

    instance.addEventListener("message", handle);
    instance.addEventListener(
      "error",
      () => {
        instance.removeEventListener("message", handle);
        reject(new Error("The Whisper worker failed to start."));
      },
      { once: true },
    );
    instance.postMessage({ type: "load" });
  });
}

async function ensureWorker(
  onProgress?: (progress: WhisperProgress) => void,
): Promise<Worker | null> {
  if (workerFailed) return null;
  if (worker && workerReady) return worker;

  try {
    worker = createWorker();
    await waitForWorker(worker, onProgress);
    workerReady = true;
    return worker;
  } catch {
    workerFailed = true;
    worker?.terminate();
    worker = null;
    workerReady = false;
    return null;
  }
}

async function loadMainThread(onProgress?: (progress: WhisperProgress) => void) {
  if (mainThread) return mainThread;

  configureEnv();

  const options = {
    dtype: "q8" as const,
    progress_callback: (progress: ProgressInfo) => {
      if (progress.status === "progress") {
        onProgress?.({ percent: Math.round(progress.progress), file: progress.file });
      }
    },
  };

  try {
    mainThread = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      ...options,
      device: "webgpu",
    });
  } catch {
    mainThread = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      ...options,
      device: "wasm",
    });
  }

  return mainThread;
}

async function transcribeOnMain({ audio, language }: TranscribeArgs) {
  const model = await loadMainThread();
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

export async function warmupWhisper(
  onProgress?: (progress: WhisperProgress) => void,
): Promise<void> {
  const instance = await ensureWorker(onProgress);
  if (instance) return;
  await loadMainThread(onProgress);
}

export async function transcribeAudio({
  audio,
  language,
  onProgress,
}: TranscribeArgs): Promise<string> {
  const instance = await ensureWorker(onProgress);
  if (!instance) {
    return transcribeOnMain({ audio, language, onProgress });
  }

  return new Promise((resolve, reject) => {
    const handle = (event: MessageEvent<WorkerIncoming>) => {
      const payload = event.data;
      if (payload.type === "progress") {
        onProgress?.({ percent: payload.percent, file: payload.file });
        return;
      }
      if (payload.type === "result") {
        instance.removeEventListener("message", handle);
        resolve(payload.text);
        return;
      }
      if (payload.type === "error") {
        instance.removeEventListener("message", handle);
        reject(new Error(payload.message));
      }
    };

    instance.addEventListener("message", handle);
    instance.postMessage({ type: "transcribe", audio, language }, [audio.buffer]);
  });
}
