import itertools, sys, pickle
from collections import defaultdict
from tame2 import compose, inverse, cycles
def load(fn):
    rows=[]
    for line in open(fn):
        if ':' not in line: continue
        rest=line.split(':')[1]; a,b=rest.split('|')
        rows.append((tuple(int(x) for x in a.split()),tuple(int(x) for x in b.split())))
    return rows
def conj_to(sprime,srep):
    """g with g sprime g^-1 = srep (same cycle type)"""
    K=len(srep)
    c1=sorted(cycles(sprime),key=lambda c:(-len(c),c)); c2=sorted(cycles(srep),key=lambda c:(-len(c),c))
    g=[0]*K
    for a,b in zip(c1,c2):
        assert len(a)==len(b)
        for x,y in zip(a,b): g[x]=y
    return tuple(g)
def centralizer(s):
    K=len(s); cyc=cycles(s)
    bylen=defaultdict(list)
    for c in cyc: bylen[len(c)].append(c)
    # elements: for each length, permutation of cycles + rotation per cycle
    parts=[]
    for L,cs in bylen.items():
        opts=[]
        for perm in itertools.permutations(range(len(cs))):
            for rots in itertools.product(range(L),repeat=len(cs)):
                opts.append((L,cs,perm,rots))
        parts.append(opts)
    for combo in itertools.product(*parts):
        g=[None]*K
        for (L,cs,perm,rots) in combo:
            for j,c in enumerate(cs):
                target=cs[perm[j]]; r=rots[j]
                for idx,x in enumerate(c): g[x]=target[(idx+r)%L]
        yield tuple(g)
def canon(s,t,reps):
    key=tuple(sorted(len(c) for c in cycles(s)))
    srep=reps[key]
    g=conj_to(s,srep)
    gi=inverse(g)
    t2=compose(compose(g,t),gi)
    best=None
    for h in centralizer(srep):
        hi=inverse(h)
        t3=compose(compose(h,t2),hi)
        if best is None or t3<best: best=t3
    return (srep,best)
def classify(K,orders,name,rows,reps):
    kC,kA,kB=orders
    idp=tuple(range(K))
    def gen_inv(p,i):
        if i==K: yield tuple(p); return
        if p[i] is not None: yield from gen_inv(p,i+1); return
        p[i]=i; yield from gen_inv(p,i+1); p[i]=None
        for j in range(i+1,K):
            if p[j] is None:
                p[i]=j;p[j]=i; yield from gen_inv(p,i+1); p[i]=None;p[j]=None
    invols=list(gen_inv([None]*K,0))
    seen=set(); out=[]
    for (s,t) in rows:
        can=canon(s,t,reps)
        if can in seen: continue
        alts={can}; fr=[can]
        while fr:
            a,b=fr.pop()
            cand=[(inverse(a),inverse(b))]
            if name=="(2,4,4)": cand.append((compose(a,inverse(b)),inverse(b)))
            if name=="(3,3,3)":
                cand.append((compose(a,inverse(b)),inverse(b)))
                cand.append((inverse(a),compose(b,inverse(a))))
            for c in cand:
                c=canon(c[0],c[1],reps)
                if c not in alts: alts.add(c); fr.append(c)
        seen|=alts
        s,t=can
        sA=compose(inverse(t),s); sB=inverse(s); sC=t
        cones=[]
        for lab,p,k in (('A',sA,kA),('B',sB,kB),('C',sC,kC)):
            for c in cycles(p): cones.append((lab,frozenset(c),360*len(c)//k))
        pi_found=None
        for pi in invols:
            if compose(compose(s,pi),compose(s,pi))!=idp: continue
            if compose(compose(t,pi),compose(t,pi))!=idp: continue
            fAB={i for i in range(K) if s[i]==pi[i]}; fCA={i for i in range(K) if t[i]==pi[i]}; fBC={i for i in range(K) if pi[i]==i}
            ok=True
            for lab,S,a in cones:
                if a>=360: continue
                hit = S&(fAB|fCA) if lab=='A' else S&(fAB|fBC) if lab=='B' else S&(fCA|fBC)
                if not hit: ok=False;break
            if ok and (fAB|fCA|fBC): pi_found=pi;break
        angs=tuple(sorted([c[2] for c in cones if c[2]<360],reverse=True))
        out.append(dict(K=K,cell=name,s=s,t=t,cones=cones,pi=pi_found,angs=angs))
    return out
if __name__=="__main__":
    K=int(sys.argv[1])
    # cycle-type reps: minimal perm of each cycle type = read from all three files (s columns) and also compute generally
    reps={}
    allrows=[]
    files=[("(2,4,4)",(2,4,4),f"k{K}_244.txt"),("(2,3,6)",(2,3,6),f"k{K}_236.txt"),("(3,3,3)",(3,3,3),f"k{K}_333.txt")]
    # compute reps by brute force minimal perm per cycle type (K! perms) -- fine up to K=9
    import os
    if os.path.exists(f'reps{K}.txt'):
        for line in open(f'reps{K}.txt'):
            p=tuple(int(x) for x in line.split())
            if p: reps[tuple(sorted(len(c) for c in cycles(p)))]=p
    else:
        for p in itertools.permutations(range(K)):
            key=tuple(sorted(len(c) for c in cycles(p)))
            if key not in reps or p<reps[key]: reps[key]=p
    for name,orders,fn in files:
        rows=load(fn)
        cl=classify(K,orders,name,rows,reps)
        agg=defaultdict(lambda:[0,0])
        for r in cl: agg[r['angs']][1 if r['pi'] else 0]+=1
        print(f"=== K={K} {name}: {len(cl)} classes up to isometry")
        for a,(nd,d) in sorted(agg.items()): print(f"   {a}  nondegenerate:{nd} degenerate:{d}")
        allrows+=cl
    pickle.dump(allrows,open(f'rows_K{K}.pkl','wb'))
    print("total",len(allrows),"nondegenerate",sum(1 for r in allrows if r['pi'] is None))
