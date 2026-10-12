import sys, numpy as np
from PIL import Image, ImageDraw
R="/Users/ashmitkhurana/Development/Personal/portfolio/docs/ribbon/turns/real/"
def boxes(run):
    lines=open(R+run+"/diag/rings.csv").read().strip().split('\n'); c={k:i for i,k in enumerate(lines[0].split(','))}
    A=np.array([[float(x) for x in l.split(',')] for l in lines[1:]])
    pr=A[:,c['pose_ring']]; out={}
    Z={"farleft":(345,410),"apex":(480,560),"junction":(660,720),"bottomK":(648,772),"topK":(1089,1264),"tip":(1150,1230),"wrap":(860,1066)}
    for k,(a,b) in Z.items():
        m=(pr>=a)&(pr<=b)
        xs=np.r_[A[m,c['sx_L']],A[m,c['sx_R']],A[m,c['sx_c']]]*2; ys=np.r_[A[m,c['sy_L']],A[m,c['sy_R']],A[m,c['sy_c']]]*2
        out[k]=(xs.min()-30,ys.min()-30,xs.max()+30,ys.max()+30)
    return out
def sheet(runs, cols, out, ref, maxw=520, maxh=560, ztarget=3, labels=None):
    B=boxes(ref)
    cells={}
    for run in runs:
        im=Image.open(R+run+"/render/ribbon.png").convert("RGB")
        for k in cols:
            x0,y0,x1,y1=[int(round(v)) for v in B[k]]
            x0=max(x0,0);y0=max(y0,0);x1=min(x1,im.width);y1=min(y1,im.height)
            c=im.crop((x0,y0,x1,y1)); z=min(ztarget,maxw/c.width,maxh/c.height)
            cells[(run,k)]=c.resize((max(1,int(c.width*z)),max(1,int(c.height*z))),Image.LANCZOS)
    cw=[max(cells[(r,k)].width for r in runs) for k in cols]; rh=[max(cells[(r,k)].height for k in cols) for r in runs]
    pad=22; W=sum(cw)+8*len(cols); H=sum(rh)+(pad+4)*len(runs)
    S=Image.new("RGB",(W,H),(40,40,40)); d=ImageDraw.Draw(S)
    y=0
    for ri,r in enumerate(runs):
        x=0
        for ci,k in enumerate(cols):
            d.text((x+4,y+4),"%s / %s"%(r,k),fill=(255,255,255)); S.paste(cells[(r,k)],(x,y+pad)); x+=cw[ci]+8
        y+=rh[ri]+pad+4
    S.save(out); print(out,S.size)
if __name__=="__main__":
    out=sys.argv[1]; cols=sys.argv[2].split(','); ref=sys.argv[3]; runs=sys.argv[4:]
    sheet(runs,cols,out,ref)
