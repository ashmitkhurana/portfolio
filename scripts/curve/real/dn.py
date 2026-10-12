import sys, numpy as np
f=sys.argv[1]
rngs=[tuple(map(int,x.split(':'))) for x in sys.argv[2:]] or [(500,560),(580,720)]
lines=open(f).read().strip().split('\n'); h=lines[0].split(','); c={k:i for i,k in enumerate(h)}
A=np.array([[float(x) for x in l.split(',')] for l in lines[1:]])
g=lambda k:A[:,c[k]]
bT=np.abs(g('Bx')*g('Tx')+g('By')*g('Ty')+g('Bz')*g('Tz'))
pr=g('pose_ring')
print('dN>6:',(g('dN')>6).sum(),'max',g('dN').max())
for lo,hi in rngs:
    m=np.where((pr>=lo)&(pr<=hi))[0]
    o=m[np.argsort(-g('dN')[m])][:8]
    print('pose',lo,hi)
    for i in o: print('  ring %d pose %d dN %.1f dB %.2f |bT| %.3f kappa %.4f obl %.3f'%(g('ring')[i],pr[i],g('dN')[i],g('dB')[i],bT[i],g('kappa')[i],g('obl')[i]))
