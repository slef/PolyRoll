import math, random, itertools, string
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import ConvexHull
from draw import CELLS, EDGES, reflect, enumerate_rows, g_of, cone_of
from tame2 import inverse
random.seed(0)

class Surface:
    def __init__(self,row):
        self.row=row; K=row['K']; self.K=K
        self.tris=[('F',i) for i in range(K)]+[('B',i) for i in range(K)]
        _,base=CELLS[row['cell']]
        self.base={L:np.array(base[L],float) for L in 'ABC'}
        self.cones=[c for c in row['cones'] if c[2]<360]
        self.cones.sort(key=lambda c:-c[2])
        self.flat=[c for c in row['cones'] if c[2]>=360]
        self.cidx={c:k for k,c in enumerate(self.cones)}
        self.n=len(self.cones)
        self.all_pts=self.cones+self.flat
        self.idx_all={c:k for k,c in enumerate(self.all_pts)}
    def adj(self,tri,e):
        kind,i=tri; g=g_of(self.row,e)
        return ('B',g[i]) if kind=='F' else ('F',inverse(g)[i])
    def std(self,tri):
        P=dict(self.base)
        if tri[0]=='B': P={L:np.array([v[0],-v[1]]) for L,v in P.items()}
        return P
    def cone(self,tri,L):
        return cone_of(self.row,tri[0],tri[1],L)
    def corner_angle(self,L):
        P=self.base; a,b=[x for x in 'ABC' if x!=L]
        u=P[a]-P[L]; v=P[b]-P[L]
        return math.acos(np.dot(u,v)/np.linalg.norm(u)/np.linalg.norm(v))
    # cyclic order of corners around a cone point: returns list of (tri, L, start_angle) ; angle measured ccw in the cone
    def fan(self,cone):
        # find a starting (tri,L)
        start=None
        for tri in self.tris:
            for L in 'ABC':
                if self.cone(tri,L)==cone: start=(tri,L);break
            if start: break
        out=[]; tri,L=start; ang=0.0
        # ccw direction: in std coords of tri, the corner L has two edges; ccw from edge e1 to e2 where e1 is the edge such that going ccw around L inside triangle starts at e1.
        for _ in range(100):
            P=self.std(tri); a,b=[x for x in 'ABC' if x!=L]
            u=P[a]-P[L]; v=P[b]-P[L]
            cr=u[0]*v[1]-u[1]*v[0]
            first,second=(a,b) if cr>0 else (b,a)  # ccw from 'first' edge to 'second' edge
            out.append((tri,L,ang,first,second))
            ang+=self.corner_angle(L)
            # cross edge (L,second) to neighbor
            e=[k for k,(x,y) in EDGES.items() if {x,y}=={L,second}][0]
            tri=self.adj(tri,e)
            if (tri,L)==start: break
        return out
    def geodesics(self,maxtris=16,maxlen=None):
        """enumerate simple geodesic segments between cone points (not through cone points)."""
        res={}
        fans={c:self.fan(c) for c in self.cones+self.flat}
        for c in self.cones+self.flat:
            for (tri0,L0,ang0,first,second) in fans[c]:
                # strips starting at tri0
                stack=[[(tri0,None)]]
                while stack:
                    st=stack.pop()
                    if len(st)>maxtris: continue
                    # try to end at any corner of last triangle that is a cone point (not flat), not the start corner
                    pts=[self.std(st[0][0])]
                    okplace=True
                    for k in range(1,len(st)):
                        tri,e=st[k]; a,b=EDGES[e]; prev=pts[-1]; third=[x for x in 'ABC' if x not in (a,b)][0]
                        pts.append({a:prev[a],b:prev[b],third:reflect(prev[third],prev[a],prev[b])})
                    p=pts[0][L0]
                    for L2 in 'ABC':
                        c2=self.cone(st[-1][0],L2)
                        if len(st)==1 and L2==L0: continue
                        q=pts[-1][L2]
                        if maxlen and np.linalg.norm(q-p)>maxlen: continue
                        # check segment crosses each shared edge interior, allowing passing through flat points
                        good=True; pieces=[]
                        entry=p
                        for k in range(1,len(st)):
                            a,b=EDGES[st[k][1]]; A_=pts[k][a]; B_=pts[k][b]
                            d=q-p; e_=B_-A_; den=d[0]*e_[1]-d[1]*e_[0]
                            if abs(den)<1e-12: good=False;break
                            r=((A_-p)[0]*e_[1]-(A_-p)[1]*e_[0])/den; u=((A_-p)[0]*d[1]-(A_-p)[1]*d[0])/den
                            if not(1e-9<r<1-1e-9): good=False;break
                            if not(1e-9<u<1-1e-9):
                                hit=a if u<0.5 else b
                                if abs(u-round(u))<1e-9 and self.cone(st[k][0],hit)[2]>=360: pass
                                else: good=False;break
                            x=p+r*d
                            pieces.append((st[k-1][0],entry,x)); entry=x
                        if not good: continue
                        pieces.append((st[-1][0],entry,q))
                        # also the segment must not pass through a cone point inside first triangle etc: covered by edge checks (vertices are on edges)
                        # direction angle at start
                        P0=pts[0]; u0=P0[first]-P0[L0]; d=q-p
                        phi=math.atan2(u0[0]*d[1]-u0[1]*d[0], np.dot(u0,d))
                        if phi<-1e-9 or phi>self.corner_angle(L0)+1e-9: continue
                        # convert pieces to std coords of each triangle
                        spieces=[]
                        for (tri,x,y),P in zip(pieces,pts):
                            S=self.std(tri)
                            # isometry from P to S: use A,B
                            ua=P['B']-P['A']; va=S['B']-S['A']
                            def mp(z):
                                w=z-P['A']
                                # express w in basis (ua, perp(ua))
                                pu=np.array([-ua[1],ua[0]]); l=np.dot(ua,ua)
                                cu=np.dot(w,ua)/l; cv=np.dot(w,pu)/l
                                # check reflection
                                pv=np.array([-va[1],va[0]])
                                Cpt=S['A']+ (P['C']-P['A'])[0]*0  # dummy
                                # determine whether map is reflection by testing C
                                return cu,cv
                            cuC,cvC=mp(P['C']); pv=np.array([-va[1],va[0]])
                            sgn= 1 if np.linalg.norm(S['A']+cuC*va+cvC*pv-S['C'])<1e-7 else -1
                            def full(z):
                                cu,cv=mp(z); return S['A']+cu*va+sgn*cv*pv
                            spieces.append((tri,full(x),full(y)))
                        key=(self.idx_all[c],self.idx_all[c2],tuple((t,round(float(x[0]),5),round(float(x[1]),5),round(float(y[0]),5),round(float(y[1]),5)) for t,x,y in spieces))
                        rkey=(key[1],key[0],tuple((t,x3,y3,x1,y1) for t,x1,y1,x3,y3 in reversed(key[2])))
                        if rkey in res: continue
                        res[key]=dict(u=self.idx_all[c],v=self.idx_all[c2],length=float(np.linalg.norm(q-p)),pieces=spieces,ang_u=ang0+phi)
                    # extend strip, pruning by angular funnel from p through all crossed edges
                    last,ein=st[-1]
                    for e in EDGES:
                        if e==ein: continue
                        nb=self.adj(last,e)
                        a,b=EDGES[e]; prev=pts[-1]
                        A_,B_=prev[a],prev[b]
                        # directions to the interior of all crossed edges must have common intersection: use angle intervals
                        ivs=[]
                        for k in range(1,len(st)+1):
                            if k<len(st):
                                aa,bb=EDGES[st[k][1]]; Pk=pts[k]; E1,E2=Pk[aa],Pk[bb]; trk=st[k][0]
                            else:
                                aa,bb=EDGES[e]; E1,E2=A_,B_; trk=nb
                            c1=self.cone(trk,aa)[2]>=360; c2=self.cone(trk,bb)[2]>=360
                            t1=math.atan2(*(E1-p)[::-1]); t2=math.atan2(*(E2-p)[::-1])
                            if np.linalg.norm(E1-p)<1e-9 or np.linalg.norm(E2-p)<1e-9: ivs=None;break
                            d=(t2-t1+math.pi)%(2*math.pi)-math.pi
                            if d>0: ivs.append((t1,t2,c1,c2))
                            else: ivs.append((t2,t1,c2,c1))
                        if ivs is None: continue
                        def inter(ivs):
                            lo,cl= max(((iv[0],iv[2]) for iv in ivs))
                            hi,ch= min(((iv[1],iv[3]) for iv in ivs))
                            for iv in ivs:
                                if iv[0]>lo-1e-9: cl=cl and iv[2]
                                if iv[1]<hi+1e-9: ch=ch and iv[3]
                            return (hi-lo>1e-9) or (hi-lo>-1e-9 and cl and ch)
                        ok=inter(ivs)
                        if not ok:
                            ivs2=[(l+2*math.pi,h+2*math.pi,cl,ch) if h<0 else (l,h,cl,ch) for l,h,cl,ch in ivs]
                            ok=inter(ivs2)
                        if not ok: continue
                        stack.append(st+[(nb,e)])
        # fill angle at v end: recompute by reversing? compute ang_v via the reversed geodesic found later; do a second pass
        geos=list(res.values())
        # compute ang_v: find reversed key
        for g in geos:
            # direction at v: last piece reversed
            tri,x,y=g['pieces'][-1]
            # which corner is v
            S=self.std(tri); L=[l for l in 'ABC' if np.linalg.norm(S[l]-y)<1e-7][0]
            fan=fans[self.all_pts[g['v']]]
            ent=[f for f in fan if f[0]==tri and f[1]==L][0]
            _,_,ang0,first,_=ent
            u0=S[first]-S[L]; d=x-y
            phi=math.atan2(u0[0]*d[1]-u0[1]*d[0], np.dot(u0,d))
            g['ang_v']=ang0+phi
        return geos

def seg_cross(p1,p2,q1,q2):
    def orient(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    o1,o2,o3,o4=orient(p1,p2,q1),orient(p1,p2,q2),orient(q1,q2,p1),orient(q1,q2,p2)
    eps=1e-9
    if (o1>eps and o2<-eps or o1<-eps and o2>eps) and (o3>eps and o4<-eps or o3<-eps and o4>eps): return True
    # collinear overlap
    if abs(o1)<eps and abs(o2)<eps:
        # check overlap of projections
        d=p2-p1; t=[np.dot(q1-p1,d)/np.dot(d,d),np.dot(q2-p1,d)/np.dot(d,d)]
        if max(t)>eps and min(t)<1-eps: return True
    return False
def crosses(g,h):
    for (t1,a1,b1) in g['pieces']:
        for (t2,a2,b2) in h['pieces']:
            if t1!=t2: continue
            if seg_cross(a1,b1,a2,b2): return True
    return False
def same_curve(g,h):
    return g['u']==h['u'] and g['v']==h['v'] and abs(g['length']-h['length'])<1e-7 and abs(g['ang_u']-h['ang_u'])<1e-7

def find_triangulations(S,geos):
    n=S.n; need=3*n-6
    geos=[g for g in geos if g['u']!=g['v']]
    geos.sort(key=lambda g:g['length'])
    m=len(geos)
    cross=[[crosses(geos[i],geos[j]) for j in range(m)] for i in range(m)]
    sols=[]
    def rec(start,chosen,pairs):
        if len(chosen)==need: sols.append(list(chosen)); return
        for i in range(start,m):
            g=geos[i]; pr=frozenset((g['u'],g['v']))
            if pr in pairs: continue
            if any(cross[i][j] for j in chosen): continue
            chosen.append(i); pairs.add(pr); rec(i+1,chosen,pairs); chosen.pop(); pairs.discard(pr)
            if len(sols)>40000: return
    rec(0,[],set())
    return [[geos[i] for i in s] for s in sols]
def faces_of(S,T):
    n=S.n
    # rotation system: at each vertex, list of (angle, edge index, end) sorted
    rot={v:[] for v in range(n)}
    for k,g in enumerate(T):
        rot[g['u']].append((g['ang_u'],k,'u')); rot[g['v']].append((g['ang_v'],k,'v'))
    for v in rot: rot[v].sort()
    # directed edge (k,end) means leaving vertex 'end' side... define half-edge as (k,side) where side is the vertex we leave from
    def other(k,side): return T[k]['v'] if side=='u' else T[k]['u']
    def nxt(k,side):
        # arrive at w=other; find (k, oppside) in rot[w]; take next ccw
        w=other(k,side); opp='v' if side=='u' else 'u'
        lst=rot[w]; idx=[i for i,(a,kk,s) in enumerate(lst) if kk==k and s==opp][0]
        a,kk,s=lst[(idx+1)%len(lst)]
        return (kk,s)
    seen=set(); faces=[]
    for k in range(len(T)):
        for side in 'uv':
            if (k,side) in seen: continue
            f=[];h=(k,side)
            while h not in seen:
                seen.add(h); f.append(h); h=nxt(*h)
            faces.append(f)
    return faces
def realize(S,T,faces):
    n=S.n
    if any(len(f)!=3 for f in faces): return None
    L={}
    for g in T: L[frozenset((g['u'],g['v']))]=g['length']
    pairs=list(L.items())
    def resid(x):
        X=x.reshape(n,3)
        return [np.linalg.norm(X[list(p)[0]]-X[list(p)[1]])-l for p,l in pairs]
    for trial in range(150):
        x0=np.random.randn(n*3)*max(L.values())/2
        r=least_squares(resid,x0)
        if np.max(np.abs(r.fun))>1e-7: continue
        X=r.x.reshape(n,3)
        # convexity: each face plane supports all points
        ok=True
        tri_faces=[]
        for f in faces:
            vs=[T[k]['u'] if s=='u' else T[k]['v'] for k,s in f]
            tri_faces.append(vs)
            a,b,c=[X[v] for v in vs]; nrm=np.cross(b-a,c-a)
            if np.linalg.norm(nrm)<1e-8: ok=False;break
            nrm/=np.linalg.norm(nrm)
            d=[np.dot(X[v]-a,nrm) for v in range(n)]
            if max(d)>1e-6 and min(d)<-1e-6: ok=False;break
        if not ok: continue
        # must be genuinely 3D (not flat)
        if np.linalg.matrix_rank(X-X.mean(0),tol=1e-6)<3: continue
        return X,tri_faces
    return None
def solve(row,maxlen=None):
    S=Surface(row)
    area=2*row['K']*abs(np.cross(S.base['B']-S.base['A'],S.base['C']-S.base['A']))/2
    if maxlen is None: maxlen=1.2*math.sqrt(area)*1.5
    geos=S.geodesics(maxtris=18,maxlen=maxlen)
    # dedupe
    uniq=[]
    for g in geos:
        if not any(same_curve(g,h) for h in uniq): uniq.append(g)
    tris=find_triangulations(S,uniq)
    for T in tris:
        faces=faces_of(S,T)
        r=realize(S,T,faces)
        if r: return S,T,faces,r
    return S,None,None,None
if __name__=="__main__":
    import pickle
    rows=[r for K in [3,4,5,6] for name in CELLS for r in enumerate_rows(K,name) if r['pi'] is None]
    out=[]
    for r in rows:
        S,T,faces,res=solve(r)
        angs=[c[2] for c in S.cones]
        if res is None: print(r['K'],r['cell'],angs,"FAILED"); continue
        X,tf=res
        print(r['K'],r['cell'],angs,"vertices:",np.round(X,4).tolist())
        out.append((r,T,faces,X,tf))
    pickle.dump(out,open('solved.pkl','wb'))

def realize2(S,T,faces):
    """robust: try triangulation, seed least squares from random + MDS inits, more trials"""
    n=S.n
    if any(len(f)!=3 for f in faces): return None
    L={}
    for g in T: L[frozenset((g['u'],g['v']))]=g['length']
    pairs=list(L.items())
    def resid(x):
        X=x.reshape(n,3)
        return [np.linalg.norm(X[list(p)[0]]-X[list(p)[1]])-l for p,l in pairs]
    sols=[]
    for trial in range(300):
        x0=np.random.randn(n*3)*max(L.values())/2
        r=least_squares(resid,x0)
        if np.max(np.abs(r.fun))>1e-7: continue
        X=r.x.reshape(n,3)
        if np.linalg.matrix_rank(X-X.mean(0),tol=1e-6)<3: continue
        viol=0; tri_faces=[]
        for f in faces:
            vs=[T[k]['u'] if s=='u' else T[k]['v'] for k,s in f]
            tri_faces.append(vs)
            a,b,c=[X[v] for v in vs]; nrm=np.cross(b-a,c-a)
            if np.linalg.norm(nrm)<1e-9: viol=1e9;break
            nrm/=np.linalg.norm(nrm); d=[np.dot(X[v]-a,nrm) for v in range(n)]
            viol=max(viol,min(max(d),-min(d)))
        if viol<1e-6: return X,tri_faces
    return None

def realize3(S,T,faces):
    """exact: enumerate all embeddings via trilateration with mirror branching."""
    n=S.n
    if any(len(f)!=3 for f in faces): return None
    E={}
    for g in T: E[frozenset((g['u'],g['v']))]=g['length']
    def d(u,v): return E.get(frozenset((u,v)))
    # ordering: start from a face, add vertices with >=3 placed neighbors
    f0=[T[k]['u'] if s=='u' else T[k]['v'] for k,s in faces[0]]
    order=list(f0); rest=[v for v in range(n) if v not in order]
    while rest:
        pick=None
        for v in rest:
            if sum(1 for u in order if d(u,v) is not None)>=3: pick=v;break
        if pick is None: return None
        order.append(pick); rest.remove(pick)
    sols=[]
    a,b,c=order[0],order[1],order[2]
    A=np.zeros(3); B=np.array([d(a,b),0,0])
    ab,ac,bc=d(a,b),d(a,c),d(b,c)
    x=(ab**2+ac**2-bc**2)/(2*ab); y2=ac**2-x**2
    if y2<-1e-9: return None
    C=np.array([x,math.sqrt(max(y2,0)),0])
    def rec(pos,k):
        if k==len(order):
            sols.append(dict(pos)); return
        v=order[k]
        nb=[u for u in order[:k] if d(u,v) is not None][:4]
        p1,p2,p3=[pos[u] for u in nb[:3]]; r1,r2,r3=[d(u,v) for u in nb[:3]]
        # solve trilateration
        ex=(p2-p1)/np.linalg.norm(p2-p1)
        i=np.dot(ex,p3-p1); ey=p3-p1-i*ex
        if np.linalg.norm(ey)<1e-12: return
        ey/=np.linalg.norm(ey); ez=np.cross(ex,ey)
        dd=np.linalg.norm(p2-p1); j=np.dot(ey,p3-p1)
        X=(r1**2-r2**2+dd**2)/(2*dd)
        Y=(r1**2-r3**2+i**2+j**2-2*i*X)/(2*j)
        z2=r1**2-X**2-Y**2
        if z2<-1e-7: return
        for z in ([math.sqrt(max(z2,0))] if z2<1e-9 else [math.sqrt(z2),-math.sqrt(z2)]):
            q=p1+X*ex+Y*ey+z*ez
            ok=all(abs(np.linalg.norm(q-pos[u])-d(u,v))<1e-7 for u in order[:k] if d(u,v) is not None)
            if ok:
                pos[v]=q; rec(pos,k+1); del pos[v]
    rec({a:A,b:B,c:C},3)
    for pos in sols:
        X=np.array([pos[v] for v in range(n)])
        if np.linalg.matrix_rank(X-X.mean(0),tol=1e-6)<3: continue
        if min(np.linalg.norm(X[i]-X[j]) for i in range(n) for j in range(i+1,n))<1e-6: continue
        try:
            if len(ConvexHull(X).vertices)!=n: continue
        except Exception: continue
        viol=0; tri_faces=[]
        for f in faces:
            vs=[T[k]['u'] if s=='u' else T[k]['v'] for k,s in f]
            tri_faces.append(vs)
            aa,bb,cc=[X[v] for v in vs]; nrm=np.cross(bb-aa,cc-aa)
            if np.linalg.norm(nrm)<1e-9: viol=1e9;break
            nrm/=np.linalg.norm(nrm); dd=[np.dot(X[v]-aa,nrm) for v in range(n)]
            viol=max(viol,min(max(dd),-min(dd)))
        if viol<1e-6: return X,tri_faces
    return None


def chain_geodesics(S,geos,maxseg=3):
    n=S.n; N=len(S.all_pts)
    tot={c[2] for c in S.flat}
    out=[]
    # base: cone-cone
    for g in geos:
        if g['u']<n and g['v']<n: out.append(g)
    # chains through flats: build directed pieces
    def ang_tot(i): return S.all_pts[i][2]
    frontier=[g for g in geos if g['u']<n and g['v']>=n]
    partial=[(g,[g]) for g in frontier]
    for _ in range(maxseg-1):
        newp=[]
        for g,chain in partial:
            v=g['v']
            for h in geos+[dict(u=h0['v'],v=h0['u'],length=h0['length'],pieces=[(t,y,x) for t,x,y in reversed(h0['pieces'])],ang_u=h0['ang_v'],ang_v=h0['ang_u']) for h0 in geos]:
                if h['u']!=v: continue
                # straightness at v: angles differ by half the total angle (=180 for 360 flat)
                diff=(h['ang_u']-g['ang_v'])%(math.radians(ang_tot(v)))
                if not (abs(diff-math.radians(ang_tot(v))/2)<1e-7): continue
                g2=dict(u=chain[0]['u'],v=h['v'],length=sum(x['length'] for x in chain)+h['length'],
                        pieces=[p for x in chain for p in x['pieces']]+h['pieces'],
                        ang_u=chain[0]['ang_u'],ang_v=h['ang_v'])
                if h['v']<n:
                    # self-crossing check
                    ok=True
                    P=g2['pieces']
                    for i2 in range(len(P)):
                        for j2 in range(i2+1,len(P)):
                            if P[i2][0]==P[j2][0] and seg_cross(P[i2][1],P[i2][2],P[j2][1],P[j2][2]): ok=False;break
                        if not ok: break
                    if ok: out.append(g2)
                else: newp.append((h,chain+[h]))
        partial=newp
    return out
