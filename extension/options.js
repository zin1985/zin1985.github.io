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
 if(!globalThis.Translator?.create)throw Error('Translator APIが使えません。Edge 148以降が必要です。');
 display('翻訳言語パックを準備中…');const t=await Translator.create({...translationOptions(),monitor(m){m.addEventListener('downloadprogress',e=>display('翻訳モデルの取得: '+Math.round(e.loaded*100)+'%'));}});
 t.destroy?.();display('翻訳パック準備完了');
}));
$('translation-test').addEventListener('click',()=>withBusy($('translation-test'),async()=>{
 if(!globalThis.Translator?.create)throw Error('Translator API未対応');
 const t=await Translator.create(translationOptions());
 try {display('翻訳結果: '+await t.translate('Hello, everyone. Welcome to our live stream.'));}
 finally {t.destroy?.();}
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
   if(!globalThis.Translator?.create)throw Error('認識成功: '+original+'。ただしこのブラウザではTranslator APIが使えません。');
   const trans=await Translator.create(translationOptions());try{translated=await trans.translate(original);}finally{trans.destroy?.();}
 }
 display(`認識元: ${original}\n日本語: ${translated}\n総処理時間: ${((performance.now()-started)/1000).toFixed(1)}秒`);
}));
