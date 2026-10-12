"""The tilted-ring model of ringfit.py (build() only, without its optimiser), so rotosurf.py can regenerate the bottom-K loop
for a given (R, tau, alpha) override (env BK_RF=R,tau,alpha). Same maths as ringfit.build; also returns the ring centre C."""
import math, json, numpy as np
K=2.185
L1p,L1d=np.array([531,1105])/K,np.array([0.244,0.970])
L2p,L2d=np.array([553,937])/K,np.array([-0.79,-0.61]); L2d=L2d/np.linalg.norm(L2d)
def ring(R,tau,al,sgn=1):
    a=np.array([math.cos(al),math.sin(al)]); ap=np.array([-a[1],a[0]])
    def p(th): return R*(math.cos(th)*a+math.sin(th)*math.cos(tau)*ap), R*math.sin(th)*math.sin(tau)*sgn
    def t(th):
        v=R*(-math.sin(th)*a+math.cos(th)*math.cos(tau)*ap); return v/np.linalg.norm(v)
    return p,t
def solve_theta(t,d):
    ths=np.linspace(0,2*math.pi,3601); return ths[int(np.argmax([t(x)@d for x in ths]))]
def build(v,n=12):
    R,tau,al=v; p,t=ring(R,tau,al); th0,th1=solve_theta(t,L1d),solve_theta(t,L2d)
    if th1<=th0: th1+=2*math.pi
    D=p(th1)[0]-p(th0)[0]
    c=lambda w: w[0]*L2d[1]-w[1]*L2d[0]
    s=-c(L1p+D-L2p)/c(L1d); Ein=L1p+s*L1d; C=Ein-p(th0)[0]
    pts=[(C+p(th)[0],p(th)[1]) for th in np.linspace(th0,th1,n)]
    return pts,th0,th1,s,C
