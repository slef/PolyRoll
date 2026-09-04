import pickle, math, random, itertools, string
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union, polygonize
from alex import *
import draw as D
from tame2 import inverse
random.seed(2)

def load(idx): return pickle.load(open(f'sol_{idx}.pkl','rb'))

class Dev:
    def __init__(self,r,Tg):
        self.r=r; self.K=r['K']; self.S=Surface(r)
        self.cells=[('F',i) for i in range(self.K)]+[('B',i) for i in range(self.K)]
        (self.orders,base)=CELLS[r['cell']]
        self.base={L:np.array(base[L],float) for L in 'ABC'}
        self.Tg=Tg
        self.chords={c:[] for c in self.cells}
        for ei,g in enumerate(Tg):
            for (tri,x,y) in g['pieces']:
                self.chords[tri].append((ei,np.array(x,float),np.array(y,float)))
    def std(self,cell):
        P=dict(self.base)
        if cell[0]=='B': P={L:np.array([v[0],-v[1]]) for L,v in P.items()}
        return P
    def adj(self,cell,e):
        kind,i=cell; g=D.g_of(self.r,e)
        return ('B',g[i]) if kind=='F' else ('F',inverse(g)[i])
    def snap_pt(self,c,p):
        P=self.std(c)
        for L in 'ABC':
            if np.linalg.norm(p-P[L])<1e-6: return P[L].copy()
        for e,(a,b) in EDGES.items():
            A_,B_=P[a],P[b]; d=B_-A_; L2=np.dot(d,d)
            t=np.dot(p-A_,d)/L2
            if -1e-9<t<1+1e-9:
                proj=A_+t*d
                if np.linalg.norm(proj-p)<1e-6: return proj
        return p
    def fragments(self):
        self.frag={}   # cell -> list of shapely polygons (std coords)
        for c in self.cells:
            P=self.std(c)
            snapped=[]
            for (ei,x,y) in self.chords[c]:
                x=self.snap_pt(c,np.array(x,float)); y=self.snap_pt(c,np.array(y,float))
                if self.edge_of_cell(c,x,y) is None: snapped.append((x,y))
            lines=[]
            for e,(a,b) in EDGES.items():
                A_,B_=P[a],P[b]; d=B_-A_; L2=np.dot(d,d)
                pts=[(0.0,A_),(1.0,B_)]
                for (x,y) in snapped:
                    for p in (x,y):
                        t=np.dot(p-A_,d)/L2
                        if 1e-9<t<1-1e-9 and np.linalg.norm(A_+t*d-p)<1e-9:
                            pts.append((t,p))
                pts.sort(key=lambda z:z[0])
                for k in range(len(pts)-1):
                    if pts[k+1][0]-pts[k][0]>1e-12:
                        lines.append(LineString([tuple(pts[k][1]),tuple(pts[k+1][1])]))
            for (x,y) in snapped: lines.append(LineString([tuple(x),tuple(y)]))
            polys=[p for p in polygonize(unary_union(lines)) if p.area>1e-9]
            self.frag[c]=polys
    def chord_on(self,c,p,q,also_neighbor_edge=None):
        """edge index of a chord covering segment pq in cell c (or its neighbor across cell-edge), else None"""
        m=(p+q)/2
        cands=self.chords[c][:]
        if also_neighbor_edge is not None:
            nb=self.adj(c,also_neighbor_edge)
            # map neighbor chords to this cell's frame along the shared edge? only need those ON the shared edge; compare by arclength, do below separately
        for (ei,x,y) in cands:
            L=LineString([tuple(x),tuple(y)])
            if L.distance(Point(tuple(m)))<1e-7 and L.distance(Point(tuple(p)))<1e-7 and L.distance(Point(tuple(q)))<1e-7:
                return ei
        return None
    def edge_of_cell(self,c,p,q):
        """which cell-edge (label) contains segment pq, else None"""
        P=self.std(c)
        for e,(a,b) in EDGES.items():
            L=LineString([tuple(P[a]),tuple(P[b])])
            if L.distance(Point(tuple((p+q)/2)))<1e-7 and L.distance(Point(tuple(p)))<1e-7 and L.distance(Point(tuple(q)))<1e-7:
                return e
        return None
    def arclen_key(self,c,e,p,q):
        P=self.std(c); a,b=EDGES[e]; o=P[min(a,b)]
        return (e,round(float(np.linalg.norm((p+q)/2-o)),6),round(float(np.linalg.norm(q-p)),6))
    def build_graph(self,cut):
        nodes=[]
        self.fragments()
        for c in self.cells:
            for fi,poly in enumerate(self.frag[c]): nodes.append((c,fi))
        adjl={n:[] for n in nodes}
        from shapely.geometry import LineString as LS, Point as PT
        def cutcov(c,mid):
            for (ei,x,y) in self.chords[c]:
                if ei not in cut: continue
                if LS([tuple(np.array(x,float)),tuple(np.array(y,float))]).distance(PT(tuple(mid)))<1e-6: return True
            return False
        # same-cell: geometric boundary intersection
        for c in self.cells:
            fr=self.frag[c]
            for i in range(len(fr)):
                for j in range(i+1,len(fr)):
                    inter=fr[i].boundary.intersection(fr[j].boundary)
                    L=inter.length
                    if L<1e-9: continue
                    geoms=inter.geoms if hasattr(inter,'geoms') else [inter]
                    glue=False
                    for g in geoms:
                        if g.length<1e-9: continue
                        mid=np.array(g.interpolate(0.5,normalized=True).coords[0])
                        if not cutcov(c,mid): glue=True
                    if glue:
                        adjl[(c,i)].append(((c,j),'same',None,None))
                        adjl[(c,j)].append(((c,i),'same',None,None))
        # cross-cell: map neighbor boundary onto this cell's edge by arclength
        done=set()
        for c in self.cells:
            P=self.std(c)
            for e,(a,b) in EDGES.items():
                nb=self.adj(c,e)
                key=frozenset([(c,e),(nb,e)])
                if key in done: continue
                done.add(key)
                Pn=self.std(nb)
                o=P[min(a,b)]; dd=P[max(a,b)]-o; Lh=np.linalg.norm(dd); u=dd/Lh
                on=Pn[min(a,b)]; un=(Pn[max(a,b)]-on)/Lh
                edgeLS=LS([tuple(o),tuple(o+dd)])
                def portions(cc,base_o,base_u):
                    out=[]
                    eLS=LS([tuple(base_o),tuple(base_o+base_u*Lh)])
                    for fi,poly in enumerate(self.frag[cc]):
                        inter=poly.boundary.intersection(eLS.buffer(1e-9))
                        if inter.is_empty: continue
                        # project boundary segments onto arclength intervals
                        ivs=[]
                        bd=list(poly.exterior.coords)
                        for k in range(len(bd)-1):
                            p=np.array(bd[k]); q=np.array(bd[k+1])
                            if eLS.distance(PT(tuple(p)))<1e-7 and eLS.distance(PT(tuple(q)))<1e-7 and eLS.distance(PT(tuple((p+q)/2)))<1e-7:
                                t1=float(np.dot(p-base_o,base_u)); t2=float(np.dot(q-base_o,base_u))
                                ivs.append((min(t1,t2),max(t1,t2)))
                        if ivs: out.append((fi,ivs))
                    return out
                pc=portions(c,o,u); pn=portions(nb,on,un)
                for (fi,iv1) in pc:
                    for (fj,iv2) in pn:
                        tot=0; mids=[]
                        for (l1,h1) in iv1:
                            for (l2,h2) in iv2:
                                lo,hi=max(l1,l2),min(h1,h2)
                                if hi-lo>1e-9: tot+=hi-lo; mids.append((lo+hi)/2)
                        if tot<1e-9: continue
                        glue=False
                        for tm in mids:
                            mid_c=o+tm*u; mid_n=on+tm*un
                            if not (cutcov(c,mid_c) or cutcov(nb,mid_n)): glue=True
                        if glue:
                            adjl[(c,fi)].append(((nb,fj),'cross',e,None))
                            adjl[(nb,fj)].append(((c,fi),'cross',e,None))
        return nodes,adjl
    def develop(self,cut):
        nodes,adjl=self.build_graph(cut)
        root=('F',0),0
        root=(('F',0),0)
        maps={root:(np.eye(2),np.zeros(2))}
        q=[root]
        while q:
            cur=q.pop(0)
            M,t=maps[cur]
            for (nb,typ,e,seg) in adjl[cur]:
                if nb in maps: continue
                if typ=='same': maps[nb]=(M,t)
                else:
                    c1=cur[0]; c2=nb[0]
                    P1=self.std(c1); P2=self.std(c2); a,b=EDGES[e]
                    qa=M@P1[a]+t; qb=M@P1[b]+t
                    d1=P2[b]-P2[a]; d2=qb-qa
                    th=math.atan2(d2[1],d2[0])-math.atan2(d1[1],d1[0])
                    R=np.array([[math.cos(th),-math.sin(th)],[math.sin(th),math.cos(th)]])
                    maps[nb]=(R, qa-R@P2[a])
                q.append(nb)
        if len(maps)<len(nodes): return None
        return maps
    def placed_polys(self,maps):
        out={}
        for (c,fi),(M,t) in maps.items():
            poly=self.frag[c][fi]
            pts=[tuple(M@np.array(p)+t) for p in poly.exterior.coords]
            out[(c,fi)]=Polygon(pts)
        return out
def spanning_trees(Tg,n,limit=200):
    edges=list(range(len(Tg)))
    seen=set(); out=[]
    for _ in range(4000):
        random.shuffle(edges)
        par=list(range(n))
        def f(x):
            while par[x]!=x: par[x]=par[par[x]];x=par[x]
            return x
        tr=[]
        for ei in edges:
            u,v=Tg[ei]['u'],Tg[ei]['v']
            if f(u)!=f(v): par[f(u)]=f(v); tr.append(ei)
        key=frozenset(tr)
        if key in seen: continue
        seen.add(key); out.append(set(tr))
        if len(out)>=limit: break
    return out
def solve_net(idx):
    r,Tg,faces,X,tf=load(idx)
    dv=Dev(r,Tg)
    for cut in spanning_trees(Tg,dv.S.n):
        maps=dv.develop(cut)
        if maps is None: continue
        pp=dv.placed_polys(maps)
        ks=list(pp)
        ok=True
        sh={k:pp[k].buffer(-1e-6) for k in ks}
        for a in range(len(ks)):
            for b in range(a+1,len(ks)):
                if sh[ks[a]].intersects(sh[ks[b]]): ok=False;break
            if not ok: break
        if ok: return dv,cut,maps,pp
    return None,None,None,None
if __name__=="__main__":
    for idx in range(12):
        dv,cut,maps,pp=solve_net(idx)
        print(idx, "ok" if maps else "FAIL", len(maps) if maps else 0)
        if maps: pickle.dump((cut,maps),open(f'net5_{idx}.pkl','wb'))
