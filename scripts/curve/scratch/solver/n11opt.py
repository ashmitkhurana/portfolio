import sys,json,numpy as np
from scipy.optimize import least_squares
from scipy.ndimage import gaussian_filter1d
sys.path.insert(0,'scripts/curve')
from fit3d import pose_to_world, unit, project, D, VW, VH
# fixed screen path from N2 (same smoothing/straight legs)
rg=json.load(open('docs/ribbon/turns/scratch/N2/pose.json'))["variants"]["phone"]["ruled"]
L=pose_to_world([r["L"] for r in rg]); R=pose_to_world([r["R"] for r in rg]); ss=project((L+R)/2); N=len(ss)
U=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ss,axis=0),axis=1))]
x3=json.load(open('docs/ribbon/turns/real/X3/pose.json'))["variants"]["phone"]["ruled"]
z3=(pose_to_world([r["L"] for r in x3])[:,2]+pose_to_world([r["R"] for r in x3])[:,2])/2
fj=json.load(open('docs/ribbon/turns/real/faces.json'))
E=np.zeros(N)
for sg in fj["segments"]: E[sg["rings"][0]:sg["rings"][1]+1]=1 if sg["face"]=="A" else -1
for a,b in fj["flip_zones"]: E[a:b+1]=0
pairs=[]
for i in range(0,N,3):
    d=np.linalg.norm(ss-ss[i],axis=1)
    for j in np.where((d<50)&(np.arange(N)>i+40))[0][::3]:
        if 855<=i<=880 and 1055<=j<=1095: pairs.append((j,i)); continue   # spec: return in front of back layer
        if abs(z3[i]-z3[j])<8: continue
        pairs.append((i,j) if z3[i]>z3[j] else (j,i))
pairs=np.array(pairs); print("pairs",len(pairs))
TURNS=[("S",115,215,165),("F",340,385,360),("A",472,550,515),("BK",650,790,740),("W",895,1010,960),("TK",1150,1250,1195)]
AKS=[852,1075]
def world(s,z): return np.stack([(s[...,0]-VW/2)*(D-z)/D,(VH/2-s[...,1])*(D-z)/D,z],-1)
def ax(d,al):
    d=np.radians(d); al=np.radians(al); return np.array([np.sin(al)*np.cos(d), -np.sin(al)*np.sin(d), np.cos(al)])
turnmask=np.zeros(N,bool)
for _,a,b,c in TURNS: turnmask[a:b+1]=True
FLIP={4:0,5:0}
def model(p):
    z=np.full(N,np.nan); axes=[]
    for i,(nm,a,b,c) in enumerate(TURNS):
        d,al,z0=p[3*i:3*i+3]; A=ax(d,al); axes.append(A)
        Xc=world(ss[c],z0); k=np.arange(a,b+1); zz=np.full(len(k),z0)
        for _ in range(3):
            X=world(ss[k],zz); zz=z0-(A[0]*(X[:,0]-Xc[0])+A[1]*(X[:,1]-Xc[1]))/A[2]
        if i>=2: zz=zz+p[20+(i-2)]*(U[a:b+1]-U[c])
        z[a:b+1]=zz
    anchors=[(0,260),(100,260)]+[(AKS[i],p[18+i]) for i in range(len(AKS))]+[(1298,-65)]
    # links
    k=0
    while k<N:
        if turnmask[k]: k+=1; continue
        q=k
        while q+1<N and not turnmask[q+1]: q+=1
        kn=[]
        if k-1>=0: kn.append((k-1,z[k-1]))
        kn+=[(r,zz) for r,zz in anchors if k<=r<=q]
        if q+1<N: kn.append((q+1,z[q+1]))
        kr=np.array([t[0] for t in kn]); kz=np.array([t[1] for t in kn])
        z[k:q+1]=np.interp(U[k:q+1],U[kr],kz); k=q+1
    zf=gaussian_filter1d(z,8,mode='nearest')
    c=world(ss,zf); T=unit(gaussian_filter1d(unit(np.gradient(c,axis=0)),3,axis=0,mode='nearest'))
    e1=unit(np.cross(np.array([0,0,1.0]),T)); e2=np.cross(T,e1)
    th=np.zeros(N); twists=[]
    tt=[]
    for i,(nm,a,b,cc) in enumerate(TURNS):
        A=axes[i]; bt=unit(A-(T[a:b+1]@A)[:,None]*T[a:b+1]); tt.append(np.unwrap(np.arctan2((bt*e2[a:b+1]).sum(1),(bt*e1[a:b+1]).sum(1))))
    th[:TURNS[0][1]]=tt[0][0]; th[TURNS[0][1]:TURNS[0][2]+1]=tt[0]
    for i in range(1,len(TURNS)):
        pb=TURNS[i-1][2]; qa=TURNS[i][1]; th0=th[pb]; raw=tt[i][0]; n=np.round((th0-raw)/np.pi); th1=raw+n*np.pi+FLIP.get(i,0)*np.pi
        HID={4:(826,856),5:(1072,1095)}
        if i in HID:
            h0,h1=HID[i]; kk=np.arange(pb+1,qa); x=np.clip((kk-h0)/(h1-h0),0,1); f=x*x*(3-2*x)
        else:
            f=(U[pb+1:qa]-U[pb])/(U[qa]-U[pb])
        th[pb+1:qa]=th0+(th1-th0)*f; th[qa:TURNS[i][2]+1]=tt[i]+n*np.pi+FLIP.get(i,0)*np.pi; twists.append(th1-th0)
    th[TURNS[-1][2]+1:]=th[TURNS[-1][2]]
    b=np.cos(th)[:,None]*e1+np.sin(th)[:,None]*e2
    Nn=unit(np.cross(T,b)); v=unit(np.array([0,0,D])-c); s=(Nn*v).sum(1)
    if s[:100].mean()<0: s=-s
    return zf,s,np.array(twists),b
def res(p):
    zf,s,tw,b=model(p)
    r=[3*np.maximum(0,0.3-E*np.tanh(s/0.15))[E!=0]]
    gap=zf[pairs[:,0]]-zf[pairs[:,1]]; r.append(0.6*np.maximum(0,20-gap))
    vw=np.sqrt(np.clip(1-b[:,2]**2,0,1)); wmin=np.where(turnmask,0.6,0.85); r.append(6*np.maximum(0,wmin-vw))
    dz=np.abs(np.gradient(zf)/np.maximum(np.gradient(U),1e-6)); r.append(40*np.maximum(0,dz-0.6)[~turnmask]); r.append(40*np.asarray(p[20:24]))
    tww=tw-np.array([0,0,0,FLIP[4],FLIP[5]])*np.pi; r.append(60*np.sin(tww)*np.array([1,1,1,0.05,0.05])); r.append(0.5*(zf[:331]-z3[:331]))
    al=p[1:18:3]; r.append(2*(np.maximum(0,35-al)+np.maximum(0,al-62)))
    return np.concatenate(r)
p0=np.array([-95,50,190, -135,55,60, -95,60.2,-103.2, 36.7,40,-107.8, 31.7,37.9,37.9, 40.2,35,0, -42.3,-17.4,0,0,0,0],float)
p1=np.array([-95,50,190, -135,55,60, 180,50,95, -33,40,10, 150,45,7.5, 45,50,0, 15,40,0,0,0,0],float)
p3=np.array([-124.6,72.2,189.5,-146.2,57.3,-15.4,-161.9,62.6,-54.8,-146.5,34.0,66.8,116.1,56.4,-50.9,68.4,63.3,-1.9,-67.0,-9.6,0.4,-0.2,0.5,-0.1],float)
p2=np.array([-125.1,72.3,189.9,-124.3,62.0,-12.6,181.9,71.6,-68.5,-85.0,39.0,45.9,150.0,43.3,-80.4,74.9,62.6,-6.7,-65.8,-23.9,0,0,0,0],float)
rng=np.random.default_rng(3); best=None
starts=[p3,p0,p1,p2]+[np.r_[p1[:6], rng.uniform(-180,180),rng.uniform(40,60),rng.uniform(-60,140), rng.uniform(-180,180),rng.uniform(35,60),rng.uniform(-80,100), rng.uniform(-180,180),rng.uniform(35,60),rng.uniform(-40,110), rng.uniform(-180,180),rng.uniform(35,60),rng.uniform(-40,60), rng.uniform(-40,60),rng.uniform(-30,90), rng.uniform(-0.3,0.3),rng.uniform(-0.3,0.3),rng.uniform(-0.3,0.3),rng.uniform(-0.3,0.3)] for _ in range(7)]
results=[]
for f3 in (0,1):
  for f5 in (0,1):
   FLIP[4]=f3; FLIP[5]=f5; best=None
   for st in starts:
    sol=least_squares(res,st,diff_step=1e-3,max_nfev=300)
    if best is None or sol.cost<best.cost: best=sol
   print('flips',f3,f5,'cost',round(best.cost,1)); results.append((best.cost,f3,f5,best))
results.sort(key=lambda r:r[0]); _,f3,f5,best=results[0]; FLIP[4]=f3; FLIP[5]=f5; print('CHOSEN flips',f3,f5)
p=best.x; print("BEST",round(best.cost,1)); print(np.round(p,1).tolist())
zf,s,tw,b=model(p)
lab=np.where(s>0.15,'A',np.where(s<-0.15,'B','~'))
for sg in fj["segments"]:
    a,b_=sg["rings"]; m=[k for k in range(a,b_+1) if E[k]!=0]; ok=np.mean([(s[k]>0)==(sg["face"]=="A") for k in m]); print(sg["name"],sg["face"],round(ok,2))
gap=zf[pairs[:,0]]-zf[pairs[:,1]]; print("order viol (<20):",(gap<20).sum(),"of",len(gap),"(<5):",(gap<5).sum())
print("twists deg",np.round(np.degrees(tw),1))
dz=np.abs(np.gradient(zf)/np.maximum(np.gradient(U),1e-6)); vw=np.sqrt(np.clip(1-b[:,2]**2,0,1)); print('visible width mean/min links',round(vw[~turnmask].mean(),2),round(vw[~turnmask].min(),2),'turns',round(vw[turnmask].mean(),2),round(vw[turnmask].min(),2)); print("pitches",np.round(p[20:24],3)); print("max link slope",round(dz[~turnmask].max(),2))
json.dump(list(map(float,p)),open(sys.argv[1],"w"))
