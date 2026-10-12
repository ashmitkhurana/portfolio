import { chromium, devices } from "playwright";
const b=await chromium.launch({args:["--enable-unsafe-swiftshader"]});
for (const [name,opts] of [["desktop",{viewport:{width:1350,height:940}}],["mobile",{...devices["Pixel 7"]}]]){
 for (const route of ["/","/work","/about","/work/sleepara"]){
  const ctx=await b.newContext(opts); const p=await ctx.newPage();
  const cdp=await ctx.newCDPSession(p);
  if(name==="mobile"){await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});await cdp.send("Network.enable");await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:1.6e6/8,uploadThroughput:750e3/8});}
  await p.addInitScript(()=>{window.__m={lcp:0,lcpEl:"",cls:0,tbt:0,fcp:0};
   new PerformanceObserver(l=>{for(const e of l.getEntries()){window.__m.lcp=e.startTime;window.__m.lcpEl=(e.element?.tagName||"")+" "+(e.element?.className?.toString?.().slice(0,40)||"")+" "+(e.url||"").slice(-40)}}).observe({type:"largest-contentful-paint",buffered:true});
   new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__m.cls+=e.value}).observe({type:"layout-shift",buffered:true});
   new PerformanceObserver(l=>{for(const e of l.getEntries()){if(e.name==="first-contentful-paint")window.__m.fcp=e.startTime}}).observe({type:"paint",buffered:true});
   new PerformanceObserver(l=>{for(const e of l.getEntries())window.__m.tbt+=Math.max(0,e.duration-50)}).observe({type:"longtask",buffered:true});});
  let bytes=0,reqs=0; p.on("response",async r=>{reqs++;try{const h=r.headers()["content-length"];bytes+=h?+h:0}catch{}});
  await p.goto("http://localhost:4500"+route,{waitUntil:"load"}); await p.waitForTimeout(4000);
  const m=await p.evaluate(()=>window.__m);
  console.log(name,route,JSON.stringify({lcp:Math.round(m.lcp),fcp:Math.round(m.fcp),cls:+m.cls.toFixed(3),tbt:Math.round(m.tbt),lcpEl:m.lcpEl,reqs,kb:Math.round(bytes/1024)}));
  await ctx.close();
 }
}
await b.close();
