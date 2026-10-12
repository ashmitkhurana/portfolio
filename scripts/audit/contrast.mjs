const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4};
const L=([r,g,b])=>.2126*lin(r)+.7152*lin(g)+.0722*lin(b);
const mix=(fg,a,bg)=>fg.map((v,i)=>v*a+bg[i]*(1-a));
const cr=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return ((x+.05)/(y+.05)).toFixed(2)};
const fg=hex("#f4efe7");
for(const [bgn,bgh] of [["bg","#0d0c0b"],["raised","#151311"],["raised2","#1b1816"]]){
 const bg=hex(bgh);
 console.log(bgn,"fg",cr(fg,bg),"muted .7",cr(mix(fg,.7,bg),bg),"faint .55",cr(mix(fg,.55,bg),bg),"accent",cr(hex("#ff6a00"),bg),"line-strong",cr(mix(fg,.24,bg),bg));
}
