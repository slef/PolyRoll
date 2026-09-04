#!/usr/bin/env python3.11
"""Generate polyhedra/tameData.ts from the handoff package in docs/.

For every tame surface T_K^c_i (16 solids from docs/obj/*.obj and 32 doubly covered
polygons from the enumeration data) this script:
  1. unfolds the faces along a spanning tree and collects the holonomy (rolling) group H
     from the non-tree face adjacencies (same idea as docs/code/tamecheck.py);
  2. computes the translation lattice of H and its rotation centers, groups the centers
     into classes A/B/C (matching the corner labels of the enumeration data), and finds
     the rigid motion phi that maps the unfolding plane onto the standard cell tiling;
  3. emits, per face, an affine frame mapping standard tiling coordinates to 3D points
     on that face, so the app can paint the cells on the surface and drop the polyhedron
     onto the floor tiling in the right position.

Run:  python3.11 scripts/gen_tame_data.py
Needs numpy (no other dependencies; the sol_*.pkl files are not used).
"""
import itertools
import json
import math
import os
import re
import sys
from fractions import Fraction

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(ROOT, 'polyhedra', 'tameData.ts')

SQ3 = math.sqrt(3)
CELLS = {
    "(2,4,4)": ((2, 4, 4), {'C': (0, 0), 'A': (1, 0), 'B': (0, 1)}),
    "(2,3,6)": ((2, 3, 6), {'C': (0, 0), 'A': (1, 0), 'B': (0, SQ3)}),
    "(3,3,3)": ((3, 3, 3), {'C': (0, 0), 'A': (1, 0), 'B': (0.5, SQ3 / 2)}),
}
CELLCODE = {"(2,4,4)": "4", "(2,3,6)": "6", "(3,3,3)": "3"}
CODECELL = {v: k for k, v in CELLCODE.items()}
EDGES = {'AB': ('A', 'B'), 'BC': ('B', 'C'), 'CA': ('C', 'A')}
ROT_ORDER = {"(2,4,4)": 4, "(2,3,6)": 6, "(3,3,3)": 3}
CLASS_ORDER = {
    "(2,4,4)": {'A': 4, 'B': 4, 'C': 2},
    "(2,3,6)": {'A': 3, 'B': 6, 'C': 2},
    "(3,3,3)": {'A': 3, 'B': 3, 'C': 3},
}
# translation lattice of the rotation group, in standard coordinates
T_STD = {
    "(2,4,4)": [np.array([2.0, 0.0]), np.array([0.0, 2.0])],
    "(2,3,6)": [np.array([3.0, SQ3]), np.array([0.0, 2 * SQ3])],
    "(3,3,3)": [np.array([1.5, SQ3 / 2]), np.array([0.0, SQ3])],
}
# expected number of classes (cosets of T) per rotation order
EXPECTED_COSETS = {
    "(2,4,4)": {4: 2, 2: 2},
    "(2,3,6)": {6: 1, 3: 2, 2: 3},
    "(3,3,3)": {3: 3},
}


# ---------------------------------------------------------------- permutations
def compose(p, q):
    return tuple(p[q[i]] for i in range(len(p)))


def inverse(p):
    r = [0] * len(p)
    for i, x in enumerate(p):
        r[x] = i
    return tuple(r)


def cycles(p):
    n = len(p)
    seen = [False] * n
    cs = []
    for i in range(n):
        if not seen[i]:
            c = []
            j = i
            while not seen[j]:
                seen[j] = True
                c.append(j)
                j = p[j]
            cs.append(c)
    return cs


def make_row(K, cell, s, t, pi=None):
    """Rebuild the enumeration row (cone clusters + flatness witness) from (s, t)."""
    (kC, kA, kB), _ = CELLS[cell]
    sA = compose(inverse(t), s)
    sB = inverse(s)
    sC = t
    cones = []
    for lab, p, k in (('A', sA, kA), ('B', sB, kB), ('C', sC, kC)):
        for c in cycles(p):
            cones.append((lab, frozenset(c), 360 * len(c) // k))
    if pi is None:
        idp = tuple(range(K))
        for cand in itertools.permutations(range(K)):
            if compose(cand, cand) != idp:
                continue
            if compose(compose(s, cand), compose(s, cand)) != idp:
                continue
            if compose(compose(t, cand), compose(t, cand)) != idp:
                continue
            fAB = {i for i in range(K) if s[i] == cand[i]}
            fCA = {i for i in range(K) if t[i] == cand[i]}
            fBC = {i for i in range(K) if cand[i] == i}
            ok = True
            for lab, S, a in cones:
                if a >= 360:
                    continue
                hit = S & (fAB | fCA) if lab == 'A' else S & (fAB | fBC) if lab == 'B' else S & (fCA | fBC)
                if not hit:
                    ok = False
                    break
            if ok and (fAB | fCA | fBC):
                pi = cand
                break
    return dict(K=K, cell=cell, s=s, t=t, cones=cones, pi=pi)


def sorted_cones(row):
    cones = [c for c in row['cones'] if c[2] < 360]
    cones.sort(key=lambda c: -c[2])  # stable: same tie-break as alex.Surface
    return cones


# ---------------------------------------------------------------- flat polygons
def reflect(p, a, b):
    p, a, b = map(np.asarray, (p, a, b))
    d = b - a
    d = d / np.linalg.norm(d)
    v = p - a
    return a + 2 * np.dot(v, d) * d - v


def g_of(row, e):
    return {'BC': tuple(range(row['K'])), 'AB': row['s'], 'CA': row['t']}[e]


def cone_of(row, kind, i, lab):
    if kind == 'F':
        j = i
    else:
        j = i if lab in 'BC' else inverse(row['t'])[i]
    for c in row['cones']:
        if c[0] == lab and j in c[1]:
            return c
    raise RuntimeError('cone not found')


def flat_polygon(row):
    """Develop the front sheets of a doubly covered polygon; return (corner points CCW, cones)."""
    K, pi = row['K'], row['pi']
    _, base = CELLS[row['cell']]
    base = {L: np.array(base[L], float) for L in 'ABC'}

    def adj(i, e):
        j = pi[g_of(row, e)[i]]
        return None if j == i else j

    pos = {0: dict(base)}
    q = [0]
    while q:
        cur = q.pop(0)
        for e in ('AB', 'BC', 'CA'):
            nb = adj(cur, e)
            if nb is None or nb in pos:
                continue
            a, b = EDGES[e]
            third = [x for x in 'ABC' if x not in (a, b)][0]
            P = pos[cur]
            pos[nb] = {a: P[a], b: P[b], third: reflect(P[third], P[a], P[b])}
            q.append(nb)
    assert len(pos) == K, 'flat development incomplete'
    segs = []
    for i, P in pos.items():
        for e, (a, b) in EDGES.items():
            if pi[g_of(row, e)[i]] == i:
                segs.append((P[a], P[b], cone_of(row, 'F', i, a), cone_of(row, 'F', i, b)))
    # chain boundary segments into a cycle
    def key(p):
        return (round(float(p[0]), 5), round(float(p[1]), 5))
    ptcone = {}
    links = {}
    for p, qq, cp, cq in segs:
        ptcone[key(p)] = (p, cp)
        ptcone[key(qq)] = (qq, cq)
        links.setdefault(key(p), []).append(key(qq))
        links.setdefault(key(qq), []).append(key(p))
    start = next(iter(links))
    cyc = [start]
    prev = None
    while True:
        nxts = [k for k in links[cyc[-1]] if k != prev]
        prev = cyc[-1]
        nxt = nxts[0]
        if nxt == start:
            break
        cyc.append(nxt)
    pts = [ptcone[k][0] for k in cyc]
    cones = [ptcone[k][1] for k in cyc]
    area = 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0:
        pts.reverse()
        cones.reverse()
    # drop straight corners (cone angle 360 == interior angle 180)
    corners = []
    for i, p in enumerate(pts):
        a = pts[i - 1]
        b = pts[(i + 1) % len(pts)]
        cr = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
        straight = abs(cr) < 1e-7
        assert straight == (cones[i][2] >= 360), 'corner/cone mismatch'
        if not straight:
            corners.append((p, cones[i]))
    return corners


# ---------------------------------------------------------------- geometry helpers
def rot(th):
    c, s = math.cos(th), math.sin(th)
    return np.array([[c, -s], [s, c]])


def z_basis_2d(rows):
    """Z-basis (two integer vectors) of the lattice spanned by integer 2-vectors."""
    rows = [list(r) for r in rows if list(r) != [0, 0]]
    while True:
        nz = [r for r in rows if r[0] != 0]
        if len(nz) <= 1:
            break
        p = min(nz, key=lambda r: abs(r[0]))
        new = []
        for r in rows:
            if r is p or r[0] == 0:
                new.append(r)
                continue
            q = r[0] // p[0]
            new.append([r[0] - q * p[0], r[1] - q * p[1]])
        rows = [r for r in new if r != [0, 0]]
    p = [r for r in rows if r[0] != 0]
    rest = [r for r in rows if r[0] == 0]
    g = 0
    for r in rest:
        g = math.gcd(g, abs(r[1]))
    assert p and g > 0, 'translation lattice has rank < 2'
    return [p[0], [0, g]]


def gauss_reduce(a, b):
    a = a.copy()
    b = b.copy()
    if np.dot(a, a) > np.dot(b, b):
        a, b = b, a
    while True:
        m = round(np.dot(a, b) / np.dot(a, a))
        b = b - m * a
        if np.dot(b, b) >= np.dot(a, a) - 1e-12:
            return a, b
        a, b = b, a


def lattice_basis(vecs, maxden=64):
    vecs = [np.asarray(v, float) for v in vecs if np.linalg.norm(v) > 1e-6]
    u = vecs[0]
    v = None
    for w in vecs[1:]:
        if abs(u[0] * w[1] - u[1] * w[0]) > 1e-6:
            v = w
            break
    assert v is not None, 'all translations parallel'
    M = np.array([u, v]).T
    coeffs = []
    for w in vecs:
        c = np.linalg.solve(M, w)
        fr = [Fraction(x).limit_denominator(maxden) for x in c]
        assert all(abs(float(f) - x) < 1e-5 for f, x in zip(fr, c)), 'translations do not form a lattice (wild?)'
        coeffs.append(fr)
    den = 1
    for c in coeffs:
        for f in c:
            den = den * f.denominator // math.gcd(den, f.denominator)
    rows = [[int(f * den) for f in c] for c in coeffs]
    b = z_basis_2d(rows)
    t1 = (b[0][0] * u + b[0][1] * v) / den
    t2 = (b[1][0] * u + b[1][1] * v) / den
    return gauss_reduce(t1, t2)


def std_tiling(cell, bbox):
    """Reflect the base cell over the plane; return (triangles, {point: label})."""
    _, base = CELLS[cell]
    base = {L: np.array(base[L], float) for L in 'ABC'}
    x0, y0, x1, y1 = bbox
    def k(T):
        return frozenset((round(float(T[L][0]), 5), round(float(T[L][1]), 5)) for L in 'ABC')
    tris = [dict(base)]
    seen = {k(base)}
    q = [dict(base)]
    labels = {}
    while q:
        T = q.pop()
        for L in 'ABC':
            labels[(round(float(T[L][0]), 5), round(float(T[L][1]), 5))] = L
        for e, (a, b) in EDGES.items():
            c = [x for x in 'ABC' if x not in (a, b)][0]
            T2 = {a: T[a], b: T[b], c: reflect(T[c], T[a], T[b])}
            cen = sum(T2.values()) / 3
            if not (x0 - 1 < cen[0] < x1 + 1 and y0 - 1 < cen[1] < y1 + 1):
                continue
            kk = k(T2)
            if kk in seen:
                continue
            seen.add(kk)
            tris.append(T2)
            q.append(T2)
    return tris, labels


def std_label(labels, p, tol=1e-3):
    best, bestd = None, tol
    for (x, y), L in labels.items():
        d = math.hypot(x - float(p[0]), y - float(p[1]))
        if d < bestd:
            best, bestd = L, d
    return best


# ---------------------------------------------------------------- the analysis
def analyze(X, faces, cell, vertex_labels, expectedK, verbose=False):
    X = np.asarray(X, float)
    n = ROT_ORDER[cell]
    _, base = CELLS[cell]
    base = {L: np.array(base[L], float) for L in 'ABC'}
    m = len(faces)
    centroid = X.mean(axis=0)

    # ---- local 2D frames (as seen from outside) and directed-edge map
    dir_edges = {}
    for fi, f in enumerate(faces):
        for kk in range(len(f)):
            e = (f[kk], f[(kk + 1) % len(f)])
            assert e not in dir_edges, 'directed edge used twice'
            dir_edges[e] = fi
    loc, frames = [], []
    flat = m == 2
    for f in faces:
        a = X[f[0]]
        e1 = X[f[1]] - a
        e1 = e1 / np.linalg.norm(e1)
        nrm = np.cross(X[f[1]] - X[f[0]], X[f[2]] - X[f[1]])
        nrm = nrm / np.linalg.norm(nrm)
        if not flat:
            fc = X[f].mean(axis=0)
            assert np.dot(nrm, fc - centroid) > 0, 'face not CCW from outside'
        e2 = np.cross(nrm, e1)
        loc.append({v: np.array([np.dot(X[v] - a, e1), np.dot(X[v] - a, e2)]) for v in f})
        frames.append((a, e1, e2, nrm))
        # planarity check
        for v in f:
            assert abs(np.dot(X[v] - a, nrm)) < 1e-6, 'face not planar'

    # ---- unfold along a BFS spanning tree of faces (tree edges keyed by undirected edge)
    placed = {0: (np.eye(2), np.zeros(2))}

    def place_from(cur, j, u, v):
        M, t = placed[cur]
        Pu = M @ loc[cur][u] + t
        Pv = M @ loc[cur][v] + t
        Lu, Lv = loc[j][u], loc[j][v]
        d1, d2 = Lv - Lu, Pv - Pu
        assert abs(np.linalg.norm(d1) - np.linalg.norm(d2)) < 1e-6
        th = math.atan2(d2[1], d2[0]) - math.atan2(d1[1], d1[0])
        R = rot(th)
        return (R, Pu - R @ Lu)

    tree = set()
    q = [0]
    while q:
        cur = q.pop(0)
        f = faces[cur]
        for kk in range(len(f)):
            u, v = f[kk], f[(kk + 1) % len(f)]
            j = dir_edges[(v, u)]
            if j in placed:
                continue
            placed[j] = place_from(cur, j, u, v)
            tree.add(frozenset((u, v)))
            q.append(j)
    assert len(placed) == m

    # ---- holonomy generators from non-tree edges
    gens = []
    for (u, v), i in dir_edges.items():
        if u > v or frozenset((u, v)) in tree:
            continue
        j = dir_edges[(v, u)]
        R2, t2 = place_from(i, j, u, v)
        R1, t1 = placed[j]
        G = R2 @ R1.T
        ang = math.degrees(math.atan2(G[1, 0], G[0, 0])) % 360
        kq = round(ang * n / 360) % n
        err = (ang - kq * 360 / n) % 360
        assert min(err, 360 - err) < 1e-4, f'WILD: loop rotation {ang} not a multiple of {360 / n}'
        gens.append((kq, t2 - G @ t1))

    def R(k):
        return rot(2 * math.pi * k / n)

    def mul(g, h):
        return ((g[0] + h[0]) % n, R(g[0]) @ h[1] + g[1])

    def inv(g):
        return ((-g[0]) % n, -(R(-g[0]) @ g[1]))

    # ---- translation subgroup (Schreier generators) and its lattice
    ident = (0, np.zeros(2))
    reps = {0: ident}
    frontier = [0]
    while frontier:
        r0 = frontier.pop(0)
        for g in gens:
            r1 = (r0 + g[0]) % n
            if r1 not in reps:
                reps[r1] = mul(g, reps[r0])
                frontier.append(r1)
    assert len(reps) == n, 'rotation parts do not generate the full cyclic group'
    trans = []
    for r0, h in reps.items():
        for g in gens:
            r1 = (r0 + g[0]) % n
            sg = mul(inv(reps[r1]), mul(g, h))
            assert sg[0] == 0
            trans.append(sg[1])
    t1, t2 = lattice_basis(trans)
    Tm = np.array([t1, t2]).T
    covol = abs(np.linalg.det(Tm))
    area = 0.0
    for i, f in enumerate(faces):
        pts = [loc[i][v] for v in f]
        area += 0.5 * abs(sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1] for k in range(len(pts))))
    Kc = area * n / covol
    assert abs(Kc - expectedK) < 1e-4, f'thickness mismatch: computed {Kc}, expected {expectedK}'

    # ---- rotation centers, grouped into classes (cosets of T)
    def ekey(e):
        return (e[0], round(float(e[1][0]), 5), round(float(e[1][1]), 5))
    elems = {ekey(ident): ident}
    frontier = [ident]
    symbols = gens + [inv(g) for g in gens]
    for _ in range(5):
        nxt = []
        for h in frontier:
            for s in symbols:
                e = mul(s, h)
                kk = ekey(e)
                if kk not in elems:
                    elems[kk] = e
                    nxt.append(e)
        frontier = nxt

    def coords(p):
        return np.linalg.solve(Tm, p)

    def same_coset(p, q):
        c = coords(p - q)
        return np.all(np.abs(c - np.round(c)) < 1e-4)

    cosets = []  # dicts: rep, order, label

    def find_coset(p):
        for c in cosets:
            if same_coset(p, c['rep']):
                return c
        return None

    for e in elems.values():
        k, t = e
        if k == 0:
            continue
        c = np.linalg.solve(np.eye(2) - R(k), t)
        order = n // math.gcd(k, n)
        cs = find_coset(c)
        if cs is None:
            cosets.append(dict(rep=c, order=order, label=None))
        else:
            cs['order'] = max(cs['order'], order)
    got = {}
    for c in cosets:
        got[c['order']] = got.get(c['order'], 0) + 1
    assert got == EXPECTED_COSETS[cell], f'unexpected class structure {got}'

    # ---- label the classes using the polyhedron vertices (classes from the enumeration data)
    vpos = {}
    for j, f in enumerate(faces):
        Rj, tj = placed[j]
        for v in f:
            vpos.setdefault(v, Rj @ loc[j][v] + tj)
    for v, lab in enumerate(vertex_labels):
        cs = find_coset(vpos[v])
        assert cs is not None, f'vertex {v + 1} is not a rotation center'
        assert cs['order'] == CLASS_ORDER[cell][lab], f'vertex {v + 1} ({lab}) sits on an order-{cs["order"]} center'
        assert cs['label'] in (None, lab), f'vertex {v + 1}: class conflict'
        cs['label'] = lab
    for c in cosets:
        if c['label'] is not None:
            continue
        cands = [L for L, o in CLASS_ORDER[cell].items() if o == c['order']]
        if len(cands) > 1:
            used = {cc['label'] for cc in cosets if cc['label'] is not None and cc['order'] == c['order']}
            cands = [L for L in cands if L not in used]
        assert len(cands) == 1, f'cannot decide class of an order-{c["order"]} center (candidates {cands})'
        c['label'] = cands[0]

    # ---- pick a standard cell (c0, a0, b0) in the unfolding plane and the motion phi
    dCA = np.linalg.norm(base['A'] - base['C'])
    dCB = np.linalg.norm(base['B'] - base['C'])
    dAB = np.linalg.norm(base['B'] - base['A'])
    pts_by_label = {L: [] for L in 'ABC'}
    rng = range(-3, 4)
    for c in cosets:
        for i in rng:
            for j in rng:
                pts_by_label[c['label']].append(c['rep'] + i * t1 + j * t2)
    found = None
    for c0 in pts_by_label['C']:
        for a0 in pts_by_label['A']:
            if abs(np.linalg.norm(a0 - c0) - dCA) > 1e-5:
                continue
            for b0 in pts_by_label['B']:
                if abs(np.linalg.norm(b0 - c0) - dCB) > 1e-5 or abs(np.linalg.norm(b0 - a0) - dAB) > 1e-5:
                    continue
                u, w = a0 - c0, b0 - c0
                if u[0] * w[1] - u[1] * w[0] > 0:
                    found = (c0, a0, b0)
                    break
            if found:
                break
        if found:
            break
    assert found, 'no standard cell found'
    c0, a0, b0 = found
    Rphi = rot(-math.atan2((a0 - c0)[1], (a0 - c0)[0]))

    def phi(p):
        return Rphi @ (p - c0)
    assert np.linalg.norm(phi(b0) - base['B']) < 1e-5

    # centre the bottom face near the origin using a translation of the standard lattice
    g = np.mean([phi(vpos[v]) for v in faces[0]], axis=0)
    u1, u2 = T_STD[cell]
    tau = min((i * u1 + j * u2 for i in range(-6, 7) for j in range(-6, 7)), key=lambda t: np.linalg.norm(g - t))

    def phi2(p):
        return phi(p) - tau

    # ---- verification against the standard tiling
    allpts = [phi2(vpos[v]) for v in vpos] + [phi2(c['rep']) for c in cosets]
    lo = np.min(allpts, axis=0) - 2
    hi = np.max(allpts, axis=0) + 2
    _, labels = std_tiling(cell, (lo[0], lo[1], hi[0], hi[1]))
    for c in cosets:
        L = std_label(labels, phi2(c['rep']))
        assert L == c['label'], f'class {c["label"]} center maps to tiling label {L}'
    for v, lab in enumerate(vertex_labels):
        assert std_label(labels, phi2(vpos[v])) == lab
    for t in (t1, t2):
        c = np.linalg.solve(np.array(T_STD[cell]).T, Rphi @ t)
        assert np.all(np.abs(c - np.round(c)) < 1e-5), 'translation lattice does not match the standard one'

    # ---- per-face frames: standard tiling coords -> local 3D
    RphiT = Rphi.T
    out_frames, face_std = [], []
    for j, f in enumerate(faces):
        Rj, tj = placed[j]
        a, e1, e2, nrm = frames[j]

        def to3d(ps, Rj=Rj, tj=tj, a=a, e1=e1, e2=e2):
            p = RphiT @ (np.asarray(ps, float) + tau) + c0
            qq = Rj.T @ (p - tj)
            return a + qq[0] * e1 + qq[1] * e2
        O = to3d((0, 0))
        EX = to3d((1, 0)) - O
        EY = to3d((0, 1)) - O
        std = [phi2(Rj @ loc[j][v] + tj) for v in f]
        for v, s in zip(f, std):
            assert np.linalg.norm(O + s[0] * EX + s[1] * EY - X[v]) < 1e-6
        out_frames.append((O - centroid, EX, EY))
        face_std.append(std)
    if verbose:
        print(f'   K={Kc:.6f} n={n} covol={covol:.4f} gens={len(gens)} classes={[(c["label"], c["order"]) for c in cosets]}')
    return dict(vertices=X - centroid, frames=out_frames, face_std=face_std, K=Kc)


# ---------------------------------------------------------------- inputs
def load_obj(path):
    V, F = [], []
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            V.append([float(x) for x in p[1:4]])
        elif p[0] == 'f':
            F.append([int(x.split('/')[0]) - 1 for x in p[1:]])
    return np.array(V), F


def load_names():
    """old P/Q label and description per plain name."""
    old = {}
    for line in open(os.path.join(DOCS, 'naming_table.md')):
        parts = [x.strip() for x in line.split('|')]
        if len(parts) >= 6 and re.match(r'^[PQ]\d+$', parts[0]):
            old[parts[1]] = parts[0]
    desc = {}
    for line in open(os.path.join(DOCS, 'obj', 'README.md')):
        mm = re.match(r'- (T\d+_\d+_\d+)\.obj : \S+ \(was (\w+)\) - (.*)$', line.strip())
        if mm:
            desc[mm.group(1)] = mm.group(3).strip()
    return old, desc


def sup(s):
    return ''.join('⁰¹²³⁴⁵⁶⁷⁸⁹'[int(ch)] for ch in str(s))


def sub(s):
    return ''.join('₀₁₂₃₄₅₆₇₈₉'[int(ch)] for ch in str(s))


def fmt(x):
    v = round(float(x), 6)
    if v == 0:
        v = 0.0
    return repr(v)


def check_cell_coverage(entries, margin=1.5):
    """Mirror of polyhedra/cellTiling.ts generateCellTiling + clipConvex: every face must be
    fully covered by cell pieces (a face with no cells would be drawn as nothing)."""
    def clip(subj, poly):
        out = list(subj)
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            ex, ey = b[0] - a[0], b[1] - a[1]
            inside = lambda p: ex * (p[1] - a[1]) - ey * (p[0] - a[0]) >= -1e-9
            inp, out = out, []
            for j in range(len(inp)):
                cur, prev = inp[j], inp[j - 1]
                def inter(p, q):
                    dx, dy = q[0] - p[0], q[1] - p[1]
                    den = dx * ey - dy * ex
                    if abs(den) < 1e-12:
                        return q
                    t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den
                    return (p[0] + t * dx, p[1] + t * dy)
                if inside(cur):
                    if not inside(prev):
                        out.append(inter(prev, cur))
                    out.append(cur)
                elif inside(prev):
                    out.append(inter(prev, cur))
            if not out:
                break
        return out

    def area(p):
        return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))

    bad = []
    for e in entries:
        cell = e['cell']
        _, base0 = CELLS[cell]
        u, v = T_STD[cell]
        for j, poly in enumerate(e['faceStd']):
            poly = [tuple(map(float, p)) for p in poly]
            if area(poly) < 0:
                poly = poly[::-1]
            xs, ys = [p[0] for p in poly], [p[1] for p in poly]
            x0, y0, x1, y1 = min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            det = u[0] * v[1] - u[1] * v[0]
            i = round((cx * v[1] - cy * v[0]) / det)
            k = round((u[0] * cy - u[1] * cx) / det)
            t = i * u + k * v
            base = {L: np.array(base0[L], float) + t for L in 'ABC'}
            key = lambda T: frozenset((round(float(T[L][0]), 5), round(float(T[L][1]), 5)) for L in 'ABC')
            tris, seen, q = [dict(base)], {key(base)}, [dict(base)]
            while q:
                T = q.pop()
                for _, (a, b) in EDGES.items():
                    c = [x for x in 'ABC' if x not in (a, b)][0]
                    T2 = {a: T[a], b: T[b], c: reflect(T[c], T[a], T[b])}
                    cen = sum(T2.values()) / 3
                    if not (x0 < cen[0] < x1 and y0 < cen[1] < y1):
                        continue
                    kk = key(T2)
                    if kk in seen:
                        continue
                    seen.add(kk)
                    tris.append(T2)
                    q.append(T2)
            tot = 0.0
            for T in tris:
                tri = [tuple(T[L]) for L in 'ABC']
                if area(tri) < 0:
                    tri = tri[::-1]
                piece = clip(tri, poly)
                if len(piece) >= 3:
                    tot += abs(area(piece))
            if abs(tot - area(poly)) > 1e-4:
                bad.append(f"{e['id']} face {j + 1}")
    assert not bad, f'faces not covered by cells: {bad}'
    print(f'cell coverage OK for all faces of {len(entries)} surfaces')


def main():
    import pickle
    labels = pickle.load(open(os.path.join(DOCS, 'data', 'labels.pkl'), 'rb'))
    rows7 = pickle.load(open(os.path.join(DOCS, 'data', 'rows_K7.pkl'), 'rb'))
    pi7 = {(r['K'], CELLCODE[r['cell']], r['s'], r['t']): r['pi'] for r in rows7}
    old_names, descs = load_names()
    entries = []
    for (K, code, s, t), (idx, flat) in sorted(labels.items(), key=lambda kv: (kv[0][0], {'4': 0, '6': 1, '3': 2}[kv[0][1]], kv[1][1], kv[1][0])):
        cell = CODECELL[code]
        row = make_row(K, cell, s, t, pi7.get((K, code, s, t)))
        cones = sorted_cones(row)
        plain = f'T{K}^{code}_{idx}' + ('-f' if flat else '')
        fid = f'T{K}_{code}_{idx}' + ('f' if flat else '')
        print(f'{plain:12s} ({old_names.get(plain, "?")})', end=' ')
        if flat:
            corners = flat_polygon(row)
            n = len(corners)
            vertex_labels = [c[0] for c in cones]
            # vertex numbering: index in the sorted cone list
            num = {c: k for k, c in enumerate(cones)}
            order = [num[c] for _, c in corners]
            V = np.zeros((n, 3))
            for (p, c), k in zip(corners, order):
                V[k] = [p[0], 0.0, p[1]]
            front = order  # CCW in standard coords -> outward normal -y
            faces = [front, list(reversed(front))]
            shape = {3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon'}.get(n, f'{n}-gon')
            description = f'doubly covered {shape}'
        else:
            V, faces = load_obj(os.path.join(DOCS, 'obj', fid + '.obj'))
            vertex_labels = [c[0] for c in cones]
            assert len(V) == len(cones), f'{fid}: {len(V)} obj vertices vs {len(cones)} cones'
            description = descs.get(fid, '')
        angles = [c[2] for c in cones]
        res = analyze(V, faces, cell, vertex_labels, K, verbose=True)
        entries.append(dict(
            id=fid, name=plain, display=f'T{K}{sup(code)}{sub(idx)}' + ('-f' if flat else ''),
            K=K, cell=cell, cellOrder=int(code), index=idx, flat=flat,
            oldName=old_names.get(plain, ''), description=description,
            angles=angles, vertexClasses=vertex_labels,
            vertices=res['vertices'], faces=faces, faceStd=res['face_std'], frames=res['frames'],
        ))

    check_cell_coverage(entries)

    # ---- emit TypeScript
    lines = []
    lines.append('// GENERATED by scripts/gen_tame_data.py from docs/ (do not edit by hand).')
    lines.append('// Tame polyhedra T_K^c_i: convex surfaces whose rolling group is the rotation group of the')
    lines.append('// (2,4,4), (2,3,6) or (3,3,3) triangle tiling. Each face carries an affine frame mapping')
    lines.append('// standard tiling coordinates (sx, sy) to local 3D points: o + sx*ex + sy*ey.')
    lines.append('')
    lines.append("export type TameCell = '(2,4,4)' | '(2,3,6)' | '(3,3,3)';")
    lines.append("export type CornerClass = 'A' | 'B' | 'C';")
    lines.append('')
    lines.append('export interface TameFrame { o: number[]; ex: number[]; ey: number[] }')
    lines.append('')
    lines.append('export interface TameSurfaceData {')
    lines.append('  id: TameShapeId;')
    lines.append('  name: string;        // plain name, e.g. T5^6_2-f')
    lines.append('  display: string;     // unicode name, e.g. T5⁶₂-f')
    lines.append('  K: number;           // max overlap thickness')
    lines.append('  cell: TameCell;')
    lines.append('  cellOrder: number;   // 4, 6 or 3')
    lines.append('  index: number;')
    lines.append('  flat: boolean;       // doubly covered polygon')
    lines.append('  oldName: string;     // P/Q label in the handoff PDFs')
    lines.append('  description: string;')
    lines.append('  angles: number[];    // cone angles per vertex (vertex numbering of the PDFs)')
    lines.append('  vertexClasses: CornerClass[];')
    lines.append('  vertices: number[][];      // local 3D, centred at the vertex centroid')
    lines.append('  faces: number[][];         // vertex indices, CCW from outside; face 1 = faces[0]')
    lines.append('  faceStd: number[][][];     // per face, per vertex: standard tiling coordinates')
    lines.append('  frames: TameFrame[];       // per face: standard coords -> local 3D')
    lines.append('}')
    lines.append('')
    lines.append('export type TameShapeId =')
    for i, e in enumerate(entries):
        lines.append(f"  | '{e['id']}'" + (';' if i == len(entries) - 1 else ''))
    lines.append('')
    lines.append('export const TAME_SURFACES: TameSurfaceData[] = [')
    for e in entries:
        lines.append('  {')
        lines.append(f"    id: '{e['id']}', name: '{e['name']}', display: '{e['display']}',")
        lines.append(f"    K: {e['K']}, cell: '{e['cell']}', cellOrder: {e['cellOrder']}, index: {e['index']}, flat: {'true' if e['flat'] else 'false'},")
        lines.append(f"    oldName: '{e['oldName']}', description: {json.dumps(e['description'])},")
        lines.append(f"    angles: {json.dumps(e['angles'])}, vertexClasses: {json.dumps(e['vertexClasses'])},")
        lines.append('    vertices: [' + ', '.join('[' + ', '.join(fmt(x) for x in v) + ']' for v in e['vertices']) + '],')
        lines.append('    faces: ' + json.dumps(e['faces']) + ',')
        lines.append('    faceStd: [' + ', '.join('[' + ', '.join('[' + ', '.join(fmt(x) for x in p) + ']' for p in f) + ']' for f in e['faceStd']) + '],')
        lines.append('    frames: [')
        for (O, EX, EY) in e['frames']:
            lines.append('      { o: [' + ', '.join(fmt(x) for x in O) + '], ex: [' + ', '.join(fmt(x) for x in EX) + '], ey: [' + ', '.join(fmt(x) for x in EY) + '] },')
        lines.append('    ],')
        lines.append('  },')
    lines.append('];')
    lines.append('')
    with open(OUT, 'w') as fh:
        fh.write('\n'.join(lines))
    print(f'wrote {OUT} ({len(entries)} surfaces)')


if __name__ == '__main__':
    main()
