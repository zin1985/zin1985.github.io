# Live Japanese Captions v0.4.1 (Evaluation Build)

Experimental Edge/Chrome browser extension for Japanese subtitles using Whisper (WebGPU/WASM).
Evaluation only: YouTube Live continuous operation and delay not yet verified.

## Download
Get LiveJapaneseCaptions-Edge-Portable-v0.4.1.zip from this branch (~8.2 MB).
Do not use source-only ZIPs without extension/vendor/whisper.bundle.js.

## Installation
1. Download and extract Portable ZIP.
2. Open edge://extensions and enable Developer mode.
3. Select Load unpacked and choose extracted extension folder.
4. Open extension Options, click 実行ファイルを確認 and Whisperモデルを準備.
5. If translation says downloadable, click 翻訳パックを準備.
6. Test translation, open YouTube Live and click extension icon.

Models require an initial internet download. Translation depends on Edge Translator API support.
This is not an official ResoArc product release.

## Source
Source code: extension/, build/, tests/, package.json, package-lock.json.
Build with Node.js: npm ci && npm run build && npm test.
End users do not need Node.js when installing Portable ZIP.
See THIRD_PARTY_NOTICES.md. Original source license not granted until explicitly added.
