import numpy as np, cv2, json, colorsys
from PIL import Image
from scipy import ndimage as ndi
from skimage.feature import canny
from skimage.morphology import skeletonize

ROOT='/Users/ashmitkhurana/Development/Personal/portfolio/'
im=np.array(Image.open(ROOT+'docs/ribbon/ref/ak-signature-cutout.webp').convert('RGBA')).astype(np.float32)
H,W=im.shape[:2]
boxes={'T1':(86,776,364,1043),'T3':(568,635,836,906),'T5':(19,1032,240,1215),
       'T7':(467,1087,852,1230),'T9':(463,1245,842,1599)}
PAD=20; SC=3; MAXN=25; MINLEN=25
OUT=ROOT+'docs/ribbon/turns/rims/'
NB=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

def chains(edge):
    sk=skeletonize(edge)
    nb=ndi.convolve(sk.astype(int),np.ones((3,3),int),mode='constant')-1
    junc=sk&(nb>2)
    jd=ndi.binary_dilation(junc,np.ones((3,3)))
    rest=sk&~jd
    lab,n=ndi.label(rest,np.ones((3,3)))
    res=[]
    for i in range(1,n+1):
        ys,xs=np.nonzero(lab==i)
        if len(ys)<15: continue
        pts=set(zip(ys.tolist(),xs.tolist()))
        def nbrs(p): return [(p[0]+a,p[1]+b) for a,b in NB if (p[0]+a,p[1]+b) in pts]
        ends=[p for p in pts if len(nbrs(p))==1]
        start=ends[0] if ends else next(iter(pts))
        seq=[start]; seen={start}
        cur=start
        while True:
            c=[q for q in nbrs(cur) if q not in seen]
            if not c: break
            # prefer 4-neighbours
            c.sort(key=lambda q:abs(q[0]-cur[0])+abs(q[1]-cur[1]))
            cur=c[0]; seen.add(cur); seq.append(cur)
        res.append(np.array([(x,y) for y,x in seq],float))
    return res

def plen(p): return float(np.sum(np.hypot(*np.diff(p,axis=0).T))) if len(p)>1 else 0

def simplify(p):
    a=cv2.approxPolyDP(p.astype(np.float32).reshape(-1,1,2),1.5,False).reshape(-1,2)
    return a

allc={}
for name,(x0,y0,x1,y1) in boxes.items():
    X0,Y0,X1,Y1=max(0,x0-PAD),max(0,y0-PAD),min(W,x1+PAD),min(H,y1+PAD)
    c=im[Y0:Y1,X0:X1]; rgb=c[...,:3]; a=c[...,3]
    mask=a>=128
    # fill outside with nearest inside colour to avoid silhouette edges
    idx=ndi.distance_transform_edt(~mask,return_distances=False,return_indices=True)
    rgbf=rgb[idx[0],idx[1]]
    L=0.299*rgbf[...,0]+0.587*rgbf[...,1]+0.114*rgbf[...,2]
    HL=np.maximum(rgbf[...,0],rgbf[...,1])
    DK=255-HL
    bnd=mask&~ndi.binary_erosion(mask)
    near=ndi.binary_dilation(bnd,iterations=4)
    if mask.sum()==0: continue
    cands=[]
    for mapn,m in (('L',L),('HL',HL)):
        for s in (1.5,3):
            e=canny(m,sigma=s,low_threshold=0.65,high_threshold=0.87,use_quantiles=True)
            e&=~near
            e&=ndi.binary_dilation(mask,iterations=1)
            for ch in chains(e):
                if plen(ch)>=MINLEN: cands.append((plen(ch),ch,f'{mapn}{s}'))
    cands.sort(key=lambda t:-t[0])
    kept=[]; occ=np.zeros(L.shape,bool)  # coverage of kept curves (dilated)
    for l,ch,src in cands:
        xi=np.clip(ch[:,0].round().astype(int),0,L.shape[1]-1); yi=np.clip(ch[:,1].round().astype(int),0,L.shape[0]-1)
        if occ[yi,xi].mean()>0.6: continue
        kept.append((l,ch,src))
        t=np.zeros(L.shape,np.uint8)
        cv2.polylines(t,[ch.round().astype(np.int32).reshape(-1,1,2)],False,1,1)
        occ|=ndi.binary_dilation(t>0,iterations=3)
        if len(kept)>=MAXN: break
    # render
    bg=np.full(rgb.shape,45,np.float32)
    comp=(rgb*(a[...,None]/255)+bg*(1-a[...,None]/255)).clip(0,255).astype(np.uint8)
    big=cv2.resize(comp,None,fx=SC,fy=SC,interpolation=cv2.INTER_CUBIC)
    Image.fromarray(big).save(OUT+f'{name}_crop.png')
    cv=big.copy()
    cs,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
    for k in cs:
        cv2.polylines(cv,[(k.astype(np.float32)*SC+SC/2).astype(np.int32)],True,(150,150,150),1,cv2.LINE_AA)
    for i,(l,ch,src) in enumerate(kept):
        cid=f'{name}-{i+1:02d}'
        simp=simplify(ch)
        allc[cid]=[[round(float(x+X0),1),round(float(y+Y0),1)] for x,y in simp]
        r,g,b=colorsys.hsv_to_rgb((i*0.618)%1,1,1); col=(int(r*255),int(g*255),int(b*255))
        pp=((simp*SC)+SC/2).astype(np.int32)
        cv2.polylines(cv,[pp.reshape(-1,1,2)],False,col,2,cv2.LINE_AA)
        mid=ch[len(ch)//2]; mp=(int(mid[0]*SC+SC/2)+4,int(mid[1]*SC+SC/2)-4)
        cv2.putText(cv,cid,mp,cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,0,0),3,cv2.LINE_AA)
        cv2.putText(cv,cid,mp,cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),1,cv2.LINE_AA)
    Image.fromarray(cv).save(OUT+f'{name}_candidates.png')
    print(name,len(kept),[f'{int(l)}{s}' for l,_,s in kept][:8])
json.dump(allc,open(OUT+'candidates.json','w'))
