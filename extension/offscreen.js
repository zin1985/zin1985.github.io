/* Chromium MV3 hidden audio host. Model inference and translation stay in-browser.
   The ONLY outgoing traffic is downloading public AI model weights on first use. */
import {SpeechChunker,normText} from './segmentation.js';
let state=null;
const send=(s,type,other={})=>{
  if(!s||s.stopped||s!==state)return;
  chrome.runtime.sendMessage({target:'ljc-background',type,session:s.session,...other}).catch(()=>{});
};
const languageCode = full => String(full||'en-US').split('-')[0].toLowerCase();
const whisperLanguage={en:'english',ko:'korean',fr:'french',es:'spanish',de:'german',zh:'chinese',ja:'japanese',it:'italian',ru:'russian',pt:'portuguese'};
function normalizeError(e){return String(e?.message||e||'不明なエラー').slice(0,600);}
async function initializeTranslator(s){
  if(languageCode(s.sourceLanguage)==='ja')return {translate:async x=>x,destroy(){}};
  if(!globalThis.Translator?.availability||!globalThis.Translator?.create)throw Error('Edgeの Translator API を利用できません。Edge 148以降または最新のChromeで確認してください。');
  const opts={sourceLanguage:languageCode(s.sourceLanguage),targetLanguage:'ja'};
  const availability=await Translator.availability(opts);
  if(availability!=='available')throw Error(`翻訳パックが未準備です (${availability})。拡張機能の「オプション」から導入してください。`);
  return Translator.create(opts);
}
async function stop(){
  const s=state;if(!s)return;
  s.stopped=true;state=null;
  try{s.processor?.port?.close();s.processor?.disconnect();s.mute?.disconnect();}catch{}
  try{s.stream?.getTracks().forEach(track=>track.stop());}catch{}
  try{await s.context?.close();}catch{}
  try{s.translator?.destroy?.();}catch{}
  try{s.chunker?.reset();}catch{}
  s.tasks.length=0;
}
async function processJobs(s){
  if(s.processing||s.stopped||s!==state||!s.ready)return;
  s.processing=true;
  try{
    while(s.tasks.length && s===state&&!s.stopped){
      const samples=s.tasks.shift();
      const stamp=performance.now();
      let original='';
      try {
        const {speechToText}=await import('./vendor/whisper.bundle.js');
        original=await speechToText(samples,whisperLanguage[languageCode(s.sourceLanguage)]||'english',s.backend);
        original=original.replace(/\s+/g,' ').trim();
      }catch(error){throw Error('Whisper認識失敗: '+normalizeError(error));}
      if(!original||s!==state||s.stopped)continue;
      const key=normText(original);
      if(key.length<2 || (key===s.lastText && performance.now()-s.lastTime<14000))continue;
      s.lastText=key;s.lastTime=performance.now();
      let translated;
      try{translated=String(await s.translator.translate(original)).trim();}
      catch(error){throw Error('日本語翻訳失敗: '+normalizeError(error));}
      if(s!==state||s.stopped||!translated)continue;
      send(s,'CAPTION',{text:translated,original,processing_ms:Math.round(performance.now()-stamp)});
    }
  }catch(error){send(s,'ERROR',{text:normalizeError(error)});void stop();}
  finally{s.processing=false;}
}
async function prepare(s){
  try{
    s.translator=await initializeTranslator(s);
    if(s.stopped||s!==state)return;
    let module;
    try{module=await import(chrome.runtime.getURL('vendor/whisper.bundle.js'));}
    catch(err){throw Error('Whisper実行ファイルを読み込めません。Portable ZIP内のextension/vendor/whisper.bundle.jsが存在するか確認し、Edge拡張を再読み込みしてください。'+normalizeError(err));}
    const {loadWhisper}=module;
    const result=await loadWhisper(s.backend,(message)=>send(s,'STATUS',{text:message}));
    if(s.stopped||s!==state)return;
    s.ready=true;
    send(s,'READY',{backend:result.backend});
    send(s,'STATUS',{text:`日本語字幕を認識中 (${result.backend.toUpperCase()})`});
    void processJobs(s);
  }catch(error){send(s,'ERROR',{text:normalizeError(error)});void stop();}
}
async function start(msg){
  await stop();
  const s={session:msg.session,tabId:msg.tabId,sourceLanguage:msg.sourceLanguage||'en-US',backend:msg.asrBackend||'auto',stopped:false,ready:false,processing:false, tasks:[],lastText:'',lastTime:0,translator:null,stream:null,context:null,processor:null,mute:null,chunker:null};
  state=s;
  try{
    // Single-use stream ID must be redeemed immediately, BEFORE slow AI downloads.
    s.stream=await navigator.mediaDevices.getUserMedia({
      audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:msg.streamId}},video:false
    });
    const track=s.stream.getAudioTracks()[0];
    if(!track)throw Error('再生中のタブに音声トラックがありません');
    track.addEventListener('ended',()=>{if(s===state&&!s.stopped){send(s,'ERROR',{text:'音声取得が終了しました'});void stop();}});
    s.context=new AudioContext();
    const source=s.context.createMediaStreamSource(s.stream);
    // chrome.tabCapture mutes the captured tab until audio is routed back.
    source.connect(s.context.destination);
    await s.context.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    s.processor=new AudioWorkletNode(s.context,'caption-pcm-16k');
    s.mute=s.context.createGain();s.mute.gain.value=0;
    source.connect(s.processor);s.processor.connect(s.mute);s.mute.connect(s.context.destination);
    s.chunker=new SpeechChunker({onSpeech:(audio)=>{
      if(s.stopped||s!==state)return;
      // Never let inference lag accumulate indefinitely during a live stream.
      if(s.tasks.length>=2){s.tasks.shift();send(s,'STATUS',{text:'字幕処理が追いつかないため古い発話をスキップしました'});}
      s.tasks.push(audio);
      void processJobs(s);
    }});
    s.processor.port.onmessage=event=>{
      if(s===state&&!s.stopped){const audio=new Float32Array(event.data);if(s.ready)s.chunker.accept(audio);}
    };
    await s.context.resume();
    send(s,'STATUS',{text:'タブ音声取得成功。Whisperモデルを準備中…'});
    void prepare(s); // Don't hold the short-lived runtime message port open during downloads.
    return {ok:true};
  }catch(error){const message=normalizeError(error);await stop();return {ok:false,error:message};}
}
chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  if(msg?.target!=='ljc-offscreen')return false;
  if(msg.type==='START'){start(msg).then(reply).catch(err=>reply({ok:false,error:normalizeError(err)}));return true;}
  if(msg.type==='STOP'){
    if(msg.session&&state?.session!==msg.session){reply({ok:true,ignored:true});return false;}
    stop().then(()=>reply({ok:true}));return true;
  }
  if(msg.type==='GET_STATUS'){reply({ok:true,active:Boolean(state&&!state.stopped),tabId:state?.tabId??null,session:state?.session??null,ready:state?.ready??false});return false;}
  return false;
});
