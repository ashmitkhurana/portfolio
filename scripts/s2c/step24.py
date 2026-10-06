import json, numpy as np, math, sys
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator
S='/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop/'
OUT=S+'result_s2c/'
cl=json.load(open(OUT+'centreline2d.json'))
P=np.array(cl['points'],float); vis=np.array(cl['visible'],bool); N=len(P)
A=cl['anchors']
rib=np.array(Image.open(S+'ribbon_mask.png').convert('L'))>127
txt=np.array(Image.open(S+'text_mask.png').convert('L'))>127
cls=np.array(Image.open(S+'shading_classes.png').convert('RGB'))
dtm=ndi.distance_transform_edt(rib)
VW,VH=1672,941; FOV=26.4
D=VH/2/math.tan(math.radians(FOV/2))
Hcap=180.0
ANCHOR=dict(left=56.609375,top=192.625,width=1196.921875,height=400.71875)
s_arc=np.arange(N,dtype=float)  # 1 px spacing
# ---- z profile (cap heights), anchored at named samples
zH={'T1_hidden_end':-0.6,'A_left_leg':-0.55,'A_apex':-0.4,'A_right_leg_top':-0.3,'A_right_leg_mid':0.10,'A_right_leg_low':0.10,
 'lower_out':-0.12,'lower_tip':-0.35,'lower_back':-0.04,'K_junction':0.05,'upper_out':-0.30,'upper_tip':-0.6,'upper_back':-0.40,
 'ret_hidden_start':-0.13,'crossbar_right':0.0,'crossbar':0.0,'drop_R':0.10,'S_left':0.35,'S_mid':0.45,'S_turn':0.60,'tail_a':0.85,'tail_b':1.4}
names=sorted(zH,key=lambda n:A[n]); xs=[A[n] for n in names]; zs=[zH[n] for n in names]
# extend to ends
xs=[0]+xs[1:]+[N-1] if xs[0]==0 else [0]+xs+[N-1]
zs=[zs[0]]+zs[1:] if xs[0]==0 and A[names[0]]==0 else [zs[0]]+zs
xs2=[];zs2=[]
for x,z in zip(xs,zs):
    if xs2 and x<=xs2[-1]: continue
    xs2.append(x);zs2.append(z)
if xs2[-1]<N-1: xs2.append(N-1); zs2.append(zs2[-1]+0.1)
zprof=PchipInterpolator(xs2,zs2)(s_arc)   # in H
zw=zprof*Hcap
k=(D)/np.maximum(D-zw,1)      # perspective scale at each sample
# ---- apparent width
def smp(a,p):
    return ndi.map_coordinates(a.astype(float),[p[:,1],p[:,0]],order=1,mode='nearest')
wapp=2*smp(dtm,P)
# unreliable spans
Wraw=np.percentile(wapp[vis]/k[vis],92)
def arc_near(mask,dist):
    d=ndi.distance_transform_edt(~mask)
    return d<=dist
def compute(Wt,rel_mult):
    bad=np.zeros(N,bool)
    # occlusion boundaries (vis transitions) and forced hidden
    edge=np.zeros(N,bool); tr=np.where(np.diff(vis.astype(int))!=0)[0]; edge[tr]=True
    bad|=arc_near(edge,rel_mult*Wt)|~vis
    # turn tips + apex + junction
    tips=np.zeros(N,bool)
    for n in ('lower_tip','upper_tip','S_turn','A_apex','K_junction'): tips[A[n]]=True
    bad|=arc_near(tips,rel_mult*Wt)
    # crossings: samples whose screen position is within 0.7 W of a non-neighbour (arc gap > 3W)
    from scipy.spatial import cKDTree
    kd=cKDTree(P); pairs=kd.query_pairs(0.7*Wt)
    cr=np.zeros(N,bool)
    for i,j in pairs:
        if abs(i-j)>3*Wt: cr[i]=cr[j]=True
    bad|=arc_near(cr,rel_mult*Wt)
    return bad,cr
W=Wraw
for it in range(2):
    mult=1.5
    bad,cr=compute(W,mult)
    cov=1-bad.mean()
    if cov<0.2: mult=0.75; bad,cr=compute(W,mult); cov=1-bad.mean()
    W=np.percentile(wapp[~bad]/k[~bad],92) if (~bad).sum()>50 else Wraw
print('W raw',Wraw,'W',W,'reliable coverage',cov,'mult',mult)
# interpolate widths across unreliable spans (in W-normalised units)
f=np.clip(wapp/(W*k),0.05,1.0)
good=~bad
fi=np.interp(s_arc,s_arc[good],f[good]) if good.sum()>2 else f
fi=ndi.gaussian_filter1d(fi,8,mode='nearest')
# ---- face class along path
cc=np.zeros(N)
for i in range(N):
    x=int(round(P[i,0])); y=int(round(P[i,1]))
    if not(0<=x<VW and 0<=y<VH): cc[i]=np.nan; continue
    blk=cls[max(0,y-4):y+5,max(0,x-4):x+5].reshape(-1,3)
    dark=((blk[:,2]==255)&(blk[:,0]==40)).sum(); lit=((blk[:,0]==255)).sum()
    cc[i]=np.nan if dark+lit==0 else (1.0 if dark>lit else 0.0)
cc[~vis]=np.nan
known=~np.isnan(cc)
cs=np.where(known,cc,0.0)
num=ndi.uniform_filter1d(cs,21,mode='nearest')*21; den=ndi.uniform_filter1d(known.astype(float),21,mode='nearest')*21
vote=np.where(den>3,num/np.maximum(den,1e-9),np.nan)
face=np.where(np.isnan(vote),np.nan,(vote>0.5).astype(float))  # 1 = face B
fk=~np.isnan(face)
faceF=np.interp(s_arc,s_arc[fk],face[fk]); faceF=(faceF>0.5).astype(float)
# roll phi: A: acos(f), B: pi - acos(f), continuity: single sign; smooth
a=np.arccos(np.clip(fi,0,1))
phi=np.where(faceF>0.5,math.pi-a,a)
phi=ndi.gaussian_filter1d(phi,8,mode='nearest')
Wloc=W*k
json.dump(dict(W=float(W),Wraw=float(Wraw),coverage=float(cov),mult=mult,Hcap=Hcap,fov=FOV,z=[float(v) for v in zprof],f=[float(v) for v in fi],face=[int(v) for v in faceF],phi=[float(v) for v in phi],wapp=[float(v) for v in wapp],reliable=[bool(v) for v in good]),open(OUT+'measure.json','w'))
# overlay: roll/face strip
print('face B fraction',faceF.mean(),'f range',fi.min(),fi.max())
