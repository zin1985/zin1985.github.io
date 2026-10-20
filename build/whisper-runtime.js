import {pipeline, env} from '@huggingface/transformers';

// Compiled into a LOCAL extension script at build-time, never loaded as remote JS.
// Only model metadata and model weights are retrieved on first run.
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/wasm/');
env.backends.onnx.wasm.numThreads = 1; // Avoid cross-origin isolation restrictions in MV3.
const MODEL='Xenova/whisper-tiny'; // Multilingual English/Korean/Spanish/French/Chinese.
let transcriber = null;
let initializing = null;
let usedBackend = null;
export async function loadWhisper(preference='auto', report=()=>{}) {
  if(transcriber) return {transcriber, backend:usedBackend};
  if(initializing) return initializing;
  initializing=(async()=>{
    let selected = preference==='wasm'?'wasm':'webgpu';
    if(selected==='webgpu' && !navigator.gpu) {
      if(preference==='webgpu') throw new Error('このPCのブラウザはWebGPUに対応していません');
      selected='wasm';
    }
    const load = async(device) => {
      report(device==='webgpu'?'WhisperのWebGPUモデルを準備中':'WhisperのCPU/WASMモデルを準備中');
      // GPU-specific quantization is not assumed; ONNX model variants chosen per backend.
      return pipeline('automatic-speech-recognition',MODEL,{
        device,
        dtype:device==='webgpu'?{encoder_model:'fp32',decoder_model_merged:'q4'}:'q8',
        progress_callback:(p)=>{
          if(p.status==='progress' && p.file && p.total>0) report(`モデル取得 ${Math.round(p.progress)}%: ${p.file.split('/').at(-1)}`);
          if(p.status==='done' && p.file) report('モデル読み込み中: '+p.file.split('/').at(-1));
        }
      });
    };
    try {transcriber=await load(selected);} catch(e){
      if(selected!=='webgpu'||preference==='webgpu') throw e;
      report('WebGPUが使えなかったためCPU/WASMへ切り替えます');
      selected='wasm';
      transcriber=await load(selected);
    }
    usedBackend=selected;
    report('Whisper準備完了 ('+selected.toUpperCase()+')');
    return {transcriber,backend:usedBackend};
  })();
  try {return await initializing;} finally {initializing=null;}
}
export async function speechToText(audio, language='en', preference='auto', report=()=>{}) {
  if(!(audio instanceof Float32Array) || !audio.length) return '';
  const {transcriber:pipe}=await loadWhisper(preference,report);
  const opts={task:'transcribe', language, return_timestamps:false, generate_kwargs:{max_new_tokens:112}};
  const result=await pipe(audio,opts);
  return String(result?.text||'').trim();
}
