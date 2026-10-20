// AudioWorklet: 16-kHz mono chunks; no network or mic permission.
class CaptionPCMProcessor extends AudioWorkletProcessor {
 constructor(){super();this.ratio=sampleRate/16000;this.next=0;this.index=0;this.prev=0;this.data=new Float32Array(1600);this.count=0;}
 process(inputs){
  const chans=inputs[0];if(!chans?.length)return true;
  const n=chans[0].length;
  let channel=-1;
  if(chans.length===2){let a=0,b=0,m=0;for(let i=0;i<n;i++){const l=chans[0][i],r=chans[1][i];a+=l*l;b+=r*r;m+=(l+r)*(l+r)*.25;}if(m<Math.max(a,b)*.12)channel=a>=b?0:1;}
  for(let i=0;i<n;i++){
    let v=0;if(channel>=0)v=chans[channel][i];else {for(let c=0;c<chans.length;c++)v+=chans[c][i];v/=chans.length;}
    if(this.index===0)this.prev=v;
    while(this.next<=this.index){
      const t=Math.max(0,Math.min(1,this.next-(this.index-1)));
      const sample=this.prev+(v-this.prev)*t;
      this.data[this.count++]=Math.max(-1,Math.min(1,sample));
      if(this.count===1600){const send=this.data;this.port.postMessage(send.buffer,[send.buffer]);this.data=new Float32Array(1600);this.count=0;}
      this.next+=this.ratio;
    }
    this.prev=v;this.index++;
  }
  if(this.index>10000000){this.index-=10000000;this.next-=10000000;}
  return true;
 }
}
registerProcessor('caption-pcm-16k',CaptionPCMProcessor);
