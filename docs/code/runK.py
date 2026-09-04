import sys, time, pickle, math, random
import numpy as np
from alex import *
K=int(sys.argv[1]); which=int(sys.argv[2]); maxtris=int(sys.argv[3]); lenf=float(sys.argv[4])
rows=[r for r in pickle.load(open(f'rows_K{K}.pkl','rb')) if r['pi'] is None]
r=rows[which]; t=time.time()
S=Surface(r)
area=2*K*abs(np.cross(S.base['B']-S.base['A'],S.base['C']-S.base['A']))/2
geos=S.geodesics(maxtris=maxtris,maxlen=lenf*math.sqrt(area))
geos=chain_geodesics(S,geos)
uniq=[]
for g in geos:
    if not any(same_curve(g,h) for h in uniq): uniq.append(g)
print("geodesics",len(uniq),"t",round(time.time()-t,1)); sys.stdout.flush()
tris=find_triangulations(S,uniq)
print("triangulations",len(tris),"t",round(time.time()-t,1)); sys.stdout.flush()
for T in tris:
    faces=faces_of(S,T)
    res=realize3(S,T,faces)
    if res:
        X,tf=res
        sums={}
        for f in tf:
            for k in range(3):
                a,b,c=X[f[k]],X[f[(k+1)%3]],X[f[(k-1)%3]]
                u=b-a;v=c-a; sums[f[k]]=sums.get(f[k],0)+math.degrees(math.acos(max(-1,min(1,np.dot(u,v)/np.linalg.norm(u)/np.linalg.norm(v)))))
        if any(abs(sums.get(i,0)-S.cones[i][2])>1e-4 for i in range(S.n)):
            print("rejected (angle sums)",{k:round(v,2) for k,v in sums.items()}); continue
        print("SOLVED",K,r['cell'],[c[2] for c in S.cones],round(time.time()-t,1)); print(np.round(X,5).tolist())
        pickle.dump((r,T,faces,X,tf),open(f'solK{K}_{which}.pkl','wb')); break
else: print("none convex")
