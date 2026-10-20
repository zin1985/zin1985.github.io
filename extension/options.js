const defaults={sourceLanguage:'en-US',showOriginal:false,fontSize:26,asrBackend:'auto'};
const $=id=>document.getElementById(id);
let whisper=null;
const display=(msg)=>{$('message').textContent=String(msg);};
function selected(){return {sourceLanguage:$('lang').value,showOriginal:$('original').checked,fontSize:Math.max(18,Math.min(48,Number($('fontSize').value)||26)),asrBackend:$('backend').value};}
const translationOptions=()=>({sourceLanguage:$('lang').value.split('-')[0],targetLanguage:'ja'});
chrome.storage.sync.get(defaults).then(settings=>{
 $('lang').value=settings.sourceLanguage;$('original').checked=settings.showOriginal;
 $('fontSize').value=settings.fontSize;$('backend').value=settings.asrBackend||'auto';display('設定を読み込みました。最初にWhisperと翻訳モデルを準備してください。');
});
$('save').addEventListener('click',async()=>{await chrome.storage.sync.set(selected());display('設定を保存しました。次回の字幕開始から反映されます。');});
$('gpu-status').addEventListener('click',async()=>{
 if(!navigator.gpu){display('WebGPUは使えません。CPU/WASMで利用可能ですが、字幕の遅延が長くなる場合があります。');return;}
 try {const adapter=await navigator.gpu.requestAdapter();display(adapter?'WebGPUアダプターを検出しました。GPUモードでの実際のモデル起動を試してください。':'WebGPUアダプターがありません。CPU/WASMで起動します。');}
 catch(e){display('WebGPU確認エラー: '+e.message);}
});
const runtimeURL=chrome.runtime.getURL('vendor/whisper.bundle.js');
async function checkRuntime(){
  let response;
  try{response=await fetch(runtimeURL,{cache:'no-cache'});}
  catch(err){throw Error('Whisper実行ファイルを読み込めません。SOURCE版ではなく約8MBのPortable ZIPを解凍し、extensionフォルダーをEdgeへ登録し直してください。詳細: '+(err?.message||err));}
  if(!response.ok)throw Error('Whisper実行ファイルがありません (HTTP '+response.status+')。SOURCE版では動きません。Portable ZIP内のextensionフォルダーを読み込んでください。');
  try{await response.body?.cancel();}catch{}
  return true;
}
async function getWhisper(){
  if(!whisper){
    await checkRuntime();
    try{whisper=await import(runtimeURL);}
    catch(err){throw Error('Whisperモジュールを読み込めません。Edgeの拡張機能を再読み込みし、Portable版のvendorフォルダーがあるか確認してください。詳細: '+(err?.message||err));}
  }
  return whisper;
}
$('runtime-check').addEventListener('click',()=>withBusy($('runtime-check'),async()=>{
  await checkRuntime();
  display('Whisper実行ファイル: 正常。次に「Whisperモデルを準備」を押してください。');
}));
async function withBusy(btn,run){btn.disabled=true;try{await run();}catch(e){display('失敗: '+(e?.message||e));}finally{btn.disabled=false;}}
$('whisper-init').addEventListener('click',()=>withBusy($('whisper-init'),async()=>{
 display('Whisperモデルを読み込みます。初回は数十〜数百MBのダウンロードが必要です…');
 const module=await getWhisper();const t=performance.now();
 const result=await module.loadWhisper($('backend').value,display);
 display(`Whisper準備完了: ${result.backend.toUpperCase()} / ${((performance.now()-t)/1000).toFixed(1)}秒\n音声ファイルのテストに進めます。`);
}));
$('translation-status').addEventListener('click',()=>withBusy($('translation-status'),async()=>{
 if(!globalThis.Translator?.availability)throw Error('このブラウザではTranslator APIを利用できません。Edge 148以降を確認してください。');
 const status=await Translator.availability(translationOptions());
 const guidance=status==='available'
   ? '日本語翻訳を利用できます。次は「翻訳テスト」を押してください。'
   : ['downloadable','downloading','after-download'].includes(status)
     ? '翻訳モデルは未導入です。下の「翻訳パックを準備」を押して完了を待ってください。'
     : 'この言語の翻訳は現在利用できません。Edgeのバージョン・言語設定を確認してください。';
 display('日本語翻訳の状態: '+status+'\n'+guidance);
}));
$('translation-install').addEventListener('click',()=>withBusy($('translation-install'),async()=>{
 if(!globalThis.Translator?.create){display('Edge翻訳APIがありません。英語配信なら「ローカル英日翻訳を準備」を押してください。');return;}
 display('Edge翻訳パックを準備中…');
 try{
   const t=await Translator.create({...translationOptions(),monitor(m){
     m.addEventListener('downloadprogress',e=>display('Edge翻訳モデル取得: '+Math.round(e.loaded*100)+'%'));
   }});
   t.destroy?.();display('Edge翻訳パックの準備が完了しました。翻訳テストを実行してください。');
 }catch(error){display('Edge翻訳器の生成失敗: '+(error?.message||error)+'\n英語配信なら「ローカル英日翻訳を準備」を押してください。');}
}));
$('local-translation-install').addEventListener('click',()=>withBusy($('local-translation-install'),async()=>{
 if(translationOptions().sourceLanguage!=='en')throw Error('ローカル翻訳は現在英語→日本語のみです');
 const mod=await getWhisper();await mod.loadOfflineTranslator(display);
 display('ローカル英日翻訳の準備が完了しました。翻訳テストを押してください。');
}));
async function translateWithFallback(text){
 const lang=translationOptions().sourceLanguage;
 let nativeError='Edge Translator API未対応';
 if(globalThis.Translator?.create){
   try{
     const translator=await Translator.create(translationOptions());
     try{return {text:await translator.translate(text),engine:'Edge内蔵'};}
     finally{translator.destroy?.();}
   }catch(error){nativeError=String(error?.message||error);}
 }
 if(lang!=='en')throw Error('Edge翻訳失敗: '+nativeError+'。ローカル代替は英語のみ対応です。');
 display('Edge翻訳器が起動できずローカル翻訳へ切り替えます: '+nativeError);
 const mod=await getWhisper();
 const translated=await mod.translateOffline(text,'en',display);
 return {text:translated,engine:'ローカルWASM'};
}
$('translation-test').addEventListener('click',()=>withBusy($('translation-test'),async()=>{
 const result=await translateWithFallback('Hello, everyone. Welcome to our live stream.');
 display('翻訳結果（'+result.engine+'）: '+result.text);
}));
function languageName(lang){return ({en:'english',ko:'korean',es:'spanish',fr:'french',de:'german',zh:'chinese',it:'italian',pt:'portuguese',ja:'japanese'})[lang]||'english';}
$('sample-test').addEventListener('click',()=>withBusy($('sample-test'),async()=>{
 const file=$('sample-file').files?.[0];if(!file)throw Error('音声ファイルを選択してください');
 if(file.size>35*1024*1024)throw Error('音声ファイルが大きすぎます。35MB以下の短い音声でテストしてください。');
 const ac=new AudioContext();let buffer;
 try{buffer=await ac.decodeAudioData(await file.arrayBuffer());}finally{await ac.close();}
 const length=Math.min(buffer.duration,15);
 const ctx=new OfflineAudioContext(1,Math.ceil(length*16000),16000);
 const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);source.start(0);
 const rendered=await ctx.startRendering();const samples=rendered.getChannelData(0);
 const module=await getWhisper();display('Whisper音声認識中…');const started=performance.now();
 const original=await module.speechToText(samples,languageName($('lang').value.split('-')[0]),$('backend').value,display);
 if(!original){display('認識結果が空です。音声が短すぎる、無音、またはモデルに未対応の可能性があります。');return;}
 let translated=original;
 if($('lang').value.split('-')[0]!=='ja'){
   const result=await translateWithFallback(original);translated=result.text;
 }
 display(`認識元: ${original}\n日本語: ${translated}\n総処理時間: ${((performance.now()-started)/1000).toFixed(1)}秒`);
}));
