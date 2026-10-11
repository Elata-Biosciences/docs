function extract(b){
 const out=[]; const lines=b.split(/(?<=\n)/); let offset=0,inFence=false,inFront=b.startsWith("---"),frontSeen=0;let paragraph=null;
 function flush(){if(paragraph){out.push(paragraph);paragraph=null;}}
 for(const raw of lines){const l=raw.replace(/\r?\n$/,""); const at=offset;offset+=raw.length;
 if(inFront){if(l==="---"){frontSeen++;if(frontSeen===2)inFront=false;}else{const m=l.match(/^(title|description|sidebarTitle):\s*["']?(.*?)["']?$/);if(m){let v=m[2];const start=at+l.indexOf(v);out.push({start,end:start+v.length,text:v,kind:"meta"});}}continue;}
 if(/^```/.test(l.trim())){flush();inFence=!inFence;continue;}if(inFence)continue;
 if(!l.trim()){flush();continue;}
 if(/^\s*<\/?[A-Z]/.test(l)){flush();for(const m of l.matchAll(/(?:title|label)=["']([^"']+)["']/g)){const s=at+m.index+m[0].indexOf(m[1]);out.push({start:s,end:s+m[1].length,text:m[1],kind:"attr"});}const inner=l.match(/>\s*([^<>]+?)\s*<\/[A-Z][^>]*>/);if(inner){const s=at+l.indexOf(inner[1]);out.push({start:s,end:s+inner[1].length,text:inner[1],kind:"text"});}continue;}
 if(/^\s*(---|\|[ :\-|]+\|)\s*$/.test(l)){flush();continue;}
 if(/^\s*(#{1,6}\s|[-*]\s|\d+\.\s|\||!\[|\*\*[^*]+\.\*\*)/.test(l)){flush();out.push({start:at,end:at+l.length,text:l,kind:/^\|/.test(l)?"table":/^#/.test(l)?"heading":"text"});continue;}
 if(paragraph&&paragraph.end+1>=at){paragraph.end=at+l.length;paragraph.text=b.slice(paragraph.start,paragraph.end);}else{flush();paragraph={start:at,end:at+l.length,text:l,kind:"text"};}
 }flush();return out;
}
(function localizationProgram() {
 const fs=require("node:fs"),path=require("node:path");
 const input=JSON.parse(fs.readFileSync("scripts/localization-input.json","utf8"));
 const cachePath="scripts/localization-cache.json";
 const cache=fs.existsSync(cachePath)?JSON.parse(fs.readFileSync(cachePath,"utf8")):{};
 const docs=Object.fromEntries(input.paths.map(p=>[p,fs.readFileSync(p,"utf8")]));
 const pageSegments=Object.fromEntries(Object.entries(docs).map(([p,b])=>[p,extract(b)]));
 const mdPaths=new Set(input.paths.map(p=>"/"+p.replace(/\.mdx$/,"")));
 const config=JSON.parse(fs.readFileSync("docs.json","utf8"));
 const redirects=new Set(config.redirects.map(r=>r.source.replace(/^\/(?:cn|es)\//,"/")));
 const literals=/`[^`]*`|\]\([^)\n]+\)|https?:\/\/[^\s<>)]+|(?:^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+))|\*\*|(?<!\w)_(?!\s)|(?<!\s)_(?!\w)|\[|(?<!\\)\||\b(?:USDC|ELTA|veELTA|EEG|PPG|rPPG|HRV|BPM|OPFS|IndexedDB|WebAssembly|WASM|Arrow|CRC32C|Muse|Athena|Elata|SDK|CLI|API|MessagePort|MessageChannel|JSON|npm|pnpm|Rust|TypeScript|JavaScript|GitHub|Base|Node\.js|Chrome|Edge|Safari|Firefox|Web Bluetooth|React|Vite|NumPy|SciPy)\b/gm;
 function protect(s) {
  const held=[];
  const tokenPattern=new RegExp("\\s*(?:"+literals.source+")\\s*",literals.flags);
  const text=s.replace(tokenPattern,m=>{let i=held.length;held.push(m);return " ⟦"+(9100000+i)+"⟧ ";});
  return {text,held};
 }
 function restore(text,held) {
  let remaining=text;
  const seen=new Set();
  remaining=remaining.replace(/\s*⟦\s*(910\d{4})\s*⟧\s*/g,(m,id)=>{
   id=Number(id)-9100000;if(id>=held.length)throw Error("Unknown literal "+id);
   if(seen.has(id))throw Error("Duplicated literal "+id);seen.add(id);return held[id];
  });
  if(seen.size!==held.length)throw Error("Translation lost protected literal");
  return remaining;
 }
 async function service(text,tl) {
  const url=new URL("https://translate.googleapis.com/translate_a/single");
  url.search=new URLSearchParams({client:"gtx",sl:"en",tl,dt:"t",q:text}).toString();
  for(let retry=0;retry<6;retry++) {
   try {
    const res=await fetch(url,{signal:AbortSignal.timeout(40000)});
    if(!res.ok)throw Error("Translation HTTP "+res.status);
    const json=await res.json();
    if(!Array.isArray(json[0]))throw Error("Unexpected translation response");
    return json[0].map(s=>s[0]||"").join("");
   }catch(err){if(retry===5)throw err;await new Promise(r=>setTimeout(r,Math.min(1000*2**retry,20000)));}
  }
 }
 async function batchTranslate(entries,tl) {
  const text=entries.map((e,i)=>"⟦"+(9000000+i)+"⟧\n"+e.protected.text).join("\n\n");
  const translated=await service(text,tl);
  const marker=/⟦\s*(900\d{4})\s*⟧/g;
  const matches=[...translated.matchAll(marker)];
  const results=[];
  if(matches.length===entries.length&&matches.every((m,i)=>Number(m[1])-9000000===i)){
   try{
    for(let i=0;i<entries.length;i++){
     const start=matches[i].index+matches[i][0].length;
     const end=i+1<matches.length?matches[i+1].index:translated.length;
     results.push(restore(translated.slice(start,end).trim(),entries[i].protected.held));
    }
    return results;
   }catch(err){console.log("Retrying batch per segment:",String(err));}
  }
  results.length=0;
  for(const e of entries){ const translated=await service(e.protected.text,tl); try { results.push(restore(translated.trim(),e.protected.held)); } catch(err){ console.error("Unpreserved source:",e.text,"Response:",translated); throw err; } }
  return results;
 }
 const chinese={};
 for(const [p,texts]of Object.entries(input.cnReuse)){
  const segs=pageSegments[p];
  if(segs&&segs.length===texts.length)segs.forEach((s,i)=>{chinese[s.text]=texts[i];});
 }
 function localizeLinks(b,locale){
  // Do not rewrite code blocks or asset URLs.
  let inFence=false;
  return b.split("\n").map(l=>{
   if(/^\s*```/.test(l)){inFence=!inFence;return l;}
   if(inFence)return l;
   return l.replace(/(href=["']|\]\()\/((?:cn\/|es\/)?)([^"')\s#]+)(#[^"')\s]*)?/g,(m,prefix,old,target,hash)=>{
    const plain="/"+target;
    if(!mdPaths.has(plain)&&!redirects.has(plain))return m;
    return prefix+"/"+locale+"/"+target+(hash||"");
   });
  }).join("\n");
 }
 function escapeReplacement(seg,text,body){
  if(seg.kind==="meta"){
   const lineStart=body.lastIndexOf("\n",seg.start)+1;
   const before=body.slice(lineStart,seg.start);
   const quoted=before.endsWith('"');
   if(quoted)return text.replaceAll("\\","\\\\").replaceAll('"','\\"').replaceAll("\n"," ");
   if(before.endsWith("\'"))return text.replaceAll("\'","\'\'").replaceAll("\n"," ");
   return JSON.stringify(text.replaceAll("\n"," "));
  }
  if(seg.kind==="attr")return text.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("'","&#39;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  return text;
 }
 function slug(h){
  return h.replace(/^#+\s*/,"").replace(/`/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").toLowerCase().replace(/[^\p{L}\p{N}\p{M}\-_ ]/gu,"").replace(/\s/g,"-");
 }
 function writePages(locale,map){
  for(const [p,b]of Object.entries(docs)){
   const segs=pageSegments[p];
   let out=b;
   for(let i=segs.length-1;i>=0;i--){
    const s=segs[i],raw=map[s.text];
    if(raw===undefined)throw Error("Missing "+locale+" translation: "+p+" "+s.text);
    let translated=escapeReplacement(s,raw,b);
    if(s.kind==="heading"&&slug(s.text)!==slug(raw)){
     translated='<a id="'+slug(s.text)+'"></a>\n\n'+translated;
    }
    out=out.slice(0,s.start)+translated+out.slice(s.end);
   }
   out=localizeLinks(out,locale);
   const file=path.join(locale,p);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,out);
  }
 }
 function navFor(locale,labels){
  function walk(v,k){
   if(typeof v==="string"){
    if(k==="language")return locale;
    if(k==="group"||k==="tab"||k==="anchor")return labels[v]||v;
    if(input.paths.includes(v+".mdx"))return locale+"/"+v;
    return v;
   }
   if(Array.isArray(v))return v.map(x=>walk(x,k==="pages"?"page":k));
   if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).map(([key,val])=>[key,walk(val,key)]));
   return v;
  }
  return walk(config.navigation.languages.find(l=>l.language==="en"),"");
 }
 async function run(){
  const probe=await service("Welcome to Elata. Raw signals stay on your device.","es");
  console.log("Translation probe:",probe);
  for(const [locale,tl]of [["cn","zh-CN"],["es","es"]]){
   const map={};
   const unique=[...new Set(Object.values(pageSegments).flat().map(s=>s.text))];
   const pending=[];
   for(const text of unique){
    const key=locale+":"+text;
    if(input.overrides?.[locale]?.[text]!==undefined){map[text]=input.overrides[locale][text];continue;}
    if(locale==="cn"&&chinese[text]!==undefined){map[text]=chinese[text];continue;}
    if(cache[key]!==undefined){map[text]=cache[key];continue;}
    const protectedText=protect(text);
    if(!/[A-Za-z]{2}/.test(protectedText.text.replace(/⟦\d+⟧/g,""))){map[text]=text;continue;}
    pending.push({text,key,protected:protectedText});
   }
   console.log(locale+": "+pending.length+" untranslated segments");
   const batches=[];let batch=[],length=0;
   for(const entry of pending){
    const size=entry.protected.text.length+35;
    if(batch.length&&(length+size>3500)){batches.push(batch);batch=[];length=0;}
    batch.push(entry);length+=size;
   }
   if(batch.length)batches.push(batch);
   for(let i=0;i<batches.length;i++){
    const translated=await batchTranslate(batches[i],tl);
    batches[i].forEach((entry,j)=>{map[entry.text]=translated[j];cache[entry.key]=translated[j];});
    fs.writeFileSync(cachePath,JSON.stringify(cache));
    console.log(locale+": batch "+(i+1)+"/"+batches.length+" complete");
    await new Promise(r=>setTimeout(r,200));
   }
   writePages(locale,map);
  }
  config.navigation.languages=[
   config.navigation.languages.find(l=>l.language==="en"),
   navFor("cn",input.cnNav),
   navFor("es",input.esNav),
  ];
  const sources=new Set(config.redirects.map(r=>r.source));
  for(const r of [...config.redirects].filter(r=>!/^\/(?:cn|es)\//.test(r.source))){
   const source="/es"+r.source,destination=r.destination.startsWith("/")?"/es"+r.destination:r.destination;
   if(!sources.has(source)){config.redirects.push({source,destination});sources.add(source);}
  }
  fs.writeFileSync("docs.json",JSON.stringify(config,null,2)+"\n");
  // Ensure no page silently falls back to English and all code stays identical.
  for(const locale of ["cn","es"])for(const [p,b]of Object.entries(docs)){
   const output=fs.readFileSync(path.join(locale,p),"utf8");
   const fences=s=>s.match(/```[\s\S]*?```/g)||[];
   if(JSON.stringify(fences(b))!==JSON.stringify(fences(output)))throw Error("Code changed: "+locale+"/"+p);
   if(output.includes("translation is being prepared")||output.includes("中文翻译正在准备中"))throw Error("Placeholder remained");
   if(!output.startsWith("---\n"))throw Error("Invalid front matter");
  }
  console.log("Generated "+input.paths.length+" complete pages in each locale; code blocks preserved.");
 }
 run().catch(err=>{console.error(err);process.exitCode=1;});
})();
