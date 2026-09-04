import sys, time, pickle
from alex import *
rows=[r for K in [3,4,5,6] for name in CELLS for r in enumerate_rows(K,name) if r['pi'] is None]
idx=int(sys.argv[1]); r=rows[idx]
t=time.time()
S=Surface(r)
area=2*r['K']*abs(np.cross(S.base['B']-S.base['A'],S.base['C']-S.base['A']))/2
geos=S.geodesics(maxtris=int(sys.argv[2]),maxlen=float(sys.argv[3])*math.sqrt(area))
geos=chain_geodesics(S,geos)
uniq=[]
for g in geos:
    if not any(same_curve(g,h) for h in uniq): uniq.append(g)
print("geodesics",len(geos),"unique",len(uniq),"time",round(time.time()-t,1)); sys.stdout.flush()
tris=find_triangulations(S,uniq)
print("triangulations",len(tris),"time",round(time.time()-t,1)); sys.stdout.flush()
for T in tris:
    faces=faces_of(S,T)
    res=realize3(S,T,faces)
    if res:
        X,tf=res
        print("SOLVED",r['K'],r['cell'],[c[2] for c in S.cones]); print(np.round(X,5).tolist())
        pickle.dump((r,T,faces,X,tf),open(f'sol_{idx}.pkl','wb')); break
else: print("none convex")
print("time",round(time.time()-t,1))
