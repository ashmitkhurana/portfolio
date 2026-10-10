import sys,json,numpy as np
sys.path.insert(0,'scripts/curve')
from fit3d import pose_to_world, project, unit
from scipy.ndimage import gaussian_filter1d
rg=json.load(open(sys.argv[1]))["variants"]["phone"]["ruled"]
L=pose_to_world([r["L"] for r in rg]); R=pose_to_world([r["R"] for r in rg]); c=(L+R)/2; h=np.linalg.norm(R-L,axis=1)/2; b=unit(R-L)
def scurv(P):
    p=project(P); d1=np.gradient(p,axis=0); d2=np.gradient(d1,axis=0)
    return (d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0])/np.maximum(np.linalg.norm(d1,axis=1),1e-6)**3
J=np.zeros(len(L))
for P in (L,R):
    k=scurv(P); J=np.maximum(J,np.abs(k-gaussian_filter1d(k,6)))
ds=np.linalg.norm(np.gradient(c,axis=0),axis=1); T=unit(np.gradient(c,axis=0))
kv=np.gradient(T,axis=0)/ds[:,None]; kg=np.abs((kv*b).sum(1))*h
eL=((np.gradient(L,axis=0))*T).sum(1); eR=((np.gradient(R,axis=0))*T).sum(1)
print("folding:",np.where((np.minimum(eL,eR)<0)|(kg>=1))[0].tolist())
for a,z in [(0,215),(215,380),(380,540),(540,800),(800,1100),(1100,1299)]:
    t=a+int(np.argmax(J[a:z])); print("rings %4d-%4d max edge jitter %.4f at %d"%(a,z,J[a:z].max(),t))
