# Tame polyhedra / overlap thickness — handoff package (Sept 4, 2026)

Everything produced in the Claude sessions on general-unfolding overlap thickness, packaged for
further work (e.g. in Polyroll). Mathematical background: a closed flat surface has bounded max
overlap thickness iff its rolling (holonomy) group H is discrete ("tame"); then
K = area(P) / area(R^2/H) and P is a degree-K branched cover of one of the five closed flat
orbifolds. For convex polyhedra the possible cells are the doubled 45-45-90 (c=4), 30-60-90
(c=6) and equilateral (c=3) triangles.

Naming: T K ^c _i  (LaTeX: $TK^c_i$), suffix -f for flat (doubly covered polygon). K = thickness,
c = cell rotation order, i = index within (K,c): solids first, then flat, ordered by
(number of vertices, angle multiset descending). Full old->new table: naming_table.md.

## Layout

```
README.md                      this file
README_overnight.md            summary of the Sept 1 batch (families, prior work, caveats)
naming_table.md                old P/Q labels -> new T K^c_i names, with K, cell, angle sums
enumeration_K7-10.md           full tables for K = 7..10 (angle multisets, solid/flat counts)
coordinates_all12.txt          3D vertex coordinates + edge lists of T3^4_1 .. (old P1..P12)
figures/
  tame_polyhedra_solids_K3-7.pdf   16 pages, one per solid, lex order (K,c,i)
  tame_polyhedra_flat_K2-7.pdf     32 pages, one per doubly covered polygon
  page_<idx>.svg                   per-solid SVG sources (idx = old P-index-1; see naming_table)
  slit_torus_counterexample.*      the higher-genus counterexample figure
obj/
  T{K}_{c}_{i}.obj                 3D models, true faces CCW from outside, vertex order = PDF numbering
  README.md
data/
  sol_<idx>.pkl                    solved solids: (row, geodesic edges, faces, X (3D coords), triangles)
  rows_K7..K10.pkl                 all tame classes for K=7..10: s,t permutations, cone clusters, flat witness
  k{K}_{cell}.txt                  raw enumerator output (conjugacy-only classes) for K=7..10
  labels.pkl                       (K,c,s,t) -> (index, flat?) used by naming.py
  reps8.txt, reps10.txt            cycle-type representatives used by post8.py
code/
  enumK2.c, reps.c                 C enumerator (gcc -O2 -o enumK2 enumK2.c; ./enumK2 K kC kA kB)
  post8.py                         cell symmetries, flat test, angle lists  (python3 post8.py K)
  tame2.py, draw.py                original Python enumerator (K<=6) and cell/polygon utilities
  alex.py, runK.py, run1.py        geodesic enumeration + geodesic-triangulation search + exact
                                   trilateration realization (Alexandrov) with angle-sum check
  draw3.py, draw5.py, draw6.py     faces merge, edge-cut development on the lattice, page renderer
  draw4.py, draw7.py               tiling background; flat-polygon pages
  tamecheck.py                     DECISION PROCEDURE: any convex polyhedron (vertices, faces)
                                   -> tame/wild and exact K via loop holonomies (Schreier generators)
  naming.py                        the naming scheme
```

## Pipelines (how to regenerate / extend)

1. Enumerate tame classes for a K:  `./enumK2 K 2 4 4 > kK_244.txt` (and 2 3 6, 3 3 3), then
   `python3 post8.py K` -> rows_KK.pkl (needs reps for K>=10: `./reps K > repsK.txt`).
2. Solve a solid:  `python3 runK.py K which maxtris lenfactor` (which = index among non-degenerate
   rows of rows_KK.pkl; typical 22..28 and 1.6..2.4) -> solK{K}_{which}.pkl; copy to sol_<idx>.pkl
   and add a NAMES entry in draw6.py.  Solutions are verified by angle sums; also run tamecheck.py.
3. Render pages:  `python3 draw6.py out.pdf idx1 idx2 ...` (solids), draw7.py (flat).
4. Check any polyhedron:  `from tamecheck import analyze; analyze(X, faces)`.

## Data conventions (for reading the pickles)

* row dict: K, cell ("(2,4,4)" etc.), s, t (tuples = permutations of front sheets, see alex/draw:
  gluing across edge BC is the identity, across AB is s, across CA is t), cones = list of
  (corner label, frozenset of sheets, cone angle), pi = involution witnessing flatness or None.
* sol pickle: (row, Tg, faces, X, tf) with Tg the geodesic edges (pieces per cell in cell
  coordinates, endpoints u,v = vertex indices in the order of Surface(row).cones, i.e. decreasing
  cone angle, = vertex numbers 1.. on the pages), X the 3D vertex coordinates, tf the triangles
  (indices into X). Coplanar triangles are merged into true faces by draw3.merged_faces.

## Status / caveats

* All 16 solids (K<=7) pass the independent tamecheck (rotation parts quantized, lattice, K exact).
  One earlier wrong solution (old P14) was caught this way and replaced; angle-sum verification is
  now part of the solver.
* K = 8..10 classes are enumerated but not yet realized in 3D (pipeline ready; minutes per case).
* Names: within (K,c), surfaces with identical (vertex count, angle multiset) are ordered as
  enumerated; a canonical tiebreak (lexicographic (s,t)) is recommended before publication.
* The "wild => unbounded" direction (dense holonomy) rests on the two-vertex rolling lemma,
  not proved here; cf. Bicchi-Chitour-Marigo 2004 and Moore-Pach 2026 for the dense case.
