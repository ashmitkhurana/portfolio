import { chromium } from "playwright";
const base="http://localhost:4500";
const b=await chromium.launch();
const seen=new Map(), queue=["/","/work","/about","/lab"];
const out={pages:{},bad:[]};
const ctx=await b.newContext({viewport:{width:1280,height:800}});
while(queue.length){
 const u=queue.shift(); if(seen.has(u))continue;
 const p=await ctx.newPage();
 const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,150))}); p.on("pageerror",e=>errs.push("PE "+e.message.slice(0,150)));
 const r=await p.goto(base+u,{waitUntil:"networkidle"}).catch(e=>null);
 const st=r?r.status():0; seen.set(u,st); if(st!==200)out.bad.push([u,st]);
 const info=await p.evaluate(()=>{
  const m=s=>document.querySelector(s)?.getAttribute("content")||document.querySelector(s)?.getAttribute("href")||null;
  const hs=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h=>h.tagName+":"+h.textContent.trim().slice(0,40).replace(/\s+/g," "));
  const lm=[...document.querySelectorAll("header,nav,main,footer,aside,section,[role]")].map(e=>e.tagName.toLowerCase()+(e.getAttribute("role")?"[role="+e.getAttribute("role")+"]":"")+(e.getAttribute("aria-label")?"[label="+e.getAttribute("aria-label")+"]":"")+(e.getAttribute("aria-labelledby")?"[lb]":""));
  const imgs=[...document.querySelectorAll("img")].map(i=>({src:i.currentSrc.slice(-40),alt:i.getAttribute("alt")}));
  const cv=[...document.querySelectorAll("canvas")].map(c=>({aria:c.getAttribute("aria-hidden"),role:c.getAttribute("role"),label:c.getAttribute("aria-label")}));
  const links=[...document.querySelectorAll("a[href]")].map(a=>a.getAttribute("href"));
  const btnNoName=[...document.querySelectorAll("button,a")].filter(e=>!(e.textContent.trim()||e.getAttribute("aria-label")||e.getAttribute("aria-labelledby")||e.querySelector("img[alt]"))).map(e=>e.outerHTML.slice(0,100));
  return {title:document.title,desc:m('meta[name=description]'),canon:m('link[rel=canonical]'),ogimg:m('meta[property="og:image"]'),twimg:m('meta[name="twitter:image"]'),ogtitle:m('meta[property="og:title"]'),robots:m('meta[name=robots]'),jsonld:document.querySelectorAll('script[type="application/ld+json"]').length,hs,lm,imgs,cv,links,btnNoName,
   skip:[...document.querySelectorAll("a")].filter(a=>/skip/i.test(a.textContent)).map(a=>a.getAttribute("href")),
   preload:[...document.querySelectorAll('link[rel=preload]')].map(l=>l.getAttribute("as")+":"+l.getAttribute("href")?.slice(-40)),
   lang:document.documentElement.lang, bodyText:document.body.innerText};
 });
 info.errs=errs; out.pages[u]=info;
 for(const l of info.links){ if(l.startsWith("/")&&!l.startsWith("//")){const q=l.split("#")[0].split("?")[0]||"/"; if(!seen.has(q)&&!queue.includes(q)&&!/\.(pdf|svg|png)$/.test(q))queue.push(q);} else if(l.startsWith("#")){} }
 await p.close();
}
// ext links + hash targets
console.log(JSON.stringify(out,null,1));
await b.close();
