# Typeless

Personal voice-to-text for messy Chinese and English speech. Click to talk, stop when done. [Whisper](https://huggingface.co/docs/transformers.js) runs in the browser (the same local-STT idea as Handy / Voice Ink). A second pass then removes fillers and 口癖 and turns the transcript into clean text.

Audio never leaves the browser. Only the transcript is sent to OpenAI when a key is set.

## Run locally

Needs Node 20+ and a Chromium-based browser with a microphone (or paste text instead).

```bash
npm install
cp .env.example .env.local
# add OPENAI_API_KEY if you want the OpenAI cleanup pass
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

The first visit downloads the multilingual Whisper **base** model (~75 MB, quantized) from Hugging Face and caches it in the browser. Later visits reuse that cache.

```bash
npm run build
npm start
```

## Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | Enables OpenAI cleanup. Without it, Typeless uses a local filler strip. |
| `OPENAI_MODEL` | No | Chat model. Defaults to `gpt-4o-mini`. |

Copy `.env.example` to `.env.local`. Never commit the key.

## What is local vs mocked

**Local (on-device)**

- Microphone capture
- Whisper speech-to-text via `@huggingface/transformers` (`Xenova/whisper-base`, Chinese + English)
- Language hint: Auto / 中文 / English

**OpenAI (when `OPENAI_API_KEY` is set)**

- Removes fillers and 口癖
- Turns rambling speech into short structured text
- Does not translate; keeps the original language mix

**Still mocked / fallback**

- If the key is missing, or OpenAI errors, cleanup uses a deterministic local strip (`um`, `uh`, `那个`, `就是`, `嗯`, …). It does not rewrite structure the way the model does.
- If Whisper fails to download, you can still paste messy speech and run cleanup.

## Privacy

1. Speech is recorded in the browser.
2. Whisper transcribes it on this device.
3. Only the transcript goes to `/api/cleanup`, then to OpenAI if configured.
