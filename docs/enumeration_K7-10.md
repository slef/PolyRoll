# Tame convex polyhedra by max overlap thickness K = 7..10

Classes of degree-K branched covers of the three rotational cells with full holonomy, up to isometry.
Each row: cone-angle multiset (degrees) : number of non-degenerate polyhedra / number of doubly covered polygons.
Enumeration: enumK2.c (cycle-type representatives) + post8.py (cell symmetries, degeneracy test).

## K = 7: 14 polyhedra (4 non-degenerate, 10 doubly covered)
cell (2,4,4):
  [270, 180, 180, 90] : 0 non-degenerate / 2 doubly covered  (n = 4 vertices)
  [270, 270, 180, 180, 180] : 2 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [270, 270, 270, 180, 90] : 0 non-degenerate / 1 doubly covered  (n = 5 vertices)
cell (2,3,6):
  [240, 180, 180, 120] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 180, 60] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 180, 120, 120] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [300, 240, 240, 180, 120] : 0 non-degenerate / 1 doubly covered  (n = 5 vertices)
cell (3,3,3):
  [240, 240, 120, 120] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 240, 120] : 0 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [240, 240, 240, 240, 240, 240] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)

## K = 8: 17 polyhedra (9 non-degenerate, 8 doubly covered)
cell (2,4,4):
  [270, 180, 180, 90] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [270, 270, 90, 90] : 0 non-degenerate / 2 doubly covered  (n = 4 vertices)
  [270, 270, 180, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [270, 270, 270, 270, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)
cell (2,3,6):
  [240, 180, 180, 120] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 240, 120, 60] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [300, 240, 180, 180, 180] : 1 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [300, 240, 240, 180, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
cell (3,3,3):
  [240, 240, 120, 120] : 0 non-degenerate / 2 doubly covered  (n = 4 vertices)
  [240, 240, 240, 240, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [240, 240, 240, 240, 240, 240] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)

## K = 9: 17 polyhedra (11 non-degenerate, 6 doubly covered)
cell (2,4,4):
  [270, 180, 180, 90] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [270, 270, 180, 180, 180] : 1 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [270, 270, 270, 270, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)
cell (2,3,6):
  [240, 180, 180, 120] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 180, 180, 60] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [300, 240, 180, 180, 180] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 240, 240, 180, 120] : 1 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [300, 240, 240, 240, 240, 180] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)
cell (3,3,3):
  [240, 240, 120, 120] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 240, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [240, 240, 240, 240, 240, 240] : 1 non-degenerate / 0 doubly covered  (n = 6 vertices)

## K = 10: 28 polyhedra (20 non-degenerate, 8 doubly covered)
cell (2,4,4):
  [270, 270, 90, 90] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [270, 270, 180, 180, 180] : 2 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [270, 270, 270, 180, 90] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [270, 270, 270, 270, 180, 180] : 2 non-degenerate / 1 doubly covered  (n = 6 vertices)
cell (2,3,6):
  [240, 180, 180, 120] : 2 non-degenerate / 0 doubly covered  (n = 4 vertices)
  [240, 240, 180, 60] : 1 non-degenerate / 0 doubly covered  (n = 4 vertices)
  [240, 240, 240, 180, 180] : 3 non-degenerate / 1 doubly covered  (n = 5 vertices)
  [300, 180, 120, 120] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [300, 240, 120, 60] : 0 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [300, 300, 180, 180, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 300, 240, 120, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [300, 300, 240, 240, 180, 180] : 2 non-degenerate / 1 doubly covered  (n = 6 vertices)
  [300, 300, 240, 240, 240, 240, 240] : 1 non-degenerate / 0 doubly covered  (n = 7 vertices)
cell (3,3,3):
  [240, 240, 120, 120] : 1 non-degenerate / 1 doubly covered  (n = 4 vertices)
  [240, 240, 240, 240, 120] : 1 non-degenerate / 0 doubly covered  (n = 5 vertices)
  [240, 240, 240, 240, 240, 240] : 2 non-degenerate / 1 doubly covered  (n = 6 vertices)

## Counts K = 2..10 (total / non-degenerate)

K: 2:3/0  3:4/1  4:6/3  5:9/3  6:12/5  7:14/4  8:17/9  9:17/11  10:28/20

Observations: the doubly covered strip of K equilateral triangles (angles 60,60,120,120) occurs for every K (proof in summary);
a 7-vertex polyhedron first appears at K=10 (cell (2,3,6), angles 300,300,240,240,240,240,240).
