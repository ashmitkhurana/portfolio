import sys, re, csv, numpy as np
R="/Users/ashmitkhurana/Development/Personal/portfolio/docs/ribbon/turns/real/"
for run in sys.argv[1:]:
    O=R+run+"/"
    print("=====",run)
    lines=open(O+"diag/rings.csv").read().strip().split('\n'); c={k:i for i,k in enumerate(lines[0].split(','))}
    A=np.array([[float(x) for x in l.split(',')] for l in lines[1:]]); dN=A[:,c['dN']]
    print("dN max %.1f p99 %.2f >6: %d"%(dN.max(),np.percentile(dN,99),(dN>6).sum()), " top:", [(int(A[i,c['pose_ring']]),round(dN[i],1)) for i in np.argsort(-dN)[:4]])
    rp=open(O+"c/report.txt").read()
    m=re.search(r"dense.*?max ([\d.]+) deg  p99 ([\d.]+)",rp); print("dense max",m.group(1),"p99",m.group(2), re.search(r"dense steps.*",rp).group(0) if re.search(r"dense steps.*",rp) else "")
    print(open(O+"clearance.txt").read().split('\n')[1] if len(open(O+"clearance.txt").read().split('\n'))>1 else "")
    print([l for l in open(O+"wrapcheck.txt").read().split('\n') if 'WRAPCHECK' in l])
    print(open(O+"convexcheck.txt").read().strip())
    print(open(O+"edgecheck.txt").read().strip())
    print(open(O+"ripple.txt").read().strip().split('\n')[0])
    sl=open(O+"sil.log").read().split('\n'); print(' | '.join(' '.join(l.split()[:2]) for l in sl if l.split()[:1] and l.split()[0] in('all','apex','topK','junction','bottomK','wrap','farleft')))
