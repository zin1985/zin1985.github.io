// Plain ESM so it can be tested independently of the Chromium APIs.
export class SpeechChunker {
  constructor({sampleRate=16000, maxSeconds=6.0, minSeconds=.75, silenceSeconds=.65, threshold=.011, onSpeech=()=>{}}={}) {
    this.rate=sampleRate;this.maxSamples=maxSeconds*sampleRate;this.minSamples=minSeconds*sampleRate;
    this.silenceSamples=silenceSeconds*sampleRate;this.threshold=threshold;this.onSpeech=onSpeech;
    this.buffers=[];this.samples=0;this.quiet=0;this.started=false;this.pre=[];
  }
  accept(chunk){
    if(!chunk?.length)return;
    let energy=0;for(const x of chunk)energy+=x*x;
    const voiced=Math.sqrt(energy/chunk.length)>this.threshold;
    if(!this.started){
      this.pre.push(chunk);if(this.pre.length>3)this.pre.shift();
      if(!voiced)return;
      this.started=true;for(const x of this.pre){this.buffers.push(x);this.samples+=x.length;}this.pre=[];
    }else {this.buffers.push(chunk);this.samples+=chunk.length;}
    this.quiet=voiced?0:this.quiet+chunk.length;
    if((this.quiet>=this.silenceSamples&&this.samples>=this.minSamples)||this.samples>=this.maxSamples) this.flush();
    // Don't accumulate unbounded silent segments.
    else if(this.quiet>=this.silenceSamples && this.samples<this.minSamples)this.reset();
  }
  flush(){
    if(this.samples>=this.minSamples){const combined=new Float32Array(this.samples);let n=0;for(const item of this.buffers){combined.set(item,n);n+=item.length;}this.onSpeech(combined);}
    this.reset();
  }
  reset(){this.buffers=[];this.samples=0;this.quiet=0;this.started=false;this.pre=[];}
}
export function normText(text){return String(text||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'').trim();}
