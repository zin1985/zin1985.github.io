import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pcm16, assemblyWebsocketUrl, AssemblyTurns, AAI_MODEL} from '../extension/assembly-streaming.js';
test('PCM16 16k linear conversion yields little endian signed samples',()=>{
 const buf=pcm16(new Float32Array([-1,-0.5,0,0.5,1]));
 const d=new DataView(buf);
 assert.equal(buf.byteLength,10);
 assert.deepEqual(Array.from({length:5},(_,i)=>d.getInt16(i*2,true)),[-32768,-16384,0,16384,32767]);
});
test('PCM16 rejects unsupported audio types and clamps out of range',()=>{
 assert.throws(()=>pcm16([0.1]),TypeError);
 assert.equal(new DataView(pcm16(new Float32Array([2]))).getInt16(0,true),32767);
});
test('AssemblyAI URL uses streaming v3 English and token only as WS query',()=>{
 assert.equal(AAI_MODEL,'universal-streaming-english');
 const ws=new URL(assemblyWebsocketUrl('abc0123456789.x'));
 assert.equal(ws.protocol,'wss:');
 assert.equal(ws.hostname,'streaming.assemblyai.com');
 assert.equal(ws.pathname,'/v3/ws');
 assert.equal(ws.searchParams.get('speech_model'),'universal-streaming-english');
 assert.equal(ws.searchParams.get('sample_rate'),'16000');
 assert.equal(ws.searchParams.get('session_heartbeat'),'true');
 assert.equal(ws.searchParams.get('token'),'abc0123456789.x');
 assert.throws(()=>assemblyWebsocketUrl('bad token'));
});
test('Turn parser emits only complete utterance once, without duplicates',()=>{
 const tracker=new AssemblyTurns();
 assert.equal(tracker.accept({type:'Turn',turn_order:4,transcript:'Hello',end_of_turn:false}),null);
 assert.deepEqual(tracker.accept({type:'Turn',turn_order:4,utterance:'Hello everyone.',end_of_turn:false}),{original:'Hello everyone.',turnOrder:4});
 assert.equal(tracker.accept({type:'Turn',turn_order:4,transcript:'Hello everyone.',end_of_turn:true}),null);
 assert.deepEqual(tracker.accept({type:'Turn',turn_order:5,transcript:'Welcome to our stream.',end_of_turn:true}),{original:'Welcome to our stream.',turnOrder:5});
 assert.equal(tracker.accept({type:'Turn',turn_order:6,utterance:'[Silence]',end_of_turn:true}),null);
 assert.equal(tracker.accept({type:'Turn',turn_order:5,utterance:'Another utterance',end_of_turn:false}),null);
 tracker.reset();
 assert.ok(tracker.accept({type:'Turn',turn_order:4,utterance:'Reset works',end_of_turn:true}));
});
test('AssemblyAI is opt-in and key is never packaged as a literal secret',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 const bg=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../extension/options.html',import.meta.url),'utf8');
 assert.ok(manifest.host_permissions.includes('https://streaming.assemblyai.com/*'));
 assert.match(bg,/chrome\.storage\.local\.get\('assemblyApiKey'\)/);
 assert.match(bg,/max_session_duration_seconds/);
 assert.match(bg,/expires_in_seconds=60/);
 assert.match(bg,/sender\.url!==chrome\.runtime\.getURL\('offscreen\.html'\)/);
 assert.match(html,/id="captionMode"/);
 assert.match(html,/id="assemblyMinutes"/);
 assert.match(html,/type="password"/);
});

test('AssemblyAI startup dispatches to streaming instead of Whisper',()=>{
 const code=readFileSync(new URL('../extension/offscreen.js',import.meta.url),'utf8');
 assert.match(code,/async function prepare\(s\)\s*\{\s*try\s*\{\s*if\(s\.mode==='assemblyai'\)\{await prepareAssembly\(s\);return;\}/);
 assert.match(code,/await loadOfflineTranslator/);
 assert.match(code,/new WebSocket\(assemblyWebsocketUrl\(auth\.token\)\)/);
 assert.match(code,/socket\.send\(pcm16\(audio\)\)/);
});
test('long-running single turn yields short finalized-word subtitle chunks',()=>{
 const p=new AssemblyTurns({partialMs:1500,minWords:4,maxWords:9});
 const w=(text,final=true)=>({text,word_is_final:final});
 assert.equal(p.accept({type:'Turn',turn_order:2,end_of_turn:false,words:['Hello','I','am','talking','and'].map(text=>w(text))},1000),null);
 assert.deepEqual(p.accept({type:'Turn',turn_order:2,end_of_turn:false,words:['Hello','I','am','talking','and','will','continue','my','stream'].map(text=>w(text))},2900),{original:'Hello I am talking and will continue my stream',turnOrder:2});
 assert.equal(p.accept({type:'Turn',turn_order:2,end_of_turn:false,words:['Hello','I','am','talking','and','will','continue','my','stream'].map(text=>w(text))},2950),null);
 assert.equal(p.accept({type:'Turn',turn_order:2,end_of_turn:false,words:['Hello','I','am','talking','and','will','continue','my','stream','for','many','minutes'].map(text=>w(text))},3100),null);
 assert.deepEqual(p.accept({type:'Turn',turn_order:2,end_of_turn:true,turn_is_formatted:true,words:['Hello','I','am','talking','and','will','continue','my','stream','for','many','minutes'].map(text=>w(text))},3600),{original:'for many minutes',turnOrder:2});
 assert.equal(p.accept({type:'Turn',turn_order:2,end_of_turn:true,turn_is_formatted:true,words:['Hello','I'].map(text=>w(text))},3700),null);
});
test('Universal Streaming unformatted final is held for formatted final',()=>{
 const p=new AssemblyTurns();
 assert.equal(p.accept({type:'Turn',turn_order:0,words:[],transcript:'hi there',end_of_turn:true,turn_is_formatted:false}),null);
 assert.deepEqual(p.accept({type:'Turn',turn_order:0,words:[],transcript:'Hi there.',end_of_turn:true,turn_is_formatted:true}),{original:'Hi there.',turnOrder:0});
});
test('heartbeat and diagnostic counters are routed without speech data storage',()=>{
 const code=readFileSync(new URL('../extension/offscreen.js',import.meta.url),'utf8');
 assert.match(code,/message\.type==='Heartbeat'/);
 assert.match(code,/s\.audioFrames\+\+/);
 assert.match(code,/s\.lastCaptionAt=Date\.now\(\)/);
});
