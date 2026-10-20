import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {SpeechChunker, normText} from '../extension/segmentation.js';

test('manifest v0.5.0 defines MV3 and tab capture', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url),'utf8'));
  assert.equal(m.manifest_version,3);
  assert.equal(m.version,'0.5.0');
  assert.ok(m.permissions.includes('tabCapture'));
  assert.ok(m.permissions.includes('offscreen'));
});
test('Whisper runtime is included for local browser operation', () => {
  const names=['../extension/vendor/whisper.bundle.js','../extension/vendor/wasm/ort-wasm-simd-threaded.wasm'];
  for(const name of names) assert.ok(statSync(new URL(name,import.meta.url)).size>1000);
});
test('silence without speech does not produce captions', () => {
  let count=0;
  const c=new SpeechChunker({onSpeech:()=>count++});
  for(let i=0;i<25;i++)c.accept(new Float32Array(1600));
  c.flush();
  assert.equal(count,0);
});
test('speech followed by silence creates one utterance', () => {
  const emitted=[];
  const c=new SpeechChunker({onSpeech:x=>emitted.push(x)});
  for(let i=0;i<10;i++)c.accept(new Float32Array(1600).fill(.25));
  for(let i=0;i<8;i++)c.accept(new Float32Array(1600));
  assert.equal(emitted.length,1);
  assert.ok(emitted[0].length >= 16000);
});
test('text normalization removes superficial punctuation', () => {
  assert.equal(normText(' Hello, WORLD! '),normText('hello world'));
});

test('native failure has an offline translation fallback for English',()=>{
 const runtime=readFileSync(new URL('../build/whisper-runtime.js',import.meta.url),'utf8');
 const offscreen=readFileSync(new URL('../extension/offscreen.js',import.meta.url),'utf8');
 assert.match(runtime,/export async function loadOfflineTranslator/);
 assert.match(runtime,/export async function translateOffline/);
 assert.match(offscreen,/await loadOfflineTranslator/);
 assert.match(offscreen,/return \{translate:text=>translateOffline\(text,'en'\)/);
});
test('settings expose local translation preparation and fallback test',()=>{
 const html=readFileSync(new URL('../extension/options.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../extension/options.js',import.meta.url),'utf8');
 assert.match(html,/id="local-translation-install"/);
 assert.match(js,/async function translateWithFallback/);
 assert.match(js,/await mod\.loadOfflineTranslator\(display\)/);
});

