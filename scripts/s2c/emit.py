import json, numpy as np
S='/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop/'
OUT=S+'result_s2c/'
cl=json.load(open(OUT+'centreline2d.json')); pi=json.load(open(OUT+'pose_input.json')); ms=json.load(open(OUT+'measure.json'))
A=cl['anchors']; P=np.array(cl['points'])
def cross(spanA,spanB,guess):
    a=P[spanA[0]:spanA[1]+1]; b=P[spanB[0]:spanB[1]+1]
    d=np.linalg.norm(a[:,None]-b[None],axis=2); i,j=np.unravel_index(d.argmin(),d.shape)
    return (a[i]+b[j])/2, float(d.min())
c1f=[A['A_right_leg_mid']-60,A['A_right_leg_low']]; c1b=[A['crossbar_right']-5,A['crossbar_right']+70]
c2f=[A['lower_back'],A['K_junction']]; c2b=[A['upper_back'],A['ret_hidden_start']+40]
x1=cross(c1f,c1b,None); x2=cross(c2f,c2b,None)
print('crossing 1',x1,'crossing 2',x2)
names=['T1_hidden_end','A_left_leg','A_apex','A_right_leg_top','A_right_leg_mid','A_right_leg_low','lower_out','lower_tip','lower_back','K_junction','upper_out','upper_tip','upper_back','ret_hidden_start','crossbar_right','crossbar','drop_R','S_left','S_mid','S_turn','tail_a','tail_b']
nodes=[dict(name=n,arc=A[n]) for n in names]; nodes.sort(key=lambda n:n['arc'])
Hc=ms['Hcap']
inp=dict(points=pi['points'],knots=pi['knots'],targets=[dict(f=t['f'],faceB=t['faceB'],vis=t['vis']) for t in pi['targets']],
 path=[[round(a,2),round(b,2)] for a,b in cl['points']],anchor=pi['anchor'],fov=pi['fov'],W=pi['W'],hcap=Hc,nodes=nodes,
 crossings=[dict(name='A right leg over crossbar',front=c1f,back=c1b,at=[float(x1[0][0]),float(x1[0][1])]),
            dict(name='lower-K outgoing strand over upper-K return',front=c2f,back=c2b,at=[float(x2[0][0]),float(x2[0][1])])],
 split=398,planeZ=[-0.25*Hc,0.25*Hc])
json.dump(inp,open(OUT+'s2c_input.json','w'))
print(len(inp['points']),'control points')
