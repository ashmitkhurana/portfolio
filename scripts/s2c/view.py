import sys,json
from PIL import Image,ImageDraw
x0,y0,x1,y1,Z=map(int,sys.argv[1:6]); out=sys.argv[6]
cl=json.load(open('/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop/result_s2c/centreline2d.json'))
im=Image.open('/Users/ashmitkhurana/Development/studio/portfolio/public/lab/ref/hero-desktop.webp').convert('RGB').crop((x0,y0,x1,y1)).resize(((x1-x0)*Z,(y1-y0)*Z),Image.LANCZOS)
d=ImageDraw.Draw(im)
P=cl['points'];V=cl['visible']
for i in range(len(P)-1):
    a=P[i];b=P[i+1]
    if not(x0-5<a[0]<x1+5 and y0-5<a[1]<y1+5): continue
    c=(0,255,0) if V[i] else (255,0,255)
    d.line([((a[0]-x0)*Z,(a[1]-y0)*Z),((b[0]-x0)*Z,(b[1]-y0)*Z)],fill=c,width=2)
    if i%50==0: d.text(((a[0]-x0)*Z+3,(a[1]-y0)*Z+3),str(i),fill=(255,255,255))
for j,p in enumerate(cl['waypoints']):
    if x0<p[0]<x1 and y0<p[1]<y1:
        d.ellipse([(p[0]-x0)*Z-3,(p[1]-y0)*Z-3,(p[0]-x0)*Z+3,(p[1]-y0)*Z+3],outline=(0,255,255)); d.text(((p[0]-x0)*Z+4,(p[1]-y0)*Z-10),'w%d'%j,fill=(0,255,255))
im.save(out)
