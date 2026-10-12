import sys, json, numpy as np
sys.path.insert(0, "/Users/ashmitkhurana/Development/Personal/portfolio/scripts/curve")
from fit3d import pose_to_world, Basis, unit, project
from scipy.interpolate import BSpline
R="/Users/ashmitkhurana/Development/Personal/portfolio/docs/ribbon/turns/real/"
REG=[("tail",0,151),("S",152,203),("sweep",204,344),("farleft",345,387),("leftleg",388,483),("apex",484,548),("rightleg",549,647),("bottomK",648,772),("crossbar",773,859),("wrap",860,1014),("return",1015,1088),("topK",1089,1264),("end",1265,1298)]
CR=[376,516,1188]; NN={376:15,516:32,1188:30}
def load(run,K=160):
    rg=json.load(open(R+run+"/pose.json"))["variants"]["phone"]["ruled"]
    L=pose_to_world([r["L"] for r in rg]); Rr=pose_to_world([r["R"] for r in rg]); N=len(L)
    bs=Basis(N,K); C=bs.fit((L+Rr)/2); G=bs.fit(unit(Rr-L))
    t=np.arange(N).astype(float); sp=BSpline(bs.kn,np.eye(K),3)
    c=sp(t)@C; T=unit(sp.derivative(1)(t)@C); b=unit(sp(t)@G)
    return L,Rr,c,T,b
def report(run, nn=None):
    L,Rr,c,T,b=load(run); N=len(c)
    z=np.r_[L[:,2],Rr[:,2]]; print(run,"world z range of ribbon: %.0f .. %.0f (span %.0f)  centreline z %.0f..%.0f"%(z.min(),z.max(),z.max()-z.min(),c[:,2].min(),c[:,2].max()))
    for nm,a,b_ in REG:
        s=slice(a,min(b_,N-1)+1); zz=np.r_[L[s,2],Rr[s,2]]
        print("  %-9s %4d-%4d  z %5.0f..%5.0f  mean|Tz| %.2f  max|Tz| %.2f"%(nm,a,b_,zz.min(),zz.max(),np.abs(T[s,2]).mean(),np.abs(T[s,2]).max()))
    for cq in CR:
        n=(nn or NN)[cq]
        Ti=unit(T[cq-n-20:cq-n-4].mean(0,keepdims=True))[0]; To=unit(T[cq+n+5:cq+n+21].mean(0,keepdims=True))[0]
        print("  crease %d: T_in.T_out %.3f (angle %.0f deg)  half-angle cos %.3f  |b.T| at crease %.3f  T_in z %.2f T_out z %.2f"%(cq,Ti@To,np.degrees(np.arccos(np.clip(Ti@To,-1,1))),np.cos(np.arccos(np.clip(Ti@To,-1,1))/2),abs(b[cq]@T[cq]),Ti[2],To[2]))
    # legs
    def chord(a,b_): return c[b_]-c[a]
    l1=chord(388,483); l2=chord(549,647)
    ang3=np.degrees(np.arccos(np.clip(unit(l1[None])[0]@unit(-l2[None])[0],-1,1)))
    s1=project(c[[388,483]]); s2=project(c[[549,647]]); v1=s1[1]-s1[0]; v2=-(s2[1]-s2[0])
    ang2=np.degrees(np.arccos(v1@v2/np.linalg.norm(v1)/np.linalg.norm(v2)))
    print("  A legs (left 388-483 up, right 549-647 reversed): 3D angle %.1f deg, screen angle %.1f deg; left leg dz %.0f, right leg dz %.0f over world chord lengths %.0f / %.0f"%(ang3,ang2,l1[2],l2[2],np.linalg.norm(l1),np.linalg.norm(l2)))
if __name__=="__main__":
    for r in sys.argv[1:]: report(r)
