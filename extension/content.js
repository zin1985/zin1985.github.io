(() => {
  if (globalThis.__ljcCaptionOverlayInitialized) return;
  globalThis.__ljcCaptionOverlayInitialized = true;
  const root = document.createElement('div');
  root.id = '__live_japanese_captions_host';
  const shadow = root.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;position:fixed;z-index:2147483647;bottom:11%;left:0;width:100%;pointer-events:none;color:#fff;font-family:system-ui,'Noto Sans JP',sans-serif;text-align:center}#captions{margin:auto;max-width:min(94vw,1080px);display:none;flex-direction:column;align-items:center;gap:3px}.line{display:block;max-width:100%;box-sizing:border-box;line-height:1.45;padding:5px 13px;border-radius:8px;overflow-wrap:anywhere;text-shadow:0 2px 4px #000,0 0 5px #000;background:rgba(0,0,0,.78)}#translation{font-weight:750}#original{color:#d5e7f3;font-size:16px}#status{position:fixed;bottom:0;right:8px;font-size:12px;border-radius:5px;background:rgba(7,20,27,.80);padding:2px 7px;max-width:45vw;overflow-wrap:anywhere;display:none}#status.error{color:#ffb5b5}#status.info{color:#d7f3ee`;
  const wrapper = document.createElement('div');
  const captions = document.createElement('div'); captions.id='captions';
  const translation = document.createElement('div');translation.id='translation';translation.className='line';
  const original = document.createElement('div');original.id='original';original.className='line';
  const status = document.createElement('div');status.id='status';status.className='info';
  captions.append(translation,original);wrapper.append(captions,status);shadow.append(style,wrapper);
  let session = null, showOriginal = false, expiration = null;
  const attach = () => {
    const full = document.fullscreenElement || document.webkitFullscreenElement;
    if(full && full !== root.parentElement) full.append(root);
    else if (!full && root.parentElement !== document.documentElement) document.documentElement.append(root);
  };
  document.addEventListener('fullscreenchange',attach);
  document.addEventListener('webkitfullscreenchange',attach);
  attach();
  const setStatus = (text, error=false) => {
    status.textContent = text || '';
    status.style.display = text ? 'block':'none';
    status.className = error ? 'error' : 'info';
    if (!error && text) window.setTimeout(() => { if (status.textContent===text) status.style.display='none'; },5500);
  };
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.source !== 'ljc-background') return;
    if (msg.type==='INITIALIZE') {
      session = msg.session;showOriginal=Boolean(msg.showOriginal);
      translation.style.fontSize = `${Math.max(18,Math.min(48,Number(msg.fontSize)||26))}px`;
      captions.style.display='none';setStatus('日本語字幕を準備中…');attach();
    } else if (msg.type==='CAPTION' && session) {
      translation.textContent=msg.text || '';
      original.textContent=msg.original || '';
      original.style.display=showOriginal && msg.original?'block':'none';
      captions.style.display=translation.textContent?'flex':'none';setStatus('');
      if(expiration)clearTimeout(expiration);
      expiration=window.setTimeout(()=>{captions.style.display='none'},8500);
    } else if (msg.type==='STATUS' && session) setStatus(msg.text||'');
    else if (msg.type==='ERROR') { session=null;captions.style.display='none';setStatus(msg.text||'不明なエラー',true); }
    else if (msg.type==='STOP') { session=null;captions.style.display='none';setStatus('');if(expiration)clearTimeout(expiration); }
  });
})();
