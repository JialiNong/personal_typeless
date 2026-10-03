const TARGET_SAMPLE_RATE = 16_000;

export async function blobToWhisperAudio(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  const context = new AudioContext();

  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const mono = mixToMono(decoded);
    return resample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
  } finally {
    await context.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const length = buffer.length;
  const mixed = new Float32Array(length);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );

  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i] ?? 0;
    }
    mixed[i] = sum / channels.length;
  }

  return mixed;
}

function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const low = Math.floor(position);
    const high = Math.min(low + 1, input.length - 1);
    const fraction = position - low;
    output[i] = (input[low] ?? 0) * (1 - fraction) + (input[high] ?? 0) * fraction;
  }

  return output;
}

export function isMostlySilent(audio: Float32Array): boolean {
  if (audio.length === 0) return true;

  let sum = 0;
  for (let i = 0; i < audio.length; i += 1) {
    const sample = audio[i] ?? 0;
    sum += sample * sample;
  }

  return Math.sqrt(sum / audio.length) < 0.004;
}
