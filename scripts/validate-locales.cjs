(function qaProgram() {
 const fs=require("node:fs"),path=require("node:path"),{createRequire}=require("node:module");
 const dependencyDir=path.join(process.env.RUNNER_TEMP,"elata-docs-qa");
 const req=createRequire(path.join(dependencyDir,"package.json"));
 async function run(){
  const {compile,createProcessor}=await import(req.resolve("@mdx-js/mdx"));
  const remarkGfm=(await import(req.resolve("remark-gfm"))).default;
  const Slugger=(await import(req.resolve("github-slugger"))).default;
  const yaml=req("yaml");
  function walkFiles(dir=""){
   return fs.readdirSync(dir||".",{withFileTypes:true}).flatMap(x=>{
    const p=path.join(dir,x.name);
    if(x.isDirectory()){
     if(["cn","es","node_modules",".git",".github","scripts"].includes(x.name)&&!dir)return[];
     return walkFiles(p);
    }
    return x.isFile()&&p.endsWith(".mdx")?[p.replaceAll("\\","/")]:[];
   });
  }
  const enPaths=walkFiles();
  const processor=createProcessor({remarkPlugins:[remarkGfm]});
  const trees={},headings={},errors=[],baseline=[];
  const report={englishPages:enPaths.length,cnPages:0,esPages:0,compiled:0,codeParity:0,componentParity:0,localeLinkLeaks:[],brokenLinks:[],invalidAnchors:[],baselineIssues:[]};
  function source(p){return fs.readFileSync(p,"utf8");}
  function body(s,p){
   const m=s.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
   if(!m)throw Error("Missing front matter "+p);
   const meta=yaml.parse(m[1]);if(!meta.title||!meta.description)throw Error("Incomplete metadata "+p);
   return s.slice(m[0].length);
  }
  function visit(n,fn){fn(n);for(const c of n.children??[])visit(c,fn);}
  function text(n){return n.value??(n.children??[]).map(text).join("");}
  function attrs(n){return Object.fromEntries((n.attributes??[]).filter(a=>a.type==="mdxJsxAttribute"&&typeof a.value==="string").map(a=>[a.name,a.value]));}
  function components(tree){const a=[];visit(tree,n=>{if(/^mdxJsx/.test(n.type)&&n.name&&n.name!=="a")a.push(n.name);});return a;}
  function blocks(s){return s.match(/```[\s\S]*?```/g)??[];}
  for(const en of enPaths){
   for(const locale of ["","cn","es"]){
    const p=locale?locale+"/"+en:en;
    if(!fs.existsSync(p)){errors.push("Missing translation "+p);continue;}
    if(locale)report[locale+"Pages"]++;
    const s=source(p);
    try {
     const b=body(s,p);
     await compile({path:p,value:b},{remarkPlugins:[remarkGfm]});
     const tree=processor.parse(b);trees[p]=tree;report.compiled++;
     const ids=new Set(),slugger=new Slugger();
     visit(tree,n=>{
      if(n.type==="heading")ids.add(slugger.slug(text(n)));
      if(/^mdxJsx/.test(n.type)){const a=attrs(n);if(a.id)ids.add(a.id);}
     });
     headings[p]=ids;
     if(locale&&JSON.stringify(blocks(s))!==JSON.stringify(blocks(source(en))))errors.push("Code mismatch "+p);
     else if(locale)report.codeParity++;
     if(locale&&trees[en]&&JSON.stringify(components(tree))!==JSON.stringify(components(trees[en])))errors.push("Components mismatch "+p);
     else if(locale)report.componentParity++;
     if(locale&&/ELATA(?:ZX|SEG)\d|§\d+§|中文翻译正在准备中|本页英文版本已更新/.test(b))errors.push("Translation placeholder "+p);
    }catch(err){const item={path:p,error:String(err)};if(locale)errors.push(item);else baseline.push(item);}
   }
  }
  const config=JSON.parse(source("docs.json")),redirects=new Map(config.redirects.map(r=>[r.source,r.destination]));
  const docSet=new Set(Object.keys(trees).map(p=>"/"+p.slice(0,-4)));
  function resolve(u){
   let seen=new Set();
   while(redirects.has(u)&&!seen.has(u)){seen.add(u);u=redirects.get(u);}
   return u;
  }
  const nav={};function visitNav(v,locale){
   if(Array.isArray(v)){for(const a of v)visitNav(a,locale);}
   else if(v&&typeof v==="object"){
    const lang=v.language??locale;
    for(const [k,val]of Object.entries(v)){
     if(k==="pages")for(const p of val)if(typeof p==="string"){
      nav[lang]??=new Set();nav[lang].add(p);
      if(!fs.existsSync(p+".mdx"))errors.push("Missing navigation "+p);
      if(lang!=="en"&&!p.startsWith(lang+"/"))errors.push("Wrong navigation locale "+p);
     }
     visitNav(val,lang);
    }
   }
  }
  visitNav(config.navigation);
  const baseNav=[...(nav.en??[])].sort();
  for(const locale of ["cn","es"]){const local=[...(nav[locale]??[])].map(p=>p.replace(new RegExp("^"+locale+"/"),"")).sort();if(JSON.stringify(local)!==JSON.stringify(baseNav))errors.push("Navigation parity "+locale);}
  for(const [p,tree]of Object.entries(trees)){
   const locale=p.startsWith("cn/")?"cn":p.startsWith("es/")?"es":null;
   const urls=[];visit(tree,n=>{
    if(n.type==="link"||n.type==="image"||n.type==="definition")urls.push(n.url);
    if(/^mdxJsx/.test(n.type)){const a=attrs(n);if(a.href)urls.push(a.href);if(a.src)urls.push(a.src);}
   });
   for(const url of urls){
    if(!url.startsWith("/")&&!url.startsWith("#"))continue;
    const [pathname,hash]=url.split("#");
    if(!pathname){if(hash&&!headings[p]?.has(decodeURIComponent(hash)))report.invalidAnchors.push({page:p,url});continue;}
    const clean=pathname.split("?")[0],resolved=resolve(clean);
    if(!docSet.has(resolved)){if(!fs.existsSync(clean.slice(1)))report.brokenLinks.push({page:p,url});continue;}
    if(locale&&!resolved.startsWith("/"+locale+"/"))report.localeLinkLeaks.push({page:p,url});
    if(hash&&!headings[resolved.slice(1)+".mdx"]?.has(decodeURIComponent(hash)))report.invalidAnchors.push({page:p,url});
   }
  }
  report.baselineIssues=baseline;
  report.errors=errors;
  fs.writeFileSync("scripts/localization-qa.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if(errors.length)process.exitCode=1;
 }
 run().catch(err=>{console.error(err);process.exitCode=1;});
})();
