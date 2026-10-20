import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {SpeechChunker, normText} from '../extension/segmentation.js';

test('manifest v0.4.1 defines MV3 and tab capture', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url),'utf8'));
  assert.equal(m.manifest_version,3);
  assert.equal(m.version,'0.4.1');
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
