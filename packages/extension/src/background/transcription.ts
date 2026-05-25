import type { Settings, TranscriptionProvider } from '../common/settings.js';

export interface TranscribeInput {
  audioDataUrl: string;
  mimeType: string;
  fileName: string;
}

export interface TranscribeResult {
  text: string;
  provider: TranscriptionProvider;
  model: string;
}

export async function transcribeAudio(
  input: TranscribeInput,
  settings: Settings,
): Promise<TranscribeResult> {
  const provider = settings.transcription.provider;
  if (provider === 'openai') return transcribeWithOpenAi(input, settings);
  return transcribeWithElevenLabs(input, settings);
}

async function transcribeWithOpenAi(
  input: TranscribeInput,
  settings: Settings,
): Promise<TranscribeResult> {
  const apiKey = settings.transcription.openAiApiKey.trim();
  if (!apiKey) throw new Error('OpenAI API key is missing.');

  const model = settings.transcription.openAiModel.trim() || 'gpt-4o-transcribe';
  const form = new FormData();
  form.append('file', await dataUrlToBlob(input.audioDataUrl, input.mimeType), input.fileName);
  form.append('model', model);
  form.append('response_format', 'json');
  const language = settings.transcription.languageCode.trim();
  if (language) form.append('language', language);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) throw new Error(await responseError(resp, 'OpenAI transcription failed'));
  const json = (await resp.json()) as { text?: unknown };
  const text = typeof json.text === 'string' ? json.text.trim() : '';
  if (!text) throw new Error('OpenAI returned an empty transcript.');
  return { text, provider: 'openai', model };
}

async function transcribeWithElevenLabs(
  input: TranscribeInput,
  settings: Settings,
): Promise<TranscribeResult> {
  const apiKey = settings.transcription.elevenLabsApiKey.trim();
  if (!apiKey) throw new Error('ElevenLabs API key is missing.');

  const model = settings.transcription.elevenLabsModel.trim() || 'scribe_v2';
  const form = new FormData();
  form.append('model_id', model);
  form.append('file', await dataUrlToBlob(input.audioDataUrl, input.mimeType), input.fileName);
  const language = settings.transcription.languageCode.trim();
  if (language) form.append('language_code', language);

  const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!resp.ok) throw new Error(await responseError(resp, 'ElevenLabs transcription failed'));
  const json = (await resp.json()) as { text?: unknown };
  const text = typeof json.text === 'string' ? json.text.trim() : '';
  if (!text) throw new Error('ElevenLabs returned an empty transcript.');
  return { text, provider: 'elevenlabs', model };
}

async function dataUrlToBlob(dataUrl: string, fallbackType: string): Promise<Blob> {
  // Let the platform decode the data URL. This correctly handles MIME types that
  // carry parameters (e.g. `audio/webm;codecs=opus`, which MediaRecorder always
  // produces) — a hand-rolled regex tripped over the `;codecs=…` segment and
  // rejected the audio. Mirrors how vault-writer turns screenshot data URLs into
  // blobs.
  const blob = await fetch(dataUrl).then((r) => r.blob());
  if (blob.type && !blob.type.startsWith('text/plain')) return blob;
  return new Blob([blob], { type: fallbackType || 'audio/webm' });
}

async function responseError(resp: Response, fallback: string): Promise<string> {
  const text = await resp.text().catch(() => '');
  if (!text) return `${fallback}: HTTP ${resp.status}`;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const error = json['error'] as Record<string, unknown> | string | undefined;
    if (typeof error === 'string') return error;
    const message = error?.['message'];
    if (typeof message === 'string') return message;
  } catch {
    /* use raw text */
  }
  return `${fallback}: ${text.slice(0, 240)}`;
}
