# Live Japanese Captions v0.5.0 beta

Edge / Chrome desktop browser extension for live Japanese subtitles.
**Evaluation build**. Not an official ResoArc production release.

## Modes

- Free local: Whisper tiny (WebGPU / WASM) and browser Translator API or FuguMT; no transcription API billing.
- AssemblyAI Universal Streaming: English-only streaming speech recognition and browser-local FuguMT Japanese translation. Tab audio is sent to AssemblyAI and billed according to connected usage.

## Installation
1. Download and extract LiveJapaneseCaptions-Edge-Portable-v0.5.0.zip.
2. Open edge://extensions or chrome://extensions. Turn Developer mode ON.
3. Load unpacked extension directory.
4. In Options choose caption mode. Free local is the default.
5. For AssemblyAI, set English, save API key locally, select a session limit (default 10 min), and save settings.
6. Click ローカル英日翻訳を準備 and wait for first-time model download.
7. Open YouTube Live in a desktop Edge or Chrome tab and click the extension icon to start / stop captions.

## Implementation
- AssemblyAI streaming v3, universal-streaming-english, 16kHz mono signed PCM16 audio in 100ms chunks.
- Temporary token is requested after local translator preparation through extension background context.
- Turn event final utterances translated locally, deduplicated.
- WebSocket Terminates on stop; per-session upper limit is 1 to 60 minutes.
- No transcripts or audio files saved by this extension.

## Security and limits
AssemblyAI API key is stored in browser chrome.storage.local, not embedded in the ZIP, shared using sync, or committed to Git.
It may be read by anyone with access to the browser profile. Use a low-limit disposable API key and delete it after testing.
A centrally deployed version should use an authenticated backend token broker instead of browser-stored API keys.
Actual account spending is controlled by AssemblyAI billing settings, not just session duration.
Model weights download on first use and are cached by the browser.
YouTube Live streaming and audio-model performance on dynabook G83/HV have not been measured.
No paid AssemblyAI account connection has been performed.
This PC browser extension does not support the YouTube smartphone app.

For development run: npm ci; npm run build; npm test.
For third-party license information see THIRD_PARTY_NOTICES.md.
