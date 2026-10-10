"""Smooth both band edges (world) over a ring window with a gaussian, keep constant half width.
usage: edgesmooth.py IN OUT a b sigma [blend]"""
import sys,json,numpy as np
sys.path.insert(0,'scripts/curve')
from fit3d import pose_to_world, world_to_pose, unit
from scipy.ndimage import gaussian_filter1d
src,dst,a,b,sg=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),float(sys.argv[5]); bl=int(sys.argv[6]) if len(sys.argv)>6 else 15
P=json.load(open(src)); rg=P["variants"]["phone"]["ruled"]
L=pose_to_world([r["L"] for r in rg]); R=pose_to_world([r["R"] for r in rg]); N=len(L)
h=np.linalg.norm(R-L,axis=1)/2
Ls=gaussian_filter1d(L,sg,axis=0,mode='nearest'); Rs=gaussian_filter1d(R,sg,axis=0,mode='nearest')
k=np.arange(N).astype(float); w=np.clip(np.minimum(k-a,b-k)/bl,0,1); w=w*w*(3-2*w)
L2=L*(1-w[:,None])+Ls*w[:,None]; R2=R*(1-w[:,None])+Rs*w[:,None]
c=(L2+R2)/2; bb=unit(R2-L2); L2=c-h[:,None]*bb; R2=c+h[:,None]*bb
Lo=world_to_pose(L2); Ro=world_to_pose(R2)
P["variants"]["phone"]["ruled"]=[{"L":[float(x) for x in Lo[i]],"R":[float(x) for x in Ro[i]]} for i in range(N)]
json.dump(P,open(dst,"w"))
