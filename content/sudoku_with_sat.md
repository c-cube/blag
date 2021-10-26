+++
date = 2019-02-26
title = "Solving Sudokus with msat"
slug = "sudoku-msat"
[taxonomies]
tags = ["ocaml","SAT","msat","simon"]
+++
The glamorous world of [SAT](https://en.wikipedia.org/wiki/SAT_solver)
and [SMT solvers](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories)
is usually preoccupied with proving theorems, searching for software bugs,
verifying hardware, and other similarly serious business.

But today, we're going to solve [Sudoku](https://en.wikipedia.org/wiki/Sudoku) grids. My goal is to showcase
[mSAT](https://github.com/Gbury/mSAT), a parametrized SAT solver written
in OCaml
by my good friend [Guillaume Bury](https://gbury.eu/) and myself.
The solver's code can be found
[on github](https://github.com/Gbury/mSAT/blob/c39431315fb678789eb244704cda78eb45c7e6af/src/sudoku/sudoku_solve.ml),
but I'm going to detail the most salient parts here.

<!-- more -->

## Demo

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

A few difficult grids ([from this repo](https://github.com/attractivechaos/plb/tree/master/sudoku)):

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

## Overview


The code responsible for the Sudoku solving itself fits in roughly 260 lines
of (relatively terse) OCaml. Most of the heavy work is delegated to **mSAT**,
which, being a SAT-solver, is very good at exploring large search spaces
and pruning branches — exactly what's useful for combinatorial problems
such as Sudoku solving.

mSAT is parametrized (using an [OCaml functor](https://v1.realworldocaml.org/v1/en/html/functors.html))
by a _theory_, i.e. a [decision procedure](https://en.wikipedia.org/wiki/Decision_procedure)
that gives additional meaning to the boolean variables the SAT solver manipulates.

In other words, the SAT solver is responsible for finding an assignment
of boolean variables (true or false) that will _satisfy_ a set of constraints.
But in our case, these variables have an additional meaning: they correspond to
parts of the sudoku. For each cell at `(x,y)`, there are 9 possible values,
so we create 9 boolean variables whose meaning is `(x,y) = i` for each `i`.
Then, the SAT solver is going to  enumerate boolean assignments of these
variables in an unspecified order; whenever some constraint is violated,
we'll give the SAT solver a **conflict** (a set of assignments that are incompatible)
to force it to change the assignment.

Let's dive into the code a bit more now.

### Cells

First, in the code, we have some boilerplate for cells (as private aliases
for integers between 0 (empty) and 9. The style is a bit verbose but
it's also very robust and forces creation of cells to go through `Cell.make`
which checks its validity.


```ocaml
module Cell : sig
  type t = private int
  val equal : t -> t -> bool
  val neq : t -> t -> bool
  val hash : t -> int
  val empty : t
  val is_empty : t -> bool
  val is_full : t -> bool
  val make : int -> t
  val pp : t Fmt.printer
end = struct
  type t = int
  let empty = 0
  let[@inline] make i = assert (i >= 0 && i <= 9); i
  let[@inline] is_empty x = x = 0
  let[@inline] is_full x = x > 0
  let hash = CCHash.int
  let[@inline] equal (a:t) b = a=b
  let[@inline] neq (a:t) b = a<>b
  let pp out i = if i=0 then Fmt.char out '.' else Fmt.int out i
end
```

So far, nothing particularly interesting. Let's look at grids.

### Grids

Grids are a bit more interesting, for several reasons.

First, I wrote this sudoku solver as a mean to test mSAT's API without writing
thousands of lines of code. It means that the Sudoku solver is going to
check the solution, and fail if the API had a bug that lead to an invalid solution.

Second, constraints over lines, columns, and squares, are very redundant.
To cut through the repetitions I use [sequence](https://github.com/c-cube/sequence/),
a very fast iterator library for OCaml
(see the slides of [old talk at OUPS 2014](https://simon.cedeela.fr/assets/talks/sequence.pdf)).
This makes the code a lot more compact, but also a bit harder to understand.
In a nutshell, a value of type `'a Sequence.t` is a series of values of type `'a`,
represented by a function `('a -> unit) -> unit` (an iter function).

Each set of cells that must be distinct (each column, row, and 3×3 square)
is represented as a sequence of cells. Then we just have to assert that
these sequences don't contain duplicates (see `all_distinct`).

The function `matches` checks that a grid with some undefined cells
matches a fully defined grid (i.e, so as to check that the solution  returned by the SAT solver
is actually a solution of the initial grid, on top of being valid).

Finally we have a pretty-printer and a parser for the 81-chars representation
of a grid.

```ocaml
module Grid : sig
  type t

  val get : t -> int -> int -> Cell.t
  val set : t -> int -> int -> Cell.t -> t

  (** A set of related cells *)
  type set = (int*int*Cell.t) Sequence.t

  val rows : t -> set Sequence.t
  val cols : t -> set Sequence.t
  val squares : t -> set Sequence.t

  val all_cells : t -> (int*int*Cell.t) Sequence.t

  val parse : string -> t
  val is_full : t -> bool
  val is_valid : t -> bool
  val matches : pat:t -> t -> bool
  val pp : t Fmt.printer
end = struct
  type t = Cell.t array

  let[@inline] get (s:t) i j = s.(i*9 + j)

  let[@inline] set (s:t) i j n =
    let s' = Array.copy s in
    s'.(i*9 + j) <- n;
    s'

  (** A set of related cells, with their positions *)
  type set = (int*int*Cell.t) Sequence.t

  open Sequence.Infix

  let all_cells (g:t) =
    0 -- 8 >>= fun i ->
    0 -- 8 >|= fun j -> (i,j,get g i j)

  let rows (g:t) =
    0 -- 8 >|= fun i ->
    ( 0 -- 8 >|= fun j -> (i,j,get g i j))

  let cols g =
    0 -- 8 >|= fun j ->
    ( 0 -- 8 >|= fun i -> (i,j,get g i j))

  let squares g =
    0 -- 2 >>= fun sq_i ->
    0 -- 2 >|= fun sq_j ->
    ( 0 -- 2 >>= fun off_i ->
      0 -- 2 >|= fun off_j ->
      let i = 3*sq_i + off_i in
      let j = 3*sq_j + off_j in
      (i,j,get g i j))

  let is_full g = Array.for_all Cell.is_full g

  (* does the grid satisfy the unicity constraints? *)
  let is_valid g =
    let all_distinct (s:set) =
      (s >|= fun (_,_,c) -> c)
      |> Sequence.diagonal
      |> Sequence.for_all (fun (c1,c2) -> Cell.neq c1 c2)
    in
    Sequence.for_all all_distinct @@ rows g &&
    Sequence.for_all all_distinct @@ cols g &&
    Sequence.for_all all_distinct @@ squares g

  (* does [g2] correspond to [g1] wherever [g1] is defined? *)
  let matches ~pat:g1 g2 : bool =
    all_cells g1
    |> Sequence.filter (fun (_,_,c) -> Cell.is_full c)
    |> Sequence.for_all (fun (x,y,c) -> Cell.equal c @@ get g2 x y)

  let pp out g =
    Fmt.fprintf out "@[<v>";
    Array.iteri
      (fun i n ->
         Cell.pp out n;
         if i mod 9 = 8 then Fmt.fprintf out "@,")
      g;
    Fmt.fprintf out "@]"

  (* parse a grid represented by 81 chars *)
  let parse (s:string) : t =
    if String.length s < 81 then (
      errorf "line is too short, expected 81 chars, not %d" (String.length s);
    );
    let a = Array.make 81 Cell.empty in
    for i = 0 to 80 do
      let c = String.get s i in
      let n = if c = '.' then 0 else Char.code c - Char.code '0' in
      if n < 0 || n > 9 then errorf "invalid char %c" c;
      a.(i) <- Cell.make n
    done;
    a
end
```

### Backtracking

Now for something completely different:

```ocaml
module B_ref = Msat_backtrack.Ref
```

This is a handy alias to a sub-library of mSAT, which provides a backtrackable
reference. This is going to be helpful to maintain the representation
of the current grid as we follow the SAT solver's exploration of the search
space.

For reference, the API of this "backtrackable reference" is:

```ocaml
module B_ref : sig
  type 'a t

  val create : ?copy:('a -> 'a) -> 'a -> 'a t
  (** Create a backtrackable reference holding the given value initially.
      @param copy if provided, will be used to copy the value when [push_level]
      is called. *)

  val set : 'a t -> 'a -> unit
  (** Set the reference's current content *)

  val get : 'a t -> 'a
  (** Get the reference's current content *)

  val update : 'a t -> ('a -> 'a) -> unit
  (** Update the reference's current content *)
    
  val push_level : _ t -> unit
  (** Push a backtracking level, copying the current value on top of some
      stack. The [copy] function will be used if it was provided in {!create}. *)

  val n_levels : _ t -> int
  (** Number of saved values *)

  val pop_levels : _ t -> int -> unit
  (** Pop [n] levels, restoring to the value the reference was storing [n] calls
      to [push_level] earlier.
      @raise Invalid_argument if [n] is bigger than [n_levels]. *)
end
```

Basically, you can update the reference, but you can also `push_level` (which creates
a backtracking point)
and `pop_levels` (which restores the reference to the state it had
`n` backtracking points earlier).


### The Solver

And now, the main dish: the solver itself! I'm going to cut it into several
parts to explain better.

```ocaml
module Solver : sig
  type t
  val create : Grid.t -> t
  val solve : t -> Grid.t option
end = struct
  …
```

Well the API is quite simple. A type `Solver.t`, a function to create it
with the initial (partial) grid, and a `solve` function which returns
a solution if there's one.


```ocaml
  …
  open Msat.Solver_intf

  (* formulas *)
  module F = struct
    type t = bool*int*int*Cell.t
    let equal (sign1,x1,y1,c1)(sign2,x2,y2,c2) =
      sign1=sign2 && x1=x2 && y1=y2 && Cell.equal c1 c2
    let hash (sign,x,y,c) = CCHash.(combine4 (bool sign)(int x)(int y)(Cell.hash c))
    let pp out (sign,x,y,c) =
      Fmt.fprintf out "[@[(%d,%d) %s %a@]]" x y (if sign then "=" else "!=") Cell.pp c

    (* negation: just flip the sign *)
    let neg (sign,x,y,c) = (not sign,x,y,c)

    let norm ((sign,_,_,_) as f) =
      if sign then f, Same_sign else neg f, Negated

    let make sign x y (c:Cell.t) : t = (sign,x,y,c)
  end
  …
```

Ah yes, this defines a notion of **formulas** (the boolean variables mentioned
earlier).
A formula, an atom of truth that the SAT solver is going to manipulate
and to assign to true or false, is here a tuple `(bool*int*int*Cell.t)`.

A value `(sign, x, y, c)` is the formula `(x,y) = c` (or `(x,y) != c` if `sign=false`).
We add a sign to it because it makes negation easy.
Eventually, once search has terminated successfully, we will have a collection
of true formulas (and one of false formulas, which are of little interest here).
These true formulas will describe the complete state of the grid.

Note that mSAT requires the atomic formulas to be comparable and hashable,
cheaply, if possible. It maintains an internal hash table to map these
formulas to its own internal representation of boolean variables.

```ocaml
  …

  module Theory = struct
    type proof = unit
    module Formula = F
    type t = {
      grid: Grid.t B_ref.t;
    }

    let create g : t = {grid=B_ref.create g}
    let[@inline] grid self : Grid.t = B_ref.get self.grid
    let[@inline] set_grid self g : unit = B_ref.set self.grid g

    let push_level self = B_ref.push_level self.grid
    let pop_levels self n = B_ref.pop_levels self.grid n

    let pp_c_ = Fmt.(list ~sep:(return "@ ∨ ")) F.pp
    let[@inline] logs_conflict kind c : unit =
      Log.debugf 4 (fun k->k "(@[conflict.%s@ %a@])" kind pp_c_ c)

    (* check that all cells are full *)
    let check_full_ (self:t) acts : unit =
      Grid.all_cells (grid self)
        (fun (x,y,c) ->
           if Cell.is_empty c then (
             let c =
               CCList.init 9
                 (fun c -> F.make true x y (Cell.make (c+1)))
             in
             Log.debugf 4 (fun k->k "(@[add-clause@ %a@])" pp_c_ c);
             acts.acts_add_clause ~keep:true c ();
           ))

    (* check constraints *)
    let check_ (self:t) acts : unit =
      Log.debugf 4 (fun k->k "(@[sudoku.check@ @[:g %a@]@])" Grid.pp (B_ref.get self.grid));
      let[@inline] all_diff kind f =
        let pairs =
          f (grid self)
          |> Sequence.flat_map
            (fun set ->
               set
               |> Sequence.filter (fun (_,_,c) -> Cell.is_full c)
               |> Sequence.diagonal)
        in
        pairs
          (fun ((x1,y1,c1),(x2,y2,c2)) ->
             if Cell.equal c1 c2 then (
               assert (x1<>x2 || y1<>y2);
               let c = [F.make false x1 y1 c1; F.make false x2 y2 c2] in
               logs_conflict ("all-diff." ^ kind) c;
               acts.acts_raise_conflict c ()
             ))
      in
      all_diff "rows" Grid.rows;
      all_diff "cols" Grid.cols;
      all_diff "squares" Grid.squares;
      ()

    let trail_ (acts:_ Msat.acts) = 
      acts.acts_iter_assumptions
      |> Sequence.map
        (function
          | Assign _ -> assert false
          | Lit f -> f)

    (* update current grid with the given slice *)
    let add_slice (self:t) acts : unit =
      trail_ acts
        (function
          | false,_,_,_ -> ()
          | true,x,y,c ->
            assert (Cell.is_full c);
            let grid = grid self in
            let c' = Grid.get grid x y in
            if Cell.is_empty c' then (
              set_grid self (Grid.set grid x y c);
            ) else if Cell.neq c c' then (
              (* conflict: at most one value *)
              let c = [F.make false x y c; F.make false x y c'] in
              logs_conflict "at-most-one" c;
              acts.acts_raise_conflict c ()
            )
        )

    let partial_check (self:t) acts : unit =
      Log.debugf 4
        (fun k->k "(@[sudoku.partial-check@ :trail [@[%a@]]@])" (Fmt.seq F.pp) (trail_ acts));
      add_slice self acts;
      check_ self acts

    let final_check (self:t) acts : unit =
      Log.debugf 4 (fun k->k "(@[sudoku.final-check@])");
      check_full_ self acts;
      check_ self acts
  end
  …
```

This is the _theory_, the core of the reasoning engine. It interacts with
the SAT solver's partial models (candidate assignments that might be solutions… or not).

There are two entry points here:

- `partial_check` is called with assignments of a _subset_ of the formulas,
  during the search. It means it's called very often, so it better be fast.
  Its job is to reject assignments that are obviously wrong.

  The call to `add_slice` updates the current model of the grid (which lives
  in a backtrackable reference, as sometimes the SAT solver undoes its
  previous choices) with the new decisions the SAT solver made.
  This might fail if a cell is assigned to two distinct values (look for "at-most-one"
  in the code); a clause `(x,y) != i OR (x,y) != j` is added, and the model
  is rejected.

  Otherwise, `check_` is called to verify that the row/column/square constraints are
  respected. If some constraint is not respected (say `(1,3)=7` and `(1,6)=7`,
  which means column 6 contains `7` twice), a clause is added to reject it:
  `(1,3) != 7 OR (1,6) != 7`; the model is rejected, the solver backtracks,
  and search resumes.

- `final_check` is called when mSAT has a _full model_ (all the formulas
  are true or false). If our Theory accepts this model, the search ends, and
  we can decode the bunch of true formulas into an actual grid.
  Otherwise, it means there is some validity issue, and we *must* raise a _conflict_,
  ie. reject the assignment.
  This can be more costly but it has to check the model fully, as it's
  potentially the last chance to reject an invalid model.

  In addition to calling `check_` like in `partial_check`, `final_check`
  also verifies that all cells are assigned (`check_full_`).
  If it's not the case, there's a cell `(x,y)` which is unassigned, and a
  clause `(x,y)=1 OR (x,y)=2 OR … OR (x,y)=9` is created and added
  to the SAT solver. Search then resumes.

These two functions are the heart and soul of the theory.
In a proper SMT solver (such as Z3, CVC4, Yices2, etc.), the hundreds of thousands of
lines of C or C++ are mostly dedicated to this part, and the SAT solver is
much smaller.

Finally, the wrapper code:

```ocaml
  …

  module S = Msat.Make_cdcl_t(Theory)

  type t = {
    grid0: Grid.t;
    solver: S.t;
  }

  let solve (self:t) : _ option =
    let assumptions =
      Grid.all_cells self.grid0
      |> Sequence.filter (fun (_,_,c) -> Cell.is_full c)
      |> Sequence.map (fun (x,y,c) -> F.make true x y c)
      |> Sequence.map (S.make_atom self.solver)
      |> Sequence.to_rev_list
    in
    Log.debugf 2
      (fun k->k "(@[sudoku.solve@ :assumptions %a@])" (Fmt.Dump.list S.Atom.pp) assumptions);
    let r =
      match S.solve self.solver ~assumptions with
      | S.Sat _ -> Some (Theory.grid (S.theory self.solver))
      | S.Unsat _ -> None
    in
    r

  let create g : t =
    { solver=S.create ~store_proof:false (Theory.create g); grid0=g }
end
```

We instantiate mSAT's functor over the `Theory` using `Msat.Make_cdcl_t`,
and wrap the `S.solve` function by asserting formulas that correspond to
the initial grid (i.e. if the initial grid contains 5 at position `(1,2)`,
we assume `(1,2)=5` to be true from the beginning).

If the solver returns `SAT`, we return the current Grid, since it should be full
and valid.

## Conclusion

This solver is not the most efficient. In practice, for Sudoku, it's faster
and simpler to encode the whole problem into SAT from the start ("bit-blasting")
and call minisat or some other state of the art SAT-solver.

But this way is more fun, and more flexible. I hope it demonstrates that writing
small CDCL(T) solvers (where `T` is whatever you want it to be, cough)
is not that hard. It also shows the abstraction power of OCaml's functors.
