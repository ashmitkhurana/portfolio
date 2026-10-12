import { chromium } from "playwright";
const b=await chromium.launch();
for(const w of [320,375,390,768,1024,1512,1920,2560]) for(const r of ["/","/work","/about"]){
 const p=await b.newPage({viewport:{width:w,height:900}});
 await p.goto("http://localhost:4500"+r,{waitUntil:"networkidle"}); await p.waitForTimeout(800);
 const res=await p.evaluate(()=>{const W=document.documentElement.clientWidth;const sw=document.documentElement.scrollWidth;const bad=[];
  for(const e of document.querySelectorAll("body *")){const cs=getComputedStyle(e);if(cs.display==="none"||cs.visibility==="hidden")continue;const rc=e.getBoundingClientRect();if(rc.width&&(rc.right>W+1||rc.left<-1)){if(e.closest("[hidden],[inert]")||e.closest(".mobile-menu"))continue;bad.push(e.tagName+"."+(e.className?.toString?.().slice(0,40)||"")+" L"+Math.round(rc.left)+" R"+Math.round(rc.right))}}
  return {W,sw,bad:bad.slice(0,5),n:bad.length}});
 console.log(w,r,res.sw>res.W?"OVERFLOW":"ok",JSON.stringify(res));
 await p.close();}
await b.close();
