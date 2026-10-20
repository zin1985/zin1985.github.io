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
  const p=new URLSearchParams({sample_rate:String(AAI_SAMPLE_RATE),speech_model:AAI_MODEL,format_turns:'true',session_heartbeat:'true',token});
  return 'wss://streaming.assemblyai.com/v3/ws?'+p.toString();
}
// Convert v3 streaming partials into short, non-overlapping translation segments.
// AssemblyAI sends repeated cumulative transcripts for a turn; do not translate
// the entire transcript every time. Prefer finalized word spans.
export class AssemblyTurns {
  constructor({partialMs=1800,minWords=4,maxWords=12}={}){
    this.byTurn=new Map();this.order=[];
    this.partialMs=partialMs;this.minWords=minWords;this.maxWords=maxWords;
  }
  accept(event,now=Date.now()){
    if(event?.type!=='Turn'||!Number.isInteger(event.turn_order)||event.turn_order<0)return null;
    const id=event.turn_order;
    let rec=this.byTurn.get(id);
    if(!rec){
      rec={consumed:0,pendingSince:0,finalSeen:false,lastFallback:'',fallbackParts:[]};
      this.byTurn.set(id,rec);this.order.push(id);
      if(this.order.length>100)this.byTurn.delete(this.order.shift());
    }
    if(rec.finalSeen)return null;
    const isFinal=event.end_of_turn===true && event.turn_is_formatted!==false;
    const hasUtterance=typeof event.utterance==='string'&&event.utterance.trim().length>0;
    const words=Array.isArray(event.words)?event.words:[];
    if(words.length){
      const validFinal=event.end_of_turn===true?words.length:words.findIndex(w=>w.word_is_final!==true);
      const available=validFinal<0?words.length:validFinal;
      // Events may carry a revised word span. Once translated, never rewind
      // or re-emit a previously consumed span.
      if(available>rec.consumed){
        if(!rec.pendingSince)rec.pendingSince=now;
        const count=available-rec.consumed;
        const due=now-rec.pendingSince>=this.partialMs;
        const flush=isFinal||hasUtterance||count>=this.maxWords||(count>=this.minWords&&due);
        if(flush){
          const last=Math.min(available,isFinal||hasUtterance?available:rec.consumed+this.maxWords);
          const phrase=words.slice(rec.consumed,last).map(w=>String(w.text||'').trim()).filter(Boolean).join(' ').replace(/\s+([,.;!?])/g,'$1').trim();
          rec.consumed=last;rec.pendingSince=0;
          if(isFinal)rec.finalSeen=true;
          if(phrase&&!/^\s*\[(silence|music|noise|applause)\]\s*$/i.test(phrase))return {original:phrase,turnOrder:id};
        }
      }
      if(isFinal)rec.finalSeen=true;
      return null;
    }
    // Compatibility with v3 models that omit word timestamps.
    // Only process an utterance (or complete turn), never fluctuating partials.
    const raw=(hasUtterance?event.utterance: isFinal?event.transcript:'')||'';
    const full=String(raw).trim();
    if(isFinal)rec.finalSeen=true;
    if(!full||/^\[(silence|music|noise|applause)\]$/i.test(full))return null;
    const key=full.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
    if(rec.fallbackParts.includes(key))return null;
    rec.fallbackParts.push(key);
    if(!hasUtterance && rec.lastFallback && key.startsWith(rec.lastFallback)){
      const prev=rec.lastFallback;
      const rawPieces=full.split(/\s+/);
      const previous=rec._previousWords||0;
      const diff=rawPieces.slice(previous).join(' ').trim();
      if(!diff)return null;
      return {original:diff,turnOrder:id};
    }
    rec.lastFallback=key;rec._previousWords=full.split(/\s+/).length;
    return {original:full,turnOrder:id};
  }
  reset(){this.byTurn.clear();this.order=[];}
}
