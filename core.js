/* Score to ESC · standalone conversion engine. MIT license. */
(function (root) {
'use strict';
const Encoder=typeof module!=='undefined'&&module.exports?require('./vendor/bluejay-rtttl.js'):root.BluejayRTTTL;
const names=['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
const noteName=m=>names[((m%12)+12)%12].toUpperCase()+(Math.floor(m/12)-1);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function parseRTTTL(text) {
 const parts=text.trim().split(':');
 if(parts.length!==3) throw Error('RTTTL needs name:defaults:notes, for example Tune:d=4,o=5,b=120:c,d,e,p.');
 let d=4,o=6,b=63;
 for(const item of parts[1].split(',')){const m=item.trim().match(/^([dob])=(\d+)$/i);if(!m)throw Error('Invalid RTTTL defaults.');const n=+m[2];if(m[1].toLowerCase()==='d')d=n;if(m[1].toLowerCase()==='o')o=n;if(m[1].toLowerCase()==='b')b=n;}
 if(![1,2,4,8,16,32,64].includes(d)||o<3||o>7||b<25||b>900)throw Error('RTTTL defaults outside supported range (octaves 3–7, tempo 25–900).');
 let pos=0;const events=[];
 for(const token of parts[2].split(',')){const m=token.trim().match(/^(1|2|4|8|16|32|64)?([a-gp])(#?)(\.?)([3-7]?)(\.?)$/i);if(!m)throw Error('Invalid RTTTL note: '+token);const dur=4/(+m[1]||d)*((m[4]||m[6])?1.5:1);let pitch=null;if(m[2].toLowerCase()!=='p'){pitch=(+(m[5]||o)+1)*12+names.indexOf(m[2].toLowerCase())+(m[3]?1:0);if(m[3]&&['b','e'].includes(m[2].toLowerCase()))throw Error('Use C or F instead of B# or E# in RTTTL.');}events.push({start:pos,duration:dur,pitch});pos+=dur;}
 return {title:parts[0]||'Melody',bpm:b,tracks:[{id:'rtttl',name:'RTTTL melody',events}],warnings:[]};
}
function parseMIDI(buffer) {
 const a=new Uint8Array(buffer),v=new DataView(a.buffer,a.byteOffset,a.byteLength);let p=0;
 const need=n=>{if(p+n>a.length)throw Error('MIDI is truncated.');};
 const u8=()=>{need(1);return a[p++];};const u16=()=>{need(2);const x=v.getUint16(p);p+=2;return x;};const u32=()=>{need(4);const x=v.getUint32(p);p+=4;return x;};
 const str=n=>{need(n);const s=new TextDecoder().decode(a.subarray(p,p+n));p+=n;return s;};
 const vlq=()=>{let n=0;for(let i=0;i<4;i++){const x=u8();n=n*128+(x&127);if(!(x&128))return n;}throw Error('Invalid MIDI variable-length number.');};
 if(str(4)!=='MThd')throw Error('This is not a standard MIDI file.');const hlen=u32();if(hlen<6)throw Error('Invalid MIDI header.');const format=u16(),count=u16(),division=u16();if(format>1)throw Error('MIDI format 2 is unsupported. Export MIDI type 0 or 1.');if(!division||(division&32768))throw Error('SMPTE MIDI timing is unsupported. Export with ticks per quarter note.');need(hlen-6);p+=hlen-6;
 const tempos=[{tick:0,us:500000}],raw=[],warnings=[];let percussion=0,sustain=false,unclosed=0;
 for(let ti=0;ti<count;ti++){
  if(str(4)!=='MTrk')throw Error('Missing MIDI track chunk.');const len=u32();need(len);const end=p+len;let tick=0,running=0,label='Track '+(ti+1);const active=new Map(),events=[];
  while(p<end){tick+=vlq();let status=u8();if(status<128){if(!running)throw Error('Invalid MIDI running status.');p--;status=running;}else if(status<240)running=status;else running=0;
   if(status===255){const type=u8(),n=vlq();need(n);if(type===81&&n===3)tempos.push({tick,us:(a[p]<<16)|(a[p+1]<<8)|a[p+2]});if(type===3)label=new TextDecoder().decode(a.subarray(p,p+n))||label;p+=n;}
   else if(status===240||status===247){const n=vlq();need(n);p+=n;}
   else if(status>=240)throw Error('Unsupported MIDI system event.');
   else {const kind=status>>4,ch=status&15,x=u8(),y=(kind===12||kind===13)?0:u8();if(x>127||y>127)throw Error('Invalid MIDI data byte.');if(kind===11&&x===64&&y>=64)sustain=true;
    const key=ch+':'+x;
    if(kind===9&&y>0){if(ch===9){percussion++;continue;}const queue=active.get(key)||[];queue.push({tick,pitch:x,channel:ch});active.set(key,queue);}
    if(kind===8||(kind===9&&y===0)){const queue=active.get(key);if(queue?.length){const on=queue.shift();if(tick>on.tick)events.push({...on,end:tick});}}
   }
   if(p>end)throw Error('MIDI event extends past its track.');
  }
  for(const queue of active.values())for(const on of queue){unclosed++;if(tick>on.tick)events.push({...on,end:tick});}
  for(const ch of [...new Set(events.map(e=>e.channel))])raw.push({id:ti+':'+ch,name:label+' · channel '+(ch+1),events:events.filter(e=>e.channel===ch)});
 }
 tempos.sort((a,b)=>a.tick-b.tick);const base=tempos.filter(t=>t.tick===0).at(-1).us;if(!base)throw Error('Invalid zero MIDI tempo.');const bpm=60000000/base;
 let last=0,seconds=0,us=500000;const map=[];for(const t of tempos){if(!t.us)throw Error('Invalid zero MIDI tempo.');seconds+=(t.tick-last)/division*us/1e6;map.push({...t,seconds});last=t.tick;us=t.us;}
 const beats=tick=>{let lo=0,hi=map.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(map[m].tick<=tick)lo=m;else hi=m-1;}const t=map[lo];return (t.seconds+(tick-t.tick)/division*t.us/1e6)*bpm/60;};
 if(percussion)warnings.push('Percussion channel 10 was excluded.');if(sustain)warnings.push('Sustain pedal is ignored; MIDI note-off durations are used.');if(unclosed)warnings.push(unclosed+' unterminated MIDI notes were closed at the end of their tracks.');if(tempos.length>2)warnings.push('MIDI tempo changes are baked into note lengths before RTTTL quantization.');
 return {title:'MIDI melody',bpm,tracks:raw.map(t=>({...t,events:t.events.map(e=>({pitch:e.pitch,start:beats(e.tick),duration:beats(e.end)-beats(e.tick)}))})),warnings};
}
function parseMusicXML(text) {
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Malformed MusicXML. Export the score again.');
 const root=doc.documentElement;if(root.localName!=='score-partwise')throw Error('Use partwise MusicXML (.musicxml/.xml), exported from MuseScore or another notation editor.');
 const children=(e,n)=>Array.from(e.children).filter(x=>x.localName===n);
 const child=(e,n)=>children(e,n)[0];const txt=(e,n)=>child(e,n)?.textContent?.trim()||'';
 const tracks=[],warnings=[],tempos=[];let grace=0,repeat=false,micro=false;
 const title=doc.querySelector('work-title, movement-title')?.textContent?.trim()||'Sheet music';
 for(const part of children(root,'part')){
  const definition=Array.from(doc.querySelectorAll('score-part')).find(e=>e.getAttribute('id')===part.getAttribute('id'));const label=definition?txt(definition,'part-name'):part.getAttribute('id');
  let divisions=1,measureStart=0,transpose=0;const voices=new Map(),ties=new Map();
  for(const measure of children(part,'measure')){let cursor=0,max=0,lastStart=0;
   if(measure.querySelector('repeat, ending'))repeat=true;
   for(const el of measure.children){
    if(el.localName==='attributes'){const d=+txt(el,'divisions');if(d>0)divisions=d;const tr=child(el,'transpose');if(tr)transpose=+(txt(tr,'chromatic')||0)+12*+(txt(tr,'octave-change')||0);}
    else if(el.localName==='direction'){const sound=el.querySelector('sound[tempo]');let bpm=sound?+sound.getAttribute('tempo'):0;if(!bpm){const metro=el.querySelector('metronome');if(metro){const unit=txt(metro,'beat-unit');const ratio={whole:4,half:2,quarter:1,eighth:.5,'16th':.25}[unit]||1;bpm=+txt(metro,'per-minute')*ratio*(child(metro,'beat-unit-dot')?1.5:1);}}if(bpm>0)tempos.push({start:measureStart+cursor,bpm});}
    else if(el.localName==='backup')cursor-=+(txt(el,'duration')||0)/divisions;
    else if(el.localName==='forward'){cursor+=+(txt(el,'duration')||0)/divisions;max=Math.max(max,cursor);}
    else if(el.localName==='note'){
     if(child(el,'grace')){grace++;continue;}const duration=+(txt(el,'duration')||0)/divisions;if(!(duration>0))continue;
     const isChord=!!child(el,'chord');const start=isChord?lastStart:cursor;if(!isChord){lastStart=start;cursor+=duration;}max=Math.max(max,start+duration,cursor);
     const voice=txt(el,'voice')||'1',staff=txt(el,'staff')||'1',key=staff+':'+voice;if(!voices.has(key))voices.set(key,[]);const pitchEl=child(el,'pitch');if(!pitchEl)continue;
     const step=txt(pitchEl,'step').toLowerCase(),oct=+txt(pitchEl,'octave'),alter=+(txt(pitchEl,'alter')||0);if(!names.includes(step)||!Number.isFinite(oct))throw Error('Invalid pitch in MusicXML.');if(!Number.isInteger(alter))micro=true;
     const pitch=(oct+1)*12+names.indexOf(step)+Math.round(alter)+transpose;const tieKey=key+':'+pitch;const tieTypes=children(el,'tie').map(t=>t.getAttribute('type'));const previous=ties.get(tieKey);
     if(tieTypes.includes('stop')&&previous&&Math.abs(previous.start+previous.duration-(measureStart+start))<.001){previous.duration+=duration;if(!tieTypes.includes('start'))ties.delete(tieKey);}
     else {const event={start:measureStart+start,duration,pitch};voices.get(key).push(event);if(tieTypes.includes('start'))ties.set(tieKey,event);}
    }
   }
   measureStart+=max;
  }
  for(const [key,events] of voices)if(events.length)tracks.push({id:part.getAttribute('id')+':'+key,name:label+' · staff '+key.split(':')[0]+' / voice '+key.split(':')[1],events});
 }
 if(grace)warnings.push(grace+' grace notes omitted.');if(repeat)warnings.push('Repeat signs and endings are played once, in written order. Export an unfolded MIDI to include repeats.');if(micro)warnings.push('Microtonal pitches rounded to semitones.');if(new Set(tempos.map(t=>t.bpm)).size>1)warnings.push('MusicXML tempo changes are flattened to the chosen tempo. Use MIDI to preserve tempo changes.');
 warnings.push('MusicXML dynamics, ornaments, fermatas and articulations are not reproduced.');
 return {title,bpm:tempos.find(t=>t.start===0)?.bpm||tempos[0]?.bpm||120,tracks,warnings};
}
const rhythms=[];for(const d of [1,2,4,8,16,32,64])for(const dot of [false,true])rhythms.push({beats:4/d*(dot?1.5:1),d,dot});rhythms.sort((a,b)=>b.beats-a.beats);
function convert(score,opts={}){
 const bpm=Math.round(+opts.bpm||120),start=+opts.start||0,length=+opts.length||8,shift=+opts.transpose||0,cap=+opts.cap||62;
 if(bpm<25||bpm>900||start<0||length<=0||!Number.isFinite(start+length+shift)||!Number.isInteger(cap)||cap<1||cap>10000)throw Error('Invalid conversion settings.');
 const track=score.tracks.find(t=>t.id===opts.track)||score.tracks[0];if(!track)throw Error('No pitched notes were found.');const secondsPerBeat=60/bpm;
 // Excerpt times are in the output tempo, before quantization.
 const events=track.events.filter(e=>e.pitch!==null).map(e=>({...e,start:e.start*secondsPerBeat,end:(e.start+e.duration)*secondsPerBeat,pitch:e.pitch+shift})).filter(e=>e.end>start&&e.start<start+length);
 if(!events.length)throw Error('No notes in this excerpt. Choose another part or adjust the start time.');
 const origin=opts.trim!==false?Math.max(start,Math.min(...events.map(e=>e.start))):start;
 const bounds=[origin,start+length];for(const e of events)bounds.push(clamp(e.start,origin,start+length),clamp(e.end,origin,start+length));bounds.sort((a,b)=>a-b);const unique=bounds.filter((n,i)=>!i||n-bounds[i-1]>1e-7);
 const segments=[];let poly=false,folded=0;
 for(let i=0;i<unique.length-1;i++){const a=unique[i],b=unique[i+1];const on=events.filter(e=>e.start<=a+1e-7&&e.end>a+1e-7).sort((x,y)=>opts.policy==='lowest'?x.pitch-y.pitch:y.pitch-x.pitch);if(on.length>1)poly=true;let pitch=on[0]?.pitch??null;
  if(pitch!==null&&(pitch<60||pitch>95)){if(opts.fold===false)throw Error('Notes outside C4–B6. Transpose or enable octave folding.');while(pitch<60)pitch+=12;while(pitch>95)pitch-=12;folded++;}
  const previous=segments.at(-1);const sameNote=on[0]&&previous?.source===on[0];if(previous&&previous.pitch===pitch&&(pitch===null||sameNote))previous.seconds+=b-a;else segments.push({pitch,seconds:b-a,source:on[0]});
 }
 while(segments.at(-1)?.pitch===null)segments.pop();
 const tokens=[],out=[];let time=0,error=0;
 for(const seg of segments){let beats=seg.seconds/secondsPerBeat;while(beats>6+1e-7){add(seg.pitch,rhythms[0]);beats-=6;}if(beats>1e-6){const rhythm=rhythms.reduce((best,r)=>Math.abs(r.beats-beats)<Math.abs(best.beats-beats)?r:best);error+=Math.abs(rhythm.beats-beats)*secondsPerBeat;add(seg.pitch,rhythm);}}
 function add(pitch,r){const duration=r.beats*secondsPerBeat;tokens.push(r.d+(pitch===null?'p':names[pitch%12])+(r.dot?'.':'')+(pitch===null?'':Math.floor(pitch/12)-1));out.push({pitch,start:time,duration});time+=duration;}
 const total=tokens.length;
 const title=(score.title||'Melody').replace(/[^a-z0-9 _-]/gi,'').slice(0,10)||'Melody';
 const prefix=title+':d=4,o=5,b='+bpm+':';
 let count=opts.limit!==false?Math.min(total,cap):total;
 let encoded=Encoder.toBluejayStartupMelody(prefix+tokens.slice(0,count).join(','),128);
 const firstError=encoded.errorCodes.findIndex(code=>code!==0);
 if(firstError>=0&&opts.limit!==false){count=firstError;if(!count)throw Error('The first note alone exceeds the 128-byte melody budget. Raise the tempo or shorten the excerpt.');encoded=Encoder.toBluejayStartupMelody(prefix+tokens.slice(0,count).join(','),128);}
 const kept=out.slice(0,count),keptTokens=tokens.slice(0,count),clipped=count<total;
 const encodedBytes=4+kept.reduce((bytes,e)=>{const hz=e.pitch===null?0:Math.round(261.63*2**((e.pitch-60)/12)*10)/10;const units=Math.round(e.duration*(hz||1000));return bytes+2*Math.ceil(units/255);},0);
 const warnings=[...(score.warnings||[])];if(poly)warnings.push('Overlapping notes reduced to the '+(opts.policy==='lowest'?'lowest':'highest')+' active pitch.');if(folded)warnings.push('Out-of-range pitches were folded by octaves into C4–B6.');
 if(clipped)warnings.push('Excerpt trimmed from '+total+' to '+count+' RTTTL tokens to fit the token and 128-byte encoding budgets.');
 if(count>cap)warnings.push(count+' RTTTL tokens exceed your '+cap+'-token budget.');
 if(encodedBytes>128)warnings.push('Encoded melody requires '+encodedBytes+' bytes, exceeding the 128-byte AM32/Bluejay budget. Shorten it or enable trimming.');
 if(error>.015)warnings.push('Rhythm quantization changed segment lengths by '+Math.round(error*1000)+' ms in total (sum of absolute changes).');
 return {rtttl:prefix+keptTokens.join(','),events:kept,warnings,totalTokens:total,tokens:count,encodedBytes,duration:kept.at(-1)?kept.at(-1).start+kept.at(-1).duration:0,clipped,withinBudget:count<=cap&&encodedBytes<=128,bpm,track:track.name};
}
function wav(events,sampleRate=22050){
 const duration=(events.at(-1)?.start||0)+(events.at(-1)?.duration||0)+.1;if(duration>180)throw Error('WAV export limited to three minutes.');const count=Math.ceil(duration*sampleRate),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);const write=(p,s)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i));};write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);
 for(const e of events){if(e.pitch===null)continue;const f=440*2**((e.pitch-69)/12),from=Math.round(e.start*sampleRate),to=Math.min(count,Math.round((e.start+e.duration)*sampleRate));for(let i=from;i<to;i++){const t=(i-from)/sampleRate,env=Math.min(1,t/.005,(to-i)/sampleRate/.012);view.setInt16(44+i*2,Math.sin(2*Math.PI*f*t)*env*6500,true);}}
 return buffer;
}
const api={parseRTTTL,parseMIDI,parseMusicXML,convert,wav,noteName};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScoreESC=api;
})(typeof globalThis!=='undefined'?globalThis:this);
