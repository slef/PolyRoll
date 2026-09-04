import itertools
from collections import defaultdict
def compose(p,q): return tuple(p[q[i]] for i in range(len(p)))
def inverse(p):
    r=[0]*len(p)
    for i,x in enumerate(p): r[x]=i
    return tuple(r)
def cycles(p):
    n=len(p);seen=[False]*n;cs=[]
    for i in range(n):
        if not seen[i]:
            c=[];j=i
            while not seen[j]: seen[j]=True;c.append(j);j=p[j]
            cs.append(c)
    return cs
def conj(p,g): return compose(compose(g,p),inverse(g))
def orbits_count(gens,n):
    par=list(range(n))
    def f(x):
        while par[x]!=x: par[x]=par[par[x]];x=par[x]
        return x
    for g in gens:
        for i in range(n):
            a,b=f(i),f(g[i])
            if a!=b: par[a]=b
    return len({f(i) for i in range(n)})
def power(p,k):
    r=tuple(range(len(p)))
    for _ in range(k): r=compose(p,r)
    return r
def nc_transitive(gens,elems,n):
    S=set(elems);fr=list(elems)
    while fr:
        x=fr.pop()
        for g in gens:
            y=conj(x,g)
            if y not in S: S.add(y);fr.append(y)
    return orbits_count(list(S),n)==1

def run(K,orders,name):
    kC,kA,kB=orders
    perms=list(itertools.permutations(range(K)))
    idp=tuple(range(K))
    invols=[p for p in perms if compose(p,p)==idp]
    seen=set(); rows=[]
    for s in perms:
        for t in perms:
            sA=compose(inverse(t),s); sB=inverse(s); sC=t
            if any(len(c)>k for p,k in ((sA,kA),(sB,kB),(sC,kC)) for c in cycles(p)): continue
            if orbits_count([s,t],K)!=1: continue
            if not nc_transitive([s,t],[power(sA,kA),power(sB,kB),power(sC,kC)],K): continue
            can=min((conj(s,g),conj(t,g)) for g in perms)
            if can in seen: continue
            # orbit under unit-cell symmetries: mirror (swap front/back roles): (s,t)->(s^-1,t^-1)?? 
            # front/back swap with relabel: gluing front_i-back_{g(i)} becomes back_i-front_{g(i)} i.e. g->g^-1 for all edges incl BC (still id)
            alts={can}
            fr=[can]
            while fr:
                a,b=fr.pop()
                cand=[(inverse(a),inverse(b))]
                if name=="(2,4,4)": cand.append((b,a))  # swap corners A,B: swaps edges AB<->CA? edge AB<->edge BA... A<->B swaps edges CA<->CB and AB fixed; with g_BC=id need renormalize: g_BC'=t,g_AB'=s,g_CA'=id -> multiply by t^-1: (s t^-1, t^-1)... 
                if name=="(2,4,4)": cand.append((compose(a,inverse(b)),inverse(b)))
                if name=="(3,3,3)":
                    cand.append((compose(a,inverse(b)),inverse(b)))   # swap A,B
                    cand.append((inverse(a),compose(b,inverse(a))))   # swap C,B : edges AB<->AC, BC fixed
                for c in cand:
                    c=min((conj(c[0],g),conj(c[1],g)) for g in perms)
                    if c not in alts: alts.add(c);fr.append(c)
            seen|=alts
            # cone points
            angs=[]
            cones=[]
            for lab,p,k in (('A',sA,kA),('B',sB,kB),('C',sC,kC)):
                for c in cycles(p):
                    a=360*len(c)//k
                    cones.append((lab,set(c),a))
                    if a<360: angs.append(a)
            # degeneracy test
            degen=False
            for pi in invols:
                if compose(compose(s,pi),compose(s,pi))!=idp: continue
                if compose(compose(t,pi),compose(t,pi))!=idp: continue
                fixedAB={i for i in range(K) if s[i]==pi[i]}
                fixedCA={i for i in range(K) if t[i]==pi[i]}
                fixedBC={i for i in range(K) if pi[i]==i}
                ok=True
                for lab,S,a in cones:
                    if a>=360: continue
                    if lab=='A': hit=S&(fixedAB|fixedCA)
                    elif lab=='B': hit=S&(fixedAB|fixedBC)
                    else: hit=S&(fixedCA|fixedBC)
                    if not hit: ok=False;break
                if ok and (fixedAB or fixedCA or fixedBC): degen=True;break
            rows.append((tuple(sorted(angs,reverse=True)),degen,len(alts)))
    return rows
for K in [2,3,4,5,6]:
    print("=== K =",K)
    for name,orders in [("(2,4,4)",(2,4,4)),("(2,3,6)",(2,3,6)),("(3,3,3)",(3,3,3))]:
        rows=run(K,orders,name)
        agg=defaultdict(lambda:[0,0])
        for a,d,_ in rows: agg[a][1 if d else 0]+=1
        for a,(nd,d) in sorted(agg.items()):
            print(f"  {name} {a}  nondegenerate:{nd} degenerate:{d}")
