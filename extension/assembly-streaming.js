// Pure helpers for AssemblyAI v3. Do not persist raw audio or tokens.
export const AAI_MODEL='universal-streaming-english';
export const AAI_SAMPLE_RATE=16000;
export function pcm16(samples){
  if(!(samples instanceof Float32Array))throw new TypeError('Float32Array audio required');
  const buffer=new ArrayBuffer(samples.length*2), view=new DataView(buffer);
  for(let i=0;i<samples.length;i++){
    const sample=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));
    view.setInt16(i*2,sample<0?Math.round(sample*32768):Math.round(sample*32767),true);
  }
  return buffer;
}
export function assemblyWebsocketUrl(token){
  if(typeof token!=='string'||token.length<10||token.length>2048||!(/^[A-Za-z0-9._~-]+$/).test(token))throw new Error('AssemblyAI token invalid');
  const p=new URLSearchParams({sample_rate:String(AAI_SAMPLE_RATE),speech_model:AAI_MODEL,format_turns:'true',token});
  return 'wss://streaming.assemblyai.com/v3/ws?'+p.toString();
}
export class AssemblyTurns {
  constructor(){this.byTurn=new Map();this.order=[];}
  accept(event){
    if(event?.type!=='Turn')return null;
    const turn=event.turn_order;
    if(!Number.isInteger(turn)||turn<0)return null;
    const utterance=typeof event.utterance==='string'?event.utterance.trim():'';
    if(!utterance && event.end_of_turn!==true)return null;
    const text=utterance || String(event.transcript||'').trim();
    if(!text || /^\[(?:silence|music|noise|applause)\]$/i.test(text))return null;
    let rec=this.byTurn.get(turn);
    if(!rec){rec={phrases:new Set(),heardUtterance:false};this.byTurn.set(turn,rec);this.order.push(turn);}
    if(!utterance && rec.heardUtterance)return null;
    const key=text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
    if(rec.phrases.has(key))return null;
    rec.phrases.add(key);
    if(utterance)rec.heardUtterance=true;
    if(this.order.length>100)this.byTurn.delete(this.order.shift());
    return {original:text,turnOrder:turn};
  }
  reset(){this.byTurn.clear();this.order=[];}
}
