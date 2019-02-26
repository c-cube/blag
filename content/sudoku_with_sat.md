+++
date = 2019-02-19
title = "Solving Sudokus with msat"
slug = "sudoku-msat"
draft = true
[taxonomies]
author = ["simon"]
tags = ["ocaml","SAT","msat"]
+++

The glamorous world of [SAT](https://en.wikipedia.org/wiki/SAT_solver)
and [SMT solvers](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories)
is usually preoccupied with proving theorems, searching for software bugs,
verifying hardware, and other similarly serious business.

But today, we're going to solve Sudoku grids. My goal is to showcase
[mSAT](https://github.com/Gbury/mSAT), a parametrized SAT solver written
in OCaml
by my good friend [Guillaume Bury](https://gbury.eu/) and myself.
The solver's code can be found
[on github](https://github.com/Gbury/mSAT/blob/c39431315fb678789eb244704cda78eb45c7e6af/src/sudoku/sudoku_solve.ml),
but I'm going to detail the most salient parts here.

First, a demo: write a sudoku grid in this box, as a string of 81 characters,
and press "solve" to load the solver in your browser
(using [js_of_ocaml](https://github.com/ocsigen/js_of_ocaml),
which makes it 3~4 times slower than the native version).


<div>
<label for="gridInput">grid to solve:</label>
<input
  type="text" id="gridInput" pattern="^[.1-9]{81}$" placeholder="grid" tabindex=0>
</input>
<button id="gridInputEnter" tabindex=0>Solve</button>
<button id="gridInputClear" tabindex=0>Clear</button>
</div>
<canvas id='gridCanvas' width='600' height='300'></canvas>

<div id="gridSolution" style="font-family:mono; font-size: smaller;"></div>

A few difficult grids:

- <div class="grid">..............3.85..1.2.......5.7.....4...1...9.......5......73..2.1........4...9 </div>
- <div class="grid">.......12........3..23..4....18....5.6..7.8.......9.....85.....9...4.5..47...6... </div>
- <div class="grid">.2..5.7..4..1....68....3...2....8..3.4..2.5.....6...1...2.9.....9......57.4...9.. </div>
- <div class="grid">........3..1..56...9..4..7......9.5.7.......8.5.4.2....8..2..9...35..1..6........ </div>
- <div class="grid">12.3....435....1....4........54..2..6...7.........8.9...31..5.......9.7.....6...8 </div>
- <div class="grid">1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1 </div>
- <div class="grid">.......39.....1..5..3.5.8....8.9...6.7...2...1..4.......9.8..5..2....6..4..7..... </div>
- <div class="grid">12.3.....4.....3....3.5......42..5......8...9.6...5.7...15..2......9..6......7..8 </div>
- <div class="grid">..3..6.8....1..2......7...4..9..8.6..3..4...1.7.2.....3....5.....5...6..98.....5. </div>
- <div class="grid">1.......9..67...2..8....4......75.3...5..2....6.3......9....8..6...4...1..25...6. </div>
- <div class="grid">..9...4...7.3...2.8...6...71..8....6....1..7.....56...3....5..1.4.....9...2...7.. </div>
- <div class="grid">....9..5..1.....3...23..7....45...7.8.....2.......64...9..1.....8..6......54....7 </div>
- <div class="grid">4...3.......6..8..........1....5..9..8....6...7.2........1.27..5.3....4.9........ </div>
- <div class="grid">7.8...3.....2.1...5.........4.....263...8.......1...9..9.6....4....7.5........... </div>
- <div class="grid">3.7.4...........918........4.....7.....16.......25..........38..9....5...2.6..... </div>
- <div class="grid">........8..3...4...9..2..6.....79.......612...6.5.2.7...8...5...1.....2.4.5.....3 </div>
- <div class="grid">.......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6... </div>
- <div class="grid">.......12....35......6...7.7.....3.....4..8..1...........12.....8.....4..5....6.. </div>
- <div class="grid">1.......2.9.4...5...6...7...5.3.4.......6........58.4...2...6...3...9.8.7.......1 </div>
- <div class="grid">.....1.2.3...4.5.....6....7..2.....1.8..9..3.4.....8..5....2....9..3.4....67..... </div>


<script src="/sudoku_with_sat.js"></script>
