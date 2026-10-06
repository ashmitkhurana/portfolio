import json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.interpolate import splprep, splev
from scipy.optimize import least_squares
S='/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop/'
OUT=S+'result_s2c/'
rib=np.array(Image.open(S+'ribbon_mask.png').convert('L'))>127
txt=np.array(Image.open(S+'text_mask.png').convert('L'))>127
H,W=rib.shape
dt=ndi.distance_transform_edt(rib)
txtd=ndi.binary_dilation(txt,iterations=2)
wp=json.load(open('waypoints.json'))
P=np.array([[p[0],p[1]] for p in wp['pts']],float)
# centripetal spline through waypoints
d=np.r_[0,np.cumsum(np.sqrt(np.linalg.norm(np.diff(P,axis=0),axis=1)))]
u=d/d[-1]
tck,_=splprep([P[:,0],P[:,1]],u=u,s=0,k=3)
uu=np.linspace(0,1,40000); xy=np.array(splev(uu,tck)).T
seg=np.r_[0,np.cumsum(np.linalg.norm(np.diff(xy,axis=0),axis=1))]
n=int(seg[-1]); s=np.arange(0,n+1,1.0)
xy=np.c_[np.interp(s,seg,xy[:,0]),np.interp(s,seg,xy[:,1])]
def tangents(a):
    t=np.gradient(a,axis=0); return t/np.maximum(np.linalg.norm(t,axis=1,keepdims=True),1e-9)
def samp(m,pts):
    x=np.clip(np.round(pts[:,0]).astype(int),0,W-1); y=np.clip(np.round(pts[:,1]).astype(int),0,H-1); return m[y,x]
def sampf(m,pts):
    return ndi.map_coordinates(m,[pts[:,1],pts[:,0]],order=1,mode='nearest')
def g1(a,sig): return ndi.gaussian_filter1d(a,sig,axis=0,mode='nearest')
# visibility
vis=samp(rib,xy)&~samp(txtd,xy)
vis=ndi.binary_erosion(vis,iterations=3,border_value=1)
def nearest(p): return int(np.argmin(np.linalg.norm(xy-p,axis=1)))
for (ia,ib) in wp.get('forced',[]):
    ja,jb=nearest(P[ia]),nearest(P[ib]); vis[ja+1:jb]=False
# snap
t=tangents(g1(xy,6)); nrm=np.c_[-t[:,1],t[:,0]]
R=wp.get('snap',20)
ds=np.arange(-R,R+1,1.0)
best=np.zeros(len(xy))
for i in range(len(xy)):
    if not vis[i]: best[i]=np.nan; continue
    q=xy[i]+ds[:,None]*nrm[i]
    v=sampf(dt,q)-0.12*np.abs(ds)
    best[i]=ds[np.argmax(v)]
# smooth shifts over visible runs
sh=best.copy()
lab,nl=ndi.label(vis)
for k in range(1,nl+1):
    idx=np.where(lab==k)[0]
    if len(idx)<8: sh[idx]=0; continue
    sh[idx]=ndi.gaussian_filter1d(best[idx],10,mode='nearest')
sh[~vis]=0
for (ia,ib) in wp.get('nosnap',[]):
    ja,jb=nearest(P[ia]),nearest(P[ib]); w=np.ones(len(sh)); w[ja:jb+1]=0
    w=ndi.gaussian_filter1d(w,12,mode='nearest'); w=np.where(np.arange(len(sh)).__ge__(ja)&np.arange(len(sh)).__le__(jb),0,w)
    sh=sh*w
xy2=xy+sh[:,None]*nrm
# hidden run bridging
def curv(a,i,half=12):
    # curvature estimate from smoothed polyline
    a=g1(a,5); t=np.gradient(a,axis=0); tt=np.gradient(t,axis=0)
    c=(t[:,0]*tt[:,1]-t[:,1]*tt[:,0])/np.maximum(np.linalg.norm(t,axis=1),1e-9)**3
    return c[i]
out=xy2.copy()
lab_h,nh=ndi.label(~vis)
rep=[]
for k in range(1,nh+1):
    idx=np.where(lab_h==k)[0]; i0,i1=idx[0]-1,idx[-1]+1
    if i0<0 or i1>=len(xy2) or len(idx)<3: continue
    # use ends inset by 6 px for tangent
    a0=i0-12; a1=i1+12
    if a0<0 or a1>=len(xy2): continue
    P0=xy2[i0]; P3=xy2[i1]
    T0=xy2[i0]-xy2[a0]; T0/=np.linalg.norm(T0)
    T1=xy2[a1]-xy2[i1]; T1/=np.linalg.norm(T1)
    sm=g1(xy2,6)
    k0=curv(xy2,i0-8); k1=curv(xy2,i1+8)
    k0=np.clip(k0,-0.015,0.015); k1=np.clip(k1,-0.015,0.015)
    chord=np.linalg.norm(P3-P0)
    N0=np.array([-T0[1],T0[0]]); N1=np.array([-T1[1],T1[0]])
    def res(ab):
        a,b=ab
        P1=P0+a*T0; P2=P3-b*T1
        d=P2-P1
        return [np.dot(d,N0)-1.5*k0*a*a, np.dot(d,N1)+1.5*k1*b*b, 0.02*(a-chord/3), 0.02*(b-chord/3)]
    sol=least_squares(res,[max(chord/3,2),max(chord/3,2)],bounds=([1,1],[chord*1.5+30,chord*1.5+30]))
    a,b=sol.x
    P1=P0+a*T0; P2=P3-b*T1
    tt=np.linspace(0,1,400)[:,None]
    B=(1-tt)**3*P0+3*(1-tt)**2*tt*P1+3*(1-tt)*tt**2*P2+tt**3*P3
    sg=np.r_[0,np.cumsum(np.linalg.norm(np.diff(B,axis=0),axis=1))]
    m=len(idx)+2
    ss=np.linspace(0,sg[-1],m)
    # parameter-by-arc (path length differs from index span; we resample whole path later)
    rep.append((i0,i1,B,dict(a=float(a),b=float(b),k0=float(k0),k1=float(k1),res=float(np.linalg.norm(sol.fun[:2])))))
# rebuild path: concatenate segments
pieces=[]; cur=0
for (i0,i1,B,info) in rep:
    pieces.append(xy2[cur:i0+1]); pieces.append(B[1:-1]); cur=i1
pieces.append(xy2[cur:])
path=np.vstack(pieces)
seg=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))]
s=np.arange(0,seg[-1],1.0)
path=np.c_[np.interp(s,seg,path[:,0]),np.interp(s,seg,path[:,1])]
# track hidden flag
hid=np.zeros(len(s),bool)
cur=0
# recompute visibility on final path
vis_f=samp(rib,path)&~samp(txtd,path)
# smoothing sigma 3 with end padding by linear extrapolation
pad=15
e0=path[0]-(path[min(8,len(path)-1)]-path[0])/8*np.arange(pad,0,-1)[:,None]
e1=path[-1]+(path[-1]-path[-9])/8*np.arange(1,pad+1)[:,None]
pp=np.vstack([e0,path,e1]); pp=ndi.gaussian_filter1d(pp,3,axis=0,mode='nearest')[pad:-pad]
seg=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pp,axis=0),axis=1))]
s=np.arange(0,seg[-1],1.0)
pp=np.c_[np.interp(s,seg,pp[:,0]),np.interp(s,seg,pp[:,1])]
vis_f=samp(rib,pp)&~samp(txtd,pp)
# T labels from graph branches
g=json.load(open(S+'graph.json'))
bp=[];bl=[]
for b in g['branches']:
    for q in b['points']: bp.append(q); bl.append(int(b['T'][1:]))
from scipy.spatial import cKDTree
kd=cKDTree(np.array(bp)); _,ii=kd.query(pp); Tl=np.array(bl)[ii]
anch={n:int(np.argmin(np.linalg.norm(pp-P[int(i)],axis=1))) for i,n in wp['names'].items()}
json.dump(dict(anchors=anch,points=[[round(float(a),2),round(float(b),2)] for a,b in pp],visible=[bool(v) for v in vis_f],T=[int(t) for t in Tl],bridges=[r[3] for r in rep],waypoints=wp['pts'],names=wp.get('names')),open(OUT+'centreline2d.json','w'))
# overlay
im=Image.open('/Users/ashmitkhurana/Development/studio/portfolio/public/lab/ref/hero-desktop.webp').convert('RGB')
Z=2
im=im.resize((W*Z,H*Z),Image.LANCZOS); dr=ImageDraw.Draw(im)
cols=[(255,0,0),(0,255,0),(0,160,255),(255,255,0),(255,0,255),(0,255,255),(255,128,0),(160,255,0),(255,255,255)]
for i in range(len(pp)-1):
    c=cols[(Tl[i]-1)%9]
    if not vis_f[i]: c=(0,0,0)
    dr.line([tuple(pp[i]*Z),tuple(pp[i+1]*Z)],fill=c,width=3 if vis_f[i] else 2)
for i in range(0,len(pp)-30,60):
    a=pp[i]; b=pp[i+12]; v=(b-a)/np.linalg.norm(b-a); nv=np.array([-v[1],v[0]])
    tip=b; l=b-v*10+nv*5; r=b-v*10-nv*5
    dr.polygon([tuple(tip*Z),tuple(l*Z),tuple(r*Z)],fill=(255,255,255))
for j,p in enumerate(P): dr.ellipse([p[0]*Z-4,p[1]*Z-4,p[0]*Z+4,p[1]*Z+4],outline=(255,255,255)); dr.text((p[0]*Z+5,p[1]*Z-5),str(j),fill=(255,255,255))
dr.ellipse([pp[0][0]*Z-9,pp[0][1]*Z-9,pp[0][0]*Z+9,pp[0][1]*Z+9],outline=(0,255,0),width=3)
im.save(OUT+'centreline_overlay.png')
im.crop((int(380*Z),int(40*Z),W*Z,H*Z)).save(OUT+'_cl_crop.png')
print(len(pp),'samples; bridges',[ (r[0],r[1],round(r[3]['res'],2)) for r in rep])
