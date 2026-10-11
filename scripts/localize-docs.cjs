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
(function improvedLocalizer() {
 const fs=require("node:fs"),path=require("node:path");
 const input=JSON.parse(fs.readFileSync("scripts/localization-input.json","utf8"));
 const cacheFile="scripts/localization-cache.json";
 const cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile,"utf8")):{};
 const fallbackFile="scripts/localization-fallbacks.json";
 const fallbackRecords=fs.existsSync(fallbackFile)?JSON.parse(fs.readFileSync(fallbackFile,"utf8")):[];
 const docs=Object.fromEntries(input.paths.map(p=>[p,fs.readFileSync(p,"utf8")]));
 const segments=Object.fromEntries(Object.entries(docs).map(([p,b])=>[p,extract(b)]));
 const config=JSON.parse(fs.readFileSync("docs.json","utf8"));
 const mdPaths=new Set(input.paths.map(p=>"/"+p.slice(0,-4)));
 const redirects=new Set(config.redirects.map(r=>r.source.replace(/^\/(?:cn|es)\//,"/")));
 const cnReuse={};
 for(const [p,translated]of Object.entries(input.cnReuse)){
  if(segments[p]?.length!==translated.length)continue;
  segments[p].forEach((s,i)=>{
   const t=translated[i];
   if(/\p{Script=Han}/u.test(t)||s.text===t&&(/^[#\s]*`[^`]+`$/.test(t)||/^[#\s]*[A-Za-z0-9]+[a-z][A-Z][A-Za-z0-9]*$/.test(t)))cnReuse[s.text]=t;
  });
 }
 const terms={
  cn:{"Live":"已上线","Experimental":"实验性","Planned":"计划中","Retired":"已退役","Archived":"已归档","Code":"错误代码","Meaning":"含义","Description":"说明","Type":"类型","Status":"状态","Notes":"说明","Examples":"示例","Property":"属性","Value":"值","Package":"软件包","Function":"函数","Returns":"返回值","Capability":"功能","Field":"字段","Goal":"目标","Hardware":"硬件","Browser":"浏览器","Supported":"支持","Not supported":"不支持","Install":"安装","Overview":"概览","Credits":"使用额度（credits）","Elata Points":"Elata 积分","Revenue":"收入","Payouts":"收款","Yes":"是","No":"否","Next":"下一步"},
  es:{"Live":"Disponible","Experimental":"Experimental","Planned":"Planificado","Retired":"Retirado","Archived":"Archivado","Code":"Código","Meaning":"Significado","Description":"Descripción","Type":"Tipo","Status":"Estado","Notes":"Notas","Examples":"Ejemplos","Property":"Propiedad","Value":"Valor","Package":"Paquete","Function":"Función","Returns":"Devuelve","Capability":"Función","Field":"Campo","Goal":"Objetivo","Hardware":"Hardware","Browser":"Navegador","Supported":"Compatible","Not supported":"No compatible","Install":"Instalación","Overview":"Información general","Credits":"Créditos","Elata Points":"Elata Points","Revenue":"Ingresos","Payouts":"Cobros","Yes":"Sí","No":"No","Next":"Siguiente"}
 };
 function protect(text){
  const held=[];
  const normalized=text.replace(/\s*\n\s*/g," ").trim();
  const protectedText=normalized.replace(/\s*(?:`[^`]*`|\]\([^)\n]+\)|https?:\/\/[^\s<>)]+|\*\*|\[|(?<!\w)_(?!\s)|(?<!\s)_(?!\w)|@[a-z0-9-]+\/[a-z0-9-]+|\b(?:USDC|ELTA|veELTA|EEG|PPG|rPPG|HRV|OPFS|IndexedDB|WASM|WebAssembly|CRC32C|MessagePort|MessageChannel|Node\.js)\b)\s*/gm,m=>{
   const i=held.length;held.push(m);return" ⟦"+(9100000+i)+"⟧ ";
  });
  return{text:protectedText,held};
 }
 function restore(text,held){
  const seen=new Set();
  const out=text.replace(/\s*⟦\s*(910\d{4})\s*⟧\s*/g,(m,id)=>{
   id=Number(id)-9100000;
   if(id<0||id>=held.length||seen.has(id))throw Error("Unstable technical token");
   seen.add(id);return held[id];
  });
  if(seen.size!==held.length)throw Error("Technical token missing");
  return out;
 }
 async function service(text,tl){
  const url=new URL("https://translate.googleapis.com/translate_a/single");
  url.search=new URLSearchParams({client:"gtx",sl:"en",tl,dt:"t",q:text}).toString();
  for(let retry=0;retry<6;retry++){
   try{
    const r=await fetch(url,{signal:AbortSignal.timeout(40000)});
    if(!r.ok)throw Error("Translation HTTP "+r.status);
    const j=await r.json();
    if(!Array.isArray(j[0]))throw Error("Unexpected translation response");
    return j[0].map(a=>a[0]||"").join("");
   }catch(err){if(retry===5)throw err;await new Promise(r=>setTimeout(r,Math.min(1000*2**retry,20000)));}
  }
 }
 async function one(e,tl){
  const t=await service(e.protected.text,tl);
  try{return restore(t.trim(),e.protected.held);}
  catch(err){
   let out="";
   for(const p of e.protected.text.split(/(⟦910\d{4}⟧)/g)){
    const m=p.match(/^⟦(910\d{4})⟧$/);
    if(m)out+=e.protected.held[Number(m[1])-9100000];
    else out+=/[A-Za-z]{2}/.test(p)?await service(p,tl):p;
   }
   fallbackRecords.push({language:tl,source:e.text,translation:out.trim()});
   fs.writeFileSync(fallbackFile,JSON.stringify(fallbackRecords,null,2));
   return out.trim();
  }
 }
 async function batch(entries,tl){
  const input=entries.map((e,i)=>"⟦"+(9000000+i)+"⟧\n"+e.protected.text).join("\n\n");
  const output=await service(input,tl),marks=[...output.matchAll(/⟦\s*(900\d{4})\s*⟧/g)],translated=[];
  if(marks.length===entries.length&&marks.every((m,i)=>Number(m[1])-9000000===i)){
   for(let i=0;i<entries.length;i++){
    const start=marks[i].index+marks[i][0].length,end=i+1<marks.length?marks[i+1].index:output.length;
    try{translated.push(restore(output.slice(start,end).trim(),entries[i].protected.held));}
    catch(err){translated.push(await one(entries[i],tl));}
   }
   return translated;
  }
  for(const e of entries)translated.push(await one(e,tl));
  return translated;
 }
 function prepare(text){
  if(/^\s*\|/.test(text)){
   const cells=[];let current="",code=false;
   for(let i=0;i<text.length;i++){
    const c=text[i];if(c==="`"&&text[i-1]!=="\\")code=!code;
    if(c==="|"&&!code&&text[i-1]!=="\\"){cells.push(current.trim());current="";}else current+=c;
   }cells.push(current.trim());
   return{type:"table",cells};
  }
  const m=text.match(/^(\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+))/);
  return{type:"text",prefix:m?.[0]??"",unit:text.slice(m?.[0].length??0).replace(/\s*\n\s*/g," ").trim()};
 }
 function inlineCodes(s){return s.match(/`[^`]*`/g)??[];}
 function validateSegment(source,target){
  if(JSON.stringify(inlineCodes(source).sort())!==JSON.stringify(inlineCodes(target).sort()))throw Error("Inline code changed: "+source);
  if(/^\s*\|/.test(source)&&prepare(source).cells.length!==prepare(target).cells.length)throw Error("Table columns changed");
  const a=source.match(/^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)/)?.[0],b=target.match(/^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)/)?.[0];
  if(a!==b)throw Error("Structural prefix changed: "+source);
 }
 function slug(h){return h.replace(/^#+\s*/,"").replace(/`/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").toLowerCase().replace(/[^\p{L}\p{N}\p{M}\-_ ]/gu,"").replace(/\s/g,"-");}
 function localizeLinks(b,locale){
  let fence=false;
  return b.split("\n").map(l=>{
   if(/^\s*```/.test(l)){fence=!fence;return l;}if(fence)return l;
   return l.replace(/(href=["']|\]\()\/(?:cn\/|es\/)?([^"')\s#]+)(#[^"')\s]*)?/g,(m,prefix,target,hash)=>
    mdPaths.has("/"+target)||redirects.has("/"+target)?prefix+"/"+locale+"/"+target+(hash||""):m);
  }).join("\n");
 }
 function escape(s,t,b){
  if(s.kind==="meta"){
   const before=b.slice(b.lastIndexOf("\n",s.start)+1,s.start);
   if(before.endsWith('"'))return t.replaceAll("\\","\\\\").replaceAll('"','\\"').replaceAll("\n"," ");
   if(before.endsWith("'"))return t.replaceAll("'","''").replaceAll("\n"," ");
   return JSON.stringify(t.replaceAll("\n"," "));
  }
  if(s.kind==="attr")return t.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("'","&#39;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  return t;
 }
 function write(locale,translated){
  for(const [p,b]of Object.entries(docs)){
   let out=b;
   for(const s of [...segments[p]].reverse()){
    let t=translated[s.text];validateSegment(s.text,t);
    t=escape(s,t,b);
    if(s.kind==="heading"&&slug(s.text)!==slug(t))t='<a id="'+slug(s.text)+'"></a>\n\n'+t;
    out=out.slice(0,s.start)+t+out.slice(s.end);
   }
   out=localizeLinks(out,locale);
   if(locale==="cn")out=out.replace(/^(tag:\s*)["']?(Experimental|Planned|Archived)["']?$/gm,(m,prefix,status)=>prefix+JSON.stringify(terms.cn[status]));
   if(locale==="es")out=out.replace(/^(tag:\s*)["']?(Planned|Archived)["']?$/gm,(m,prefix,status)=>prefix+JSON.stringify(terms.es[status]));
   fs.mkdirSync(path.dirname(locale+"/"+p),{recursive:true});fs.writeFileSync(locale+"/"+p,out);
  }
 }
 function navFor(locale,labels){
  function walk(v,k){
   if(typeof v==="string"){
    if(k==="language")return locale;
    if(k==="group"||k==="tab"||k==="anchor")return labels[v]||v;
    return input.paths.includes(v+".mdx")?locale+"/"+v:v;
   }
   if(Array.isArray(v))return v.map(x=>walk(x,k==="pages"?"page":k));
   return v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,walk(b,a)])):v;
  }return walk(config.navigation.languages.find(l=>l.language==="en"),"");
 }
 async function run(){
  const all=[...new Set(Object.values(segments).flat().map(s=>s.text))];
  for(const [locale,tl]of [["cn","zh-CN"],["es","es"]]){
   const translated={},prepared={},units=new Set();
   for(const text of all){
    let known=input.overrides?.[locale]?.[text]??(locale==="cn"?cnReuse[text]:undefined);
    if(known!==undefined){
     // Retain existing translations only if inline technical literals still match.
     if(JSON.stringify(inlineCodes(text).sort())===JSON.stringify(inlineCodes(known).sort())){translated[text]=known;continue;}
    }
    const p=prepare(text);prepared[text]=p;
    for(const unit of p.type==="table"?p.cells:[p.unit])if(unit)units.add(unit);
   }
   const unitMap={},pending=[];
   for(const text of units){
    const key="v2:"+locale+":"+text;
    if(terms[locale][text]!==undefined)unitMap[text]=terms[locale][text];
    else if(cache[key]!==undefined)unitMap[text]=cache[key];
    else{
     const protectedText=protect(text);
     if(!/[A-Za-z]{2}/.test(protectedText.text.replace(/⟦\d+⟧/g,"")))unitMap[text]=text;
     else pending.push({text,key,protected:protectedText});
    }
   }
   const batches=[];let current=[],len=0;
   for(const p of pending){const n=p.protected.text.length+30;if(current.length&&len+n>3500){batches.push(current);current=[];len=0;}current.push(p);len+=n;}if(current.length)batches.push(current);
   console.log(locale+": "+pending.length+" new units in "+batches.length+" batches");
   for(let i=0;i<batches.length;i++){
    const output=await batch(batches[i],tl);
    batches[i].forEach((e,j)=>{let t=output[j];if(locale==="cn")t=t.replaceAll("埃拉塔","Elata");unitMap[e.text]=t;cache[e.key]=t;});
    fs.writeFileSync(cacheFile,JSON.stringify(cache));console.log(locale+": batch "+(i+1)+"/"+batches.length+" complete");
    await new Promise(r=>setTimeout(r,200));
   }
   for(const [text,p]of Object.entries(prepared)){
    translated[text]=p.type==="table"?p.cells.map((c,i)=>c?" "+unitMap[c]+" ":"").join("|"):p.prefix+(unitMap[p.unit]??"");
   }
   write(locale,translated);console.log("Wrote all "+input.paths.length+" "+locale+" pages");
  }
  config.navigation.languages=[config.navigation.languages.find(l=>l.language==="en"),navFor("cn",input.cnNav),navFor("es",input.esNav)];
  const seen=new Set(config.redirects.map(r=>r.source));
  for(const r of [...config.redirects].filter(r=>!/^\/(?:cn|es)\//.test(r.source))){
   const source="/es"+r.source;
   if(!seen.has(source)){config.redirects.push({source,destination:r.destination.startsWith("/")?"/es"+r.destination:r.destination});seen.add(source);}
  }
  fs.writeFileSync("docs.json",JSON.stringify(config,null,2)+"\n");
  const fences=s=>s.match(/```[\s\S]*?```/g)??[];
  for(const locale of ["cn","es"])for(const [p,b]of Object.entries(docs))if(JSON.stringify(fences(b))!==JSON.stringify(fences(fs.readFileSync(locale+"/"+p,"utf8"))))throw Error("Code changed "+locale+"/"+p);
  console.log("Complete locale coverage with unchanged code blocks.");
 }
 run().catch(err=>{console.error(err);process.exitCode=1;});
})();
