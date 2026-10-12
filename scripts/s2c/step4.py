import json, numpy as np, math
from scipy import ndimage as ndi
S='/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop/'
OUT=S+'result_s2c/'
cl=json.load(open(OUT+'centreline2d.json')); ms=json.load(open(OUT+'measure.json'))
P=np.array(cl['points'],float); N=len(P); A=cl['anchors']
VW,VH=1672,941; FOV=ms['fov']; Hc=ms['Hcap']; W=ms['W']
D=VH/2/math.tan(math.radians(FOV/2))
ANCHOR=dict(left=56.609375,top=192.625,width=1196.921875,height=400.71875)
zw=np.array(ms['z'])*Hc
k=(D-zw)/D
Xw=np.c_[(P[:,0]-VW/2)*k,(VH/2-P[:,1])*k,zw]
def proj(X):
    kk=D/np.maximum(D-X[:,2],1); return np.c_[VW/2+X[:,0]*kk,VH/2-X[:,1]*kk]
def solve(K):
    n=len(K); M=np.zeros((n,n)); r=np.zeros((n,3))
    M[0,0]=1;r[0]=K[0];M[-1,-1]=1;r[-1]=K[-1]
    for s in range(1,n-1): M[s,s-1]=1;M[s,s]=4;M[s,s+1]=1;r[s]=6*K[s]
    return np.linalg.solve(M,r)
def evalspline(C,per=24):
    n=len(C); ext=lambda i: 2*C[0]-C[1] if i<0 else (2*C[-1]-C[-2] if i>=n else C[i])
    out=[];seg=[]
    for s in range(n-1):
        p0,p1,p2,p3=ext(s-1),ext(s),ext(s+1),ext(s+2)
        for j in range(per if s<n-2 else per+1):
            t=j/per
            out.append((p0+4*p1+p2)/6+t*(p2-p0)/2+t*t*(p0-2*p1+p2)/2+t**3*(-p0+3*p1-3*p2+p3)/6); seg.append(s)
    return np.array(out),np.array(seg)
req=[0,N-1]+[A[n] for n in ('A_apex','lower_tip','upper_tip','S_turn','K_junction')]
knots=sorted(set(req+list(range(0,N,75))))
def errors(knots):
    K=Xw[knots]; C=solve(K); sp,seg=evalspline(C); sc=proj(sp)
    err=np.zeros(len(sc)); idx=np.zeros(len(sc),int)
    for s in range(len(knots)-1):
        m=np.where(seg==s)[0]; a=max(0,knots[s]-25); b=min(N,knots[s+1]+25)
        W_=P[a:b]
        d=np.linalg.norm(sc[m][:,None,:]-W_[None,:,:],axis=2); err[m]=d.min(1); idx[m]=a+d.argmin(1)
    return C,sc,err,idx,seg
TARGET_RMS=1.0
for it in range(300):
    C,sc,err,idx,seg=errors(knots)
    rms=math.sqrt((err**2).mean()); mx=err.max()
    if rms<=TARGET_RMS and mx<=4.0: break
    worst=-1;wv=0
    for s in range(len(knots)-1):
        m=np.where(seg==s)[0]
        v=err[m].max()
        if v>wv and knots[s+1]-knots[s]>14: wv=v;worst=s
    if worst<0: break
    m=np.where(seg==worst)[0]; j=m[err[m].argmax()]
    i=int(np.clip(idx[j],knots[worst]+7,knots[worst+1]-7))
    knots=sorted(set(knots+[i]))
print('knots',len(knots),'rms',rms,'max',mx)
Ps=ndi.gaussian_filter1d(P,3,axis=0,mode='nearest')
d1=np.gradient(Ps,axis=0); d2=np.gradient(d1,axis=0)
kap=np.abs(d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0])/np.maximum(np.linalg.norm(d1,axis=1),1e-9)**3
def minr(n,hw=35):
    i=A[n]; w=kap[max(0,i-hw):i+hw]; return float(1/max(w.max(),1e-6)), int(max(0,i-hw)+w.argmax())
rad={n:minr(n) for n in ('A_apex','lower_tip','upper_tip','S_turn')}
print('min radii px',rad)
sxy=proj(C)
pts=[]
mult=W/(68*min(max(VW/1440,0.5),1.4))
kn_names={A[n]:n for n in ('A_apex','lower_tip','upper_tip','S_turn')}
for i,kidx in enumerate(knots):
    p=dict(x=(sxy[i,0]-ANCHOR['left'])/ANCHOR['width'],y=(sxy[i,1]-ANCHOR['top'])/ANCHOR['height'],z=C[i,2]/ANCHOR['height'],twist=0.0,width=mult)
    if kidx in kn_names:
        n=kn_names[kidx]; r=rad[n][0]/W
        if n=='A_apex': p['fold']=dict(angle=math.pi,radius=max(0.55,r)*mult,name='a-apex')
        else: p['hairpin']=dict(name={'lower_tip':'k-lower','upper_tip':'k-upper','S_turn':'s-turn'}[n],radius=round(max(0.4,min(2.0,r)),3))
    pts.append(p)
f=np.array(ms['f']);face=np.array(ms['face']);phi=np.array(ms['phi'])
targets=[dict(arc=int(kidx),f=float(f[kidx]),faceB=int(face[kidx]),phi=float(phi[kidx]),vis=bool(cl['visible'][kidx])) for kidx in knots]
json.dump(dict(points=pts,targets=targets,knots=[int(k_) for k_ in knots],rms=rms,max=mx,W=W,mult=mult,anchor=ANCHOR,fov=FOV,radii_px={k_:v[0] for k_,v in rad.items()}),open(OUT+'pose_input.json','w'))
