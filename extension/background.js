/* MV3 service worker. On restart, query the offscreen document for its session. */
const DEFAULTS={sourceLanguage:'en-US',showOriginal:false,fontSize:26,asrBackend:'auto',captionMode:'local',assemblyMinutes:10};
let active={tabId:null,session:null}, busy=false;
const uid=()=>`ljc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
async function badge(tabId,text,color){if(tabId==null)return;try{await chrome.action.setBadgeText({tabId,text});if(color)await chrome.action.setBadgeBackgroundColor({tabId,color});}catch{}}
async function tell(tabId,data){try{await chrome.tabs.sendMessage(tabId,{...data,source:'ljc-background'});}catch{}}
async function offscreenExists(){return (await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL('offscreen.html')]})).length>0;}
async function ensureOffscreen(){if(!await offscreenExists())await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Capture audio of the tab on user click for local Japanese subtitles'});}
async function toOffscreen(type,rest={}){return chrome.runtime.sendMessage({target:'ljc-offscreen',type,...rest});}
async function refresh(){try{if(!await offscreenExists())return {active:false};const s=await toOffscreen('GET_STATUS');if(s?.active){active={tabId:s.tabId,session:s.session};return s;}}catch{}active={tabId:null,session:null};return {active:false};}
async function stop(session=active.session,tabId=active.tabId){
  active={tabId:null,session:null};
  try{if(await offscreenExists())await toOffscreen('STOP',{session});}catch{}
  await tell(tabId,{type:'STOP'});await badge(tabId,'');
}
async function start(tab){
  if(!tab?.id||!/^https?:\/\//.test(tab.url||'')){await badge(tab?.id,'ERR','#c62828');return;}
  const config=await chrome.storage.sync.get(DEFAULTS);
  if(config.captionMode==='assemblyai'){
    if(config.sourceLanguage.split('-')[0]!=='en')throw Error('AssemblyAI Universal Streamingは英語限定です');
    const {assemblyApiKey}=await chrome.storage.local.get('assemblyApiKey');
    if(!String(assemblyApiKey||'').trim()){
      void chrome.runtime.openOptionsPage();
      throw Error('AssemblyAI APIキーをオプション画面に設定してください');
    }
  }
  await ensureOffscreen();
  // Acquire the tab ID after creation; redeem immediately in the offscreen context.
  const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
  const session=uid();active={tabId:tab.id,session};
  const resultPromise=toOffscreen('START',{session,streamId,tabId:tab.id,sourceLanguage:config.sourceLanguage,asrBackend:config.asrBackend,captionMode:config.captionMode||'local',assemblyMinutes:config.assemblyMinutes||10});
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  await tell(tab.id,{type:'INITIALIZE',session,fontSize:config.fontSize,showOriginal:config.showOriginal});
  await badge(tab.id,'…','#546e7a');
  const result=await resultPromise;
  if(!result?.ok)throw Error(result?.error||'タブ音声を開始できませんでした');
}
chrome.action.onClicked.addListener(async tab=>{
  if(busy)return;busy=true;
  try{
    const s=await refresh();
    if(s.active&&s.tabId===tab.id){await stop(s.session,s.tabId);return;}
    if(s.active)await stop(s.session,s.tabId);
    await start(tab);
  }catch(error){const msg=String(error?.message||error);console.error('Live captions:',error);
    await stop(active.session,active.tabId);await tell(tab?.id,{type:'ERROR',text:msg});await badge(tab?.id,'ERR','#c62828');
  }finally{busy=false;}
});
// A personal-use extension: the user's key lives only in chrome.storage.local.
// It is never put in ZIP, sync storage, WebSocket URLs, page DOM, or source code.
// For centrally distributed production versions, replace this with an authenticated token broker.
async function mintAssemblyToken(minutes){
  const {assemblyApiKey}=await chrome.storage.local.get('assemblyApiKey');
  const key=String(assemblyApiKey||'').trim();
  if(!key)throw Error('AssemblyAIのAPIキーが設定されていません');
  const limit=Math.max(1,Math.min(60,Number(minutes)||10))*60;
  const url='https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds='+limit;
  const response=await fetch(url,{headers:{Authorization:key},cache:'no-store'});
  if(!response.ok)throw Error('AssemblyAIトークン取得失敗 HTTP '+response.status+'。APIキー・残高を確認してください');
  const data=await response.json();
  if(!data?.token)throw Error('AssemblyAI応答に一時トークンがありません');
  return data.token;
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg?.target!=='ljc-background'||msg.type!=='MINT_AAI_TOKEN')return false;
  if(sender.url!==chrome.runtime.getURL('offscreen.html')){
    reply({ok:false,error:'認証要求の送信元を拒否しました'});return false;
  }
  (async()=>{
    // The service worker may be restarted while FuguMT downloads.
    if(active.session!==msg.session)await refresh();
    if(msg.session!==active.session)throw Error('字幕セッションが終了しました');
    const token=await mintAssemblyToken(msg.limitMinutes);
    reply({ok:true,token});
  })().catch(error=>reply({ok:false,error:String(error?.message||error)}));
  return true;
});

chrome.runtime.onMessage.addListener((msg)=>{
  if(msg?.target!=='ljc-background'||!active.session||msg.session!==active.session)return;
  const tabId=active.tabId;
  if(msg.type==='CAPTION')void tell(tabId,{type:'CAPTION',text:msg.text,original:msg.original});
  if(msg.type==='STATUS')void tell(tabId,{type:'STATUS',text:msg.text});
  if(msg.type==='READY')void badge(tabId,'ON','#198754');
  if(msg.type==='ERROR')void(async()=>{await stop(msg.session,tabId);await tell(tabId,{type:'ERROR',text:msg.text});await badge(tabId,'ERR','#c62828');})();
});
chrome.tabs.onRemoved.addListener(tabId=>{if(active.tabId===tabId)void stop(active.session,tabId);});
chrome.tabs.onUpdated.addListener((tabId,info)=>{if(active.tabId===tabId&&info.status==='loading')void stop(active.session,tabId);});
