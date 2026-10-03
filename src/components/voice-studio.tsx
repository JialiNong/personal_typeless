"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  LoaderCircle,
  Mic,
  Square,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cleanTranscriptLocally } from "@/lib/cleanup";
import {
  LANGUAGES,
  type CleanupSource,
  type LanguageId,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type Phase = "idle" | "recording" | "transcribing" | "cleaning" | "ready";

type StatusResponse = {
  openai: boolean;
  model: string;
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || !text}
      onClick={() => void copy()}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function VoiceStudio() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [language, setLanguage] = useState<LanguageId>("auto");
  const [elapsed, setElapsed] = useState(0);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelFile, setModelFile] = useState<string | undefined>();
  const [whisperReady, setWhisperReady] = useState(false);
  const [whisperLoading, setWhisperLoading] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [cleanText, setCleanText] = useState("");
  const [cleanupSource, setCleanupSource] = useState<CleanupSource | null>(null);
  const [openaiReady, setOpenaiReady] = useState<boolean | null>(null);
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const languageRef = useRef(language);
  const rawTextRef = useRef(rawText);
  const rawAreaRef = useRef<HTMLTextAreaElement>(null);
  const whisperLoadingRef = useRef(false);

  languageRef.current = language;
  rawTextRef.current = rawText;

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/status");
        if (!response.ok) return;
        const data = (await response.json()) as StatusResponse;
        if (!cancelled) {
          setOpenaiReady(data.openai);
          setOpenaiModel(data.model);
        }
      } catch {
        if (!cancelled) setOpenaiReady(false);
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
      stopTracks();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function startClock() {
    setElapsed(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
  }

  function stopClock() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function ensureWhisper(): Promise<boolean> {
    if (whisperReady) return true;
    if (whisperLoadingRef.current) return false;

    whisperLoadingRef.current = true;
    setWhisperLoading(true);
    setModelProgress(0);
    setModelFile("Contacting Hugging Face…");
    setWhisperError(null);

    try {
      const { warmupWhisper } = await import("@/lib/whisper");
      await warmupWhisper((progress) => {
        setModelProgress(progress.percent);
        setModelFile(progress.file);
      });
      setWhisperReady(true);
      setModelProgress(100);
      return true;
    } catch (loadError) {
      setWhisperError(
        loadError instanceof Error
          ? loadError.message
          : "Whisper could not start in this browser.",
      );
      return false;
    } finally {
      whisperLoadingRef.current = false;
      setWhisperLoading(false);
    }
  }

  async function startTalking() {
    setError(null);
    setWarning(null);

    const ready = whisperReady || (await ensureWhisper());
    if (!ready) {
      setError(
        whisperError ??
          "Whisper is still downloading. Wait for the model, or paste text below.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot open the microphone. Paste text below instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
      startClock();
    } catch (startError) {
      const denied =
        startError instanceof DOMException &&
        (startError.name === "NotAllowedError" ||
          startError.name === "PermissionDeniedError");
      setError(
        denied
          ? "Typeless needs the microphone. Allow it in the browser, then click Talk again."
          : "Could not open the microphone. Check the input device, or paste text below.",
      );
      stopTracks();
    }
  }

  async function finishTalking() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorder.onerror = () => reject(new Error("Recording stopped unexpectedly."));
      recorder.stop();
    });

    stopTracks();
    stopClock();
    recorderRef.current = null;
    setPhase("transcribing");

    try {
      const [{ blobToWhisperAudio, isMostlySilent }, { transcribeAudio }] =
        await Promise.all([import("@/lib/audio"), import("@/lib/whisper")]);
      const audio = await blobToWhisperAudio(blob);

      if (isMostlySilent(audio)) {
        setError("That take was silent. Click Talk and say something in Chinese or English.");
        setPhase(rawText || cleanText ? "ready" : "idle");
        return;
      }

      const selected = LANGUAGES.find((item) => item.id === languageRef.current);
      const transcript = await transcribeAudio({
        audio,
        language: selected?.whisper ?? null,
      });

      if (!transcript) {
        setError("Whisper heard the clip but produced no words. Try again a little closer to the mic.");
        setPhase(rawText || cleanText ? "ready" : "idle");
        return;
      }

      writeRawText(transcript);
      await runCleanup(transcript);
    } catch (transcribeError) {
      setError(
        transcribeError instanceof Error
          ? transcribeError.message
          : "Whisper could not read that clip. Try a shorter take, or paste the words below.",
      );
      setPhase(rawText || cleanText ? "ready" : "idle");
    }
  }

  async function runCleanup(transcript: string) {
    const text = transcript.trim();
    if (!text) {
      setError("Nothing to clean yet. Paste or record some speech first.");
      return;
    }

    writeRawText(text);
    setPhase("cleaning");
    setError(null);

    const localText = cleanTranscriptLocally(text);
    setCleanText(localText);
    setCleanupSource("local");

    try {
      const response = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const payload = (await response.json()) as {
        text?: string;
        source?: CleanupSource;
        warning?: string;
        error?: string;
      };

      if (payload.text) {
        setCleanText(payload.text);
        setCleanupSource(payload.source ?? "local");
        setWarning(payload.warning ?? null);
      } else if (!response.ok) {
        setWarning(payload.error ?? "OpenAI cleanup failed; kept the local edit.");
      }
    } catch {
      setWarning("Could not reach the cleanup API, so Typeless used the local edit.");
    } finally {
      setPhase("ready");
    }
  }

  function writeRawText(text: string) {
    rawTextRef.current = text;
    if (rawAreaRef.current) rawAreaRef.current.value = text;
    setRawText(text);
  }

  function handleCleanClick() {
    const text = rawAreaRef.current?.value ?? rawTextRef.current;
    void runCleanup(text);
  }

  async function toggleTalk() {
    if (phase === "recording") {
      await finishTalking();
      return;
    }
    if (phase === "transcribing" || phase === "cleaning") {
      return;
    }
    await startTalking();
  }

  const busy = phase === "transcribing" || phase === "cleaning";
  const canTalk = phase === "recording" || !busy;
  const canClean = phase !== "cleaning";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Personal voice notes
          </p>
          <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">Typeless</h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Click to talk in Chinese or English. Whisper turns speech into text
            in this browser. Then OpenAI — or a local fallback — strips fillers
            and 口癖 into something you can send.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={whisperReady ? "default" : "outline"}>
            {whisperReady
              ? "Whisper ready"
              : whisperError
                ? "Whisper unavailable"
                : whisperLoading
                  ? "Loading Whisper"
                  : "Whisper on Talk"}
          </Badge>
          <Badge variant={openaiReady ? "default" : "secondary"}>
            {openaiReady ? `OpenAI · ${openaiModel}` : "Local cleanup"}
          </Badge>
        </div>
      </header>

      <Card className="border-none bg-[color-mix(in_oklch,var(--card),var(--primary)_4%)] shadow-none ring-foreground/8">
        <CardContent className="flex flex-col items-center gap-5 py-8 sm:py-10">
          <button
            type="button"
            aria-pressed={phase === "recording"}
            aria-label={phase === "recording" ? "Stop talking" : "Start talking"}
            disabled={!canTalk}
            onClick={() => void toggleTalk()}
            className={cn(
              "relative flex size-28 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform outline-none focus-visible:ring-4 focus-visible:ring-ring/40 sm:size-32",
              phase === "recording"
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-primary hover:bg-primary/90",
              !canTalk && "opacity-50",
            )}
          >
            {phase === "recording" ? (
              <Square className="size-8 fill-current" />
            ) : busy || whisperLoading ? (
              <LoaderCircle className="size-8 animate-spin" />
            ) : (
              <Mic className="size-9" />
            )}
            {phase === "recording" ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30" />
            ) : null}
          </button>

          <div className="space-y-1 text-center">
            <p className="text-base font-medium">
              {phase === "recording"
                ? `Listening… ${formatClock(elapsed)}`
                : phase === "transcribing"
                  ? "Turning speech into text on this device…"
                  : phase === "cleaning"
                    ? "Removing fillers and 口癖…"
                    : whisperLoading
                      ? "Downloading Whisper into this browser…"
                      : "Click to talk · click again to stop"}
            </p>
            <p className="text-sm text-muted-foreground">
              Audio stays on this device. Only the transcript is sent for cleanup.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {LANGUAGES.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={language === item.id ? "default" : "outline"}
                disabled={phase === "recording"}
                onClick={() => setLanguage(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {whisperLoading ? (
            <Progress value={modelProgress} className="w-full max-w-md">
              <ProgressLabel>
                {modelFile ? `Fetching ${modelFile}` : "Preparing Whisper base"}
              </ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something stopped the take</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {warning ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Used the local fallback</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}

      {whisperError && !whisperReady ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>In-browser Whisper did not load</AlertTitle>
          <AlertDescription>
            {whisperError} You can still paste messy speech below and clean it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-h-64">
          <CardHeader className="border-b">
            <CardTitle>Raw speech</CardTitle>
            <CardDescription>
              What Whisper heard, including the rambling.
            </CardDescription>
            <CardAction>
              <CopyButton text={rawText} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {phase === "transcribing" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Transcribing on this device…
              </p>
            ) : null}
            <Textarea
              ref={rawAreaRef}
              defaultValue=""
              onInput={(event) => {
                rawTextRef.current = event.currentTarget.value;
                setRawText(event.currentTarget.value);
              }}
              placeholder="Nothing recorded yet. Talk in Chinese or English, or paste a messy draft here."
              className="min-h-48 resize-y"
            />
            <button
              type="button"
              disabled={!canClean}
              onClick={handleCleanClick}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Clean this text
            </button>
          </CardContent>
        </Card>

        <Card className="min-h-64">
          <CardHeader className="border-b">
            <CardTitle>Clean text</CardTitle>
            <CardDescription>
              {cleanupSource === "openai"
                ? "Edited by OpenAI from your transcript."
                : cleanupSource === "local"
                  ? "Local cleanup — fillers removed without an API key."
                  : "Structured text will land here after you stop talking."}
            </CardDescription>
            <CardAction>
              <CopyButton text={cleanText} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {phase === "cleaning" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Removing fillers and 口癖…
              </p>
            ) : cleanText ? (
              <Textarea
                value={cleanText}
                onChange={(event) => setCleanText(event.target.value)}
                className="min-h-48 resize-y border-transparent bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Empty for now. After a take, this side is the version you can
                paste into a message, note, or doc.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {!openaiReady ? (
        <p className="text-xs leading-5 text-muted-foreground">
          No <code className="rounded bg-muted px-1 py-0.5">OPENAI_API_KEY</code>{" "}
          in the environment. Cleanup uses a local filler strip so the app still
          works. Add the key to{" "}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code> and
          restart to use OpenAI.
        </p>
      ) : null}
    </div>
  );
}
