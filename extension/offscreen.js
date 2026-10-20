/* Chromium MV3 audio host. Free local mode processes speech/translation in-browser.
   AssemblyAI mode explicitly sends captured tab audio to the metered Streaming API.
   Japanese translation remains in-browser using FuguMT. */
import {SpeechChunker,normText} from './segmentation.js';
import {pcm16,assemblyWebsocketUrl,AssemblyTurns} from './assembly-streaming.js';
let state=null;
const send=(s,type,other={})=>{
  if(!s||s.stopped||s!==state)return;
  chrome.runtime.sendMessage({target:'ljc-background',type,session:s.session,...other}).catch(()=>{});
};
const languageCode = full => String(full||'en-US').split('-')[0].toLowerCase();
const whisperLanguage={en:'english',ko:'korean',fr:'french',es:'spanish',de:'german',zh:'chinese',ja:'japanese',it:'italian',ru:'russian',pt:'portuguese'};
function normalizeError(e){return String(e?.message||e||'不明なエラー').slice(0,600);}
async function initializeTranslator(s){
  const lang=languageCode(s.sourceLanguage);
  if(lang==='ja')return {translate:async text=>text,destroy(){}};
  const opts={sourceLanguage:lang,targetLanguage:'ja'};
  let reason='Translator API未対応';
  if(globalThis.Translator?.availability&&globalThis.Translator?.create){
    try{
      const availability=await Translator.availability(opts);
      if(availability!=='unavailable'){
        send(s,'STATUS',{text:'Edge標準翻訳器を準備中 ('+availability+')'});
        return await Translator.create(opts);
      }
      reason='言語ペアが非対応';
    }catch(error){reason=normalizeError(error);}
  }
  if(lang!=='en')throw Error('Edge翻訳が利用できません: '+reason+'。ローカル代替は英語→日本語のみ対応です。');
  send(s,'STATUS',{text:'Edge翻訳器が失敗したためローカル英日翻訳へ切替: '+reason});
  const {loadOfflineTranslator,translateOffline}=await import(chrome.runtime.getURL('vendor/whisper.bundle.js'));
  await loadOfflineTranslator(message=>send(s,'STATUS',{text:message}));
  return {translate:text=>translateOffline(text,'en'),destroy(){}};
}
async function stop(){
  const s=state;if(!s)return;
  s.stopped=true;state=null;
  if(s.sessionTimeout)clearTimeout(s.sessionTimeout);
  if(s.socket){try{if(s.socket.readyState===WebSocket.OPEN)s.socket.send(JSON.stringify({type:'Terminate'}));}catch{} try{s.socket.close();}catch{}s.socket=null;}
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

async function processAssemblyJobs(s){
  if(s.processing||s.stopped||s!==state||!s.ready)return;
  s.processing=true;
  try{
    while(s.tasks.length&&s===state&&!s.stopped){
      const job=s.tasks.shift(),stamp=performance.now();
      const original=job.original;
      let translated='';
      try{translated=String(await s.translator.translate(original)).trim();}
      catch(e){throw Error('FuguMT翻訳失敗: '+normalizeError(e));}
      if(!translated||s.stopped||s!==state)continue;
      s.lastCaptionAt=Date.now();s.captionsSent++;
      send(s,'CAPTION',{text:translated,original,processing_ms:Math.round(performance.now()-stamp)});
    }
  }catch(e){send(s,'ERROR',{text:normalizeError(e)});void stop();}
  finally{s.processing=false;}
}
async function prepareAssembly(s){
  if(languageCode(s.sourceLanguage)!=='en')throw Error('AssemblyAI Universal Streamingは英語配信専用です。言語を英語に設定してください');
  send(s,'STATUS',{text:'AssemblyAIモード: FuguMTを準備中（初回モデル取得あり）'});
  const {loadOfflineTranslator,translateOffline}=await import(chrome.runtime.getURL('vendor/whisper.bundle.js'));
  await loadOfflineTranslator(message=>send(s,'STATUS',{text:message}));
  if(s.stopped||s!==state)return;
  s.translator={translate:original=>translateOffline(original,'en'),destroy(){}};
  send(s,'STATUS',{text:'AssemblyAIの一時認証トークンを取得中'});
  const auth=await chrome.runtime.sendMessage({target:'ljc-background',type:'MINT_AAI_TOKEN',session:s.session,limitMinutes:s.limitMinutes});
  if(!auth?.ok||!auth.token)throw Error(auth?.error||'AssemblyAI一時認証に失敗しました');
  if(s.stopped||s!==state)return;
  s.turns=new AssemblyTurns();
  const socket=new WebSocket(assemblyWebsocketUrl(auth.token));
  s.socket=socket;
  socket.binaryType='arraybuffer';
  socket.onopen=()=>{
    if(s.stopped||s!==state){socket.close();return;}
    s.ready=true;s.connectedAt=Date.now();
    send(s,'READY',{backend:'assemblyai'});
    send(s,'STATUS',{text:'AssemblyAI Universal Streaming接続成功（音声を外部送信中・従量課金）'});
    s.sessionTimeout=setTimeout(()=>{
      if(s.stopped||s!==state)return;
      send(s,'ERROR',{text:'AssemblyAIの設定時間上限に達したため字幕を停止しました。'});
      void stop();
    },s.limitMinutes*60000);
  };
  socket.onmessage=event=>{
    if(s.stopped||s!==state)return;
    let message;
    try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='Heartbeat'){
      s.lastHeartbeat=message.realtime_factor;
      return;
    }
    if(message.type==='Turn'){
      s.turnEvents++;
      const utterance=s.turns.accept(message);
      if(!utterance)return;
      s.phrasesReceived++;
      if(s.tasks.length>=3){s.tasks.shift();send(s,'STATUS',{text:'翻訳負荷により古い字幕をスキップしました'});}
      s.tasks.push(utterance);
      void processAssemblyJobs(s);
    }
    if(message.type==='Error'||message.type==='SessionError'){
      send(s,'ERROR',{text:'AssemblyAI応答: '+normalizeError(message.error||message.message)});
      void stop();
    }
  };
  socket.onerror=()=>{if(s===state&&!s.stopped)send(s,'STATUS',{text:'AssemblyAI通信エラー。接続状態を確認しています'});};
  socket.onclose=event=>{
    if(s.stopped||s!==state)return;
    send(s,'ERROR',{text:'AssemblyAI接続終了 ('+event.code+')。APIキー・利用枠・ネットワークを確認してください'});
    void stop();
  };
}

async function prepare(s){
  try{
    if(s.mode==='assemblyai'){await prepareAssembly(s);return;}
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
  const s={session:msg.session,tabId:msg.tabId,sourceLanguage:msg.sourceLanguage||'en-US',backend:msg.asrBackend||'auto',mode:msg.captionMode||'local',limitMinutes:Math.max(1,Math.min(60,Number(msg.assemblyMinutes)||10)),socket:null,turns:null,sessionTimeout:null,lastHeartbeat:null,audioFrames:0,turnEvents:0,phrasesReceived:0,captionsSent:0,connectedAt:0,lastCaptionAt:0,stopped:false,ready:false,processing:false, tasks:[],lastText:'',lastTime:0,translator:null,stream:null,context:null,processor:null,mute:null,chunker:null};
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
      if(s===state&&!s.stopped&&s.ready){const audio=new Float32Array(event.data);if(s.mode==='assemblyai'){
        if(s.socket?.readyState===WebSocket.OPEN){
          if(s.socket.bufferedAmount>1024*1024){send(s,'STATUS',{text:'通信遅延のため音声チャンクをスキップ'});return;}
          try{s.socket.send(pcm16(audio));}
          catch(error){send(s,'ERROR',{text:'AssemblyAI音声送信に失敗しました: '+normalizeError(error)});void stop();return;}
          s.audioFrames++;
          if(s.audioFrames%100===0 && Date.now()-s.lastCaptionAt>7500){
            send(s,'STATUS',{text:'AssemblyAI接続中｜送信約'+Math.round(s.audioFrames/10)+'秒、認識応答 '+s.turnEvents+'件、翻訳中 '+s.tasks.length+'件、字幕 '+s.captionsSent+'件'+(s.lastHeartbeat!=null?'、音声受信比 '+Number(s.lastHeartbeat).toFixed(2):'')});
          }
        }
      }else s.chunker.accept(audio);}
    };
    await s.context.resume();
    send(s,'STATUS',{text:s.mode==='assemblyai'?'タブ音声取得成功。AssemblyAI + FuguMTを準備中…':'タブ音声取得成功。Whisperモデルを準備中…'});
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
