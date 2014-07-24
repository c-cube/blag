:author: simon
:date: 24-7-2014
:title: Introduction to Automated Theorem Proving with Logtk
:tags: ocaml,logic,proof,resolution,cnf,logtk

My PhD work is centered around
`automated theorem proving <http://en.wikipedia.org/wiki/Automated_theorem_proving>`_
in `first-order logic <http://en.wikipedia.org/wiki/First-order_logic>`_.
This is obviously a very cool topic (otherwise I wouldn't have focused on it),
so this post is a crash course (but the program won't crash because
I use ``OCaml``) on one of the most classic method to prove (some) theorems
automatically. I named... *resolution*!

The goal is to prove some (not too complicated) theorems automatically.
In other words, we want a program that reads a bunch of axioms and a formula
that we conjectured is a theorem following from the axioms,
and then tries to produce a proof of the theorem. In practice it's almost always
done by *refutation*: to prove that `Γ ⊢ F` (formula `F` is a theorem
under axioms `Γ`), we try to deduce `⊥` (false) from `Γ, ¬F`). The
applications for this kind of technology are multiple, but afaik
the prominent one is *software veriication* — aims at formally proving that
a program satisfies a specification ("not crashing" is a good start).
There has been a lot of research in this area for decades, but the problem
is extremely hard (only *semi-decidable*: you will find a solution eventually
if the problem is a theorem, but might run forever otherwise).

In this post I will mostly present the code for a very simple (and naive, too)
theorem prover in OCaml, using my library
`Logtk <https://www.rocq.inria.fr/deducteam/Logtk/index.html>`_. I assume
the reader has some basic knowledge of first-order logic (quantifiers `∀` and
`∃`, logic connectives `¬`, `∨`, `∧` and `⇒`, and the notion of **term**).
The code is available in `Logtk itself <https://github.com/c-cube/logtk/blob/923411f30cdf6a4085cff19615dd31606543270e/src/demo/resolution/resolution1.ml>`_
(`raw version <https://raw.githubusercontent.com/c-cube/logtk/923411f30cdf6a4085cff19615dd31606543270e/src/demo/resolution/resolution1.ml>`_). If you
installed the most recent version (0.5.1) of ``Logtk``, it should compile
using

.. code-block:: sh

    $ ocamlbuild -use-ocamlfind -package logtk,logtk.parsers \
        resolution1.native

You can test it on easy problems defined in the `TPTP syntax <http://tptp.org/>`_,
for instance some of the `Pelletier Problems <http://cedeela.fr/~simon/files/pelletier_problems_1_to_47.tgz>`_ (some of which are too hard for the prover!).
TPTP is also an archive with literally thousands of problems (from easy
to very hard) in the common syntax described above.

Preamble
--------

Rename a few modules for convenience. ``CCError`` comes from
`ocaml-containers <https://github.com/c-cube/ocaml-containers>`_.

.. code-block:: ocaml

   module Err = CCError
   module T = Logtk.FOTerm
   module F = Logtk.Formula.FO
   module Substs = Logtk.Substs
   module Unif = Logtk.Unif
   module Util = Logtk.Util


Basic Blocks
------------

We start with basic building blocks that are mostly provided by ``Logtk``.
Resolution is a *clausal calculus*, that is, it deals with first-order
clauses. A clause is a disjunction of *literals* (atomic formulas
or negated atomic formulas). Let's see.

First, we define a global **signature**
(maps symbols such as `f`, `parent_of` or `greater`
to their type). Every symbol has exactly one type.  The initial signature is
the ``TPTP`` signature (logic connectives)

.. code-block:: ocaml

    let _signature = ref Logtk.Signature.TPTP.base

We do not have to do anything about terms, because they are already defined in
``Logtk.FOTerm`` (which was renamed ``T`` above). Terms are either variables or
applications of a constant (symbol) to a list of sub-terms.

Some examples of terms would be (capitalized letter are variables):

* `Y` (a variable)
* `the_universe` (a constant)
* `f(X, g(X,a))` (function applications)
* `age_of(grandmother_of(frida))`

Literals
^^^^^^^^

Then we have to represent literals, because ``Logtk`` doesn't (the
representation would be too specific).  A literal is an atomic proposition
(term of type ``$o`` in ``TPTP``, i.e. the type of
propositions), or its negation. We represent this as a pair of
type ``FOTerm.t * bool`` (term + sign).

Examples:

* `older_than(obama, bieber)`
* `¬ lives_in(paris, poutine)`

.. code-block:: ocaml

    module Lit = struct
      type t = T.t * bool

      (** We also define a few basic comparison and printing functions.
          Comparison functions are used by many data structures;
          Printing is useful for informing the user of results or
          for debugging. *)

      let compare = CCOrd.pair T.cmp CCOrd.bool_
      let equal a b = (compare a b) = 0

      let pp buf (t,b) =
        Printf.bprintf buf "%s%a"
            (if b then "" else "¬") T.pp t
    end

Clauses
^^^^^^^

A clause is a disjunction ("or") of literals. We will simply use a list
of literals.

Examples:

- `¬ lives_in(paris, X) ∨ eats_baguette(X)`
  (means "forall X, if X lives in Paris then X eats baguette")
- `greater_than(successor(X), X)` (property on integers)

The whole `Peano arithmetic <http://en.wikipedia.org/wiki/Peano_axioms>`_
(excluding induction which is not first-order logic) would look like:

1. `nat(0)`
2. `X = X`
3. `¬ (X = Y) ∨ Y = X`
4. `¬ (X = Y) ∨ ¬ (Y = Z) ∨ (X = Z)`
5. `¬ nat(X) ∨ ¬ (X = Y) ∨ nat(Y)`
6. `nat(succ(N))`
7. `¬ (succ(N) = 0)`
8. `¬ (succ(M) = succ(N)) ∨ (M = N)`


.. code-block:: ocaml

    module Clause = struct
      type t = Lit.t list

      let make l = CCList.Set.uniq ~eq:Lit.equal l
      let compare = CCOrd.list_ Lit.compare
      let equal a b = compare a b = 0

      let is_trivial c =
        List.exists
          (fun (t,b) ->
            b &&
            List.exists (fun (t',b') -> not b' && T.eq t t') c
          ) c

      let apply_subst ~renaming subst c s_c =
        let c =  List.map
          (fun (t,b) -> Substs.FO.apply ~renaming subst t s_c, b)
          c
        in make c

      (** printing a clause: print literals separated with "|" *)
      let pp buf c = CCList.pp ~sep:" | " Lit.pp buf c

      (** Conversion from list of atomic formulas.
          type: [Formula.t list -> clause] *)
      let _of_forms c =
        let _atom f = match F.view f with
          | F.Not f' ->
              begin match F.view f' with
              | F.Atom t -> t,false
              | _ -> failwith "unsupported formula"
              end
          | F.Atom t -> t, true
          | _ -> failwith "unsupported formula"
        in
        make (List.map _atom c)
    end

Some parts of this module introduce new concepts. First, **triviality**,
then, **substitutions**.

- A clause is trivial if it contains both a literal and its opposite.  It means
  the clause is tautological, that is, always true; we can dispose of it because
  resolution is about **refutation** (deduce `⊥` from hypothesis).
  The function ``Clause.is_trivial`` checks whether this simple criterion
  holds.
- A substitution maps some variables to terms. Here the function ``Clause.apply-subst``
  will be used to **apply** the substitution to a clause — replace variables
  of the clause by their image in the substitution (or keep them unchanged if
  they do not appear in the substitution.  Substitutions are pre-defined in
  Logtk, and applying a substitution to a term is defined too (the function
  ``Subst.FO.apply`` that applies a substitution to a first-order term)

Managing the Proof State
------------------------

We have defined basic types, so we are ready to deal with more serious
problems. The **resolution calculus** is based on **saturation**. It
means that, given some *inference rules*, that deduce clauses from other
clauses (deduction), we compute the least fix point of a set `S` of clauses
with respect to those rules.

In other words, every time we can deduce a new clause `C` using
inferences on the set `S`, we add `C` to `S`. The process stops
when we find the **empty clause** (equivalent to `⊥`, or "false")
or when a fixpoint is reached (every clause we deduce is already
in the set `S`).

In practice, we use the so-called "given clause algorithm".
The *proof state* is composed of two disjoint sets:

- the *active set* contains clauses that have been processed (they
  are "active clauses"). It means we already made all possible
  inferences between the active clauses.
- the *passive set* contains clauses that have not been processed yet. Initially
  it contains all the input clauses (those from the problem to solve).

The main loop will transfer clauses from the passive set, to the active set,
one-by-one. The current clause is called "given clause" (hence the name).

Utils
^^^^^

We need a few more types and modules to deal with the sets of clauses:

- A type ``Clause.t * int``  is used to refer to a specific literal within
  a specific clause. We will see why later. See the module ``ClauseWithPos``.
- A *term index* is used to query those literals by their term. Indexing
  is a crucial part of any real theorem prover.  An index is basically a
  multimap from ``FOTerm.t`` to ``Clause.t * int``. When we process a clause
  `c`, for each literal ``(term,sign)`` at position `i` in the clause `c`,
  we add the binding `term → (c, i)` into the index.
  Later we will be able to retrieve the pair
  `(c,i)` using any term that **unifies** with `term`.

.. code-block:: ocaml

   module ClauseWithPos = struct
     type t = Clause.t * int
     let compare = CCOrd.pair Clause.compare CCInt.compare
   end

   module Index = Logtk.NPDtree.MakeTerm(ClauseWithPos)

   (** Set of clauses. Easy to define thanks to {!Clause.compare} *)
   module ClauseSet = Set.Make(Clause)

Sets of Clauses
^^^^^^^^^^^^^^^

- We keep an index, ``_idx``, over every atomic term in the set of active
  clauses;
- We also keep the set of those clauses to be able to check whether a new clause
  is already processed or not;
- Last, a queue is used for *passive clauses*.

The exception ``Unsat`` is used for early exit, in case the empty clause
is found.

.. code-block:: ocaml

   let _idx = ref (Index.empty())
   let _active_set = ref ClauseSet.empty
   let _passive_set = Queue.create()

   exception Unsat

   (** add [c] to the passive set, if not already present in
       the active set nor it is trivial. *)
   let _add_passive c =
     if c = [] then raise Unsat
     else if Clause.is_trivial c
     then (
       Util.debug 4 "clause %a is trivial" Clause.pp c;
     )
     else if not (ClauseSet.mem c !_active_set)
     then (
       Util.debug 4 "new passive clause %a" Clause.pp c;
       Queue.push c _passive_set
     )

   (** When we process a clause [c], we put it into the
        active set (set of processed clauses). That also
        means every literal [(term,sign)]
        at index [i] will go into the index, so we can
        retrieve [c] by its literals later.
   *)
   let _add_active c =
     _active_set := ClauseSet.add c !_active_set;
     List.iteri
       (fun i (t,_) -> _idx := Index.add !_idx t (c,i))
       c


The Resolution Calculus
-----------------------

Inference rules: Explanations
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Here we are at long last! Resolution, a very old calculus (back to the sixties,
when Robinson invented it), only requires two inference rules
to be *complete* (i.e., be able to **eventually** prove any theorem).
Those rules are **factoring** and **resolution**.

The **factoring** rule looks like:

:: 

  A ∨ A' ∨ C
  ---------------
  σ (A' ∨ C)

  if σ(A) = σ(A')

It means means that if the clause has two positive literals ``A`` and ``A'``
with some substitution `σ`, such that `σ(A) = σ (A')`,
then we can *factor* those literals into `σ(A)` provided we also
apply `σ` to the rest of the clause. This kind of rule
reads from top (premises) to bottom (conclusion).

The **resolution** rule between two clauses `a ∨ C` and `¬ a' ∨ D`,
where `a` and `a'` are literals and `C`, `D` clauses, is

::

    A ∨ C    ¬A' ∨ D
    ------------------
      σ(C ∨ D)

    if σ(A) = σ(A')

This rule "resolves" together two complementary literals in
two clauses (assuming those clauses do not share variables).
    
Let us explain in the propositional case (ignoring variables), assuming
:math:`a = a'`. The idea is, roughly:

* We know that either `a` or either `¬ a` is true
  (excluded middle)
* If `a` is true, it means that :math:`¬a' ∨ D`
  can only be true if `D` is true (since `a = a' = ⊤`). Therefore
  `D` must be true.
* If `a` is false, then :math:`a ∨ C` can only be true if `C` is true;
  therefore `C` holds.
* By excluded middle one of those must be true, so in any
  case `C ∨ D` is true. Hence the conclusion.

For the first-order case, we compute the *most general unifier* of
`a` and `a'` (if it exists), and call this unifier substitution `σ`.
Then, the reasoning is the same as in the propositional case since
the literals are actually equal.

**Note**: the `0` and `1` are *scopes*, a trick I use to avoid actually
renaming variables in one of the clauses. More details can be found
in the documentation for ``Substs`` or in the talk I gave at PAAR 2014.

Inference Rules: implementation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The corresponding code:

.. code-block:: ocaml

    let _factoring c =
      List.iteri
        (fun i (t,b) ->
          if b then List.iteri
            (fun j (t',b') ->
              (** Only try the inference if the two literals have
                  positive sign. The restriction [i < j] is used
                  not to do the same inference twice (symmetry).
              *)
              if i<j && b'
              then try
                let subst = Unif.FO.unification t 0 t' 0 in
                (** Now we have subst(t)=subst(t'),
                    the inference can proceed *)
                let c' = CCList.Idx.remove c i in
                let renaming = Substs.Renaming.create() in
                (** Build the conclusion of the inference (removing
                    one of the factored literals *)
                let c' = Clause.apply_subst ~renaming subst c' 0 in
                Util.debug 3 "factoring of %a ----> %a"
                    Clause.pp c Clause.pp c';
                (** New clauses go into the passive set *)
                _add_passive c'
              with Unif.Fail -> ()
            ) c
        ) c

    let _resolve_with c =
      List.iteri
        (fun i (t,b) ->
          (** Retrieve within the index, mappings
              [term -> (clause,index)]
              such that [term] unifies with [t].
              0 and 1 are again scopes. *)
          Index.retrieve_unifiables !_idx 0 t 1 ()
            (fun () _t' (d,j) subst ->
              let (_,b') = List.nth d j in
              (** We have found [_t'], and a pair [(d, j)] such
                  that [d] is another clause, and the
                  [j]-th literal of [d] is [_t', b']).
                  If [b] and [b'] are complementary we are in
                  the case where resolution applies.
              *)
              if b<>b'
              then (
                let renaming = Substs.Renaming.create() in
                (** Build the conclusion clause, merging the
                    remainders [c'] and [d'] (which live respectively
                    in scope 1 and 0) of the clauses together after
                    applying the substitution. *)
                let concl =
                  (let c' = CCList.Idx.remove c i in
                   Clause.apply_subst ~renaming subst c' 1)
                  @
                  (let d' = CCList.Idx.remove d j in
                   Clause.apply_subst ~renaming subst d' 0)
                in
                (** Simplify the resulting clause (remove duplicate
                    literals) and add it into the passive set,
                    to be processed later *)
                let concl = Clause.make concl in
                Util.debug 3 "resolution of %a and %a ---> %a"
                  Clause.pp c Clause.pp d Clause.pp concl;
                _add_passive concl
              )
            )
        ) c

Saturation Loop
^^^^^^^^^^^^^^^

Main saturation algorithm, a simple "given clause" loop. This is
the outer loop of the resolution procedure: given an initial
set of clauses `S`, the algorithm does:
      
- add all the clauses into the passive set
- while some passive clauses remain unprocessed, pick one of them,
  call it `C`, and then do the following:

  + add `C` into the active set
  + perform inferences between `C` and the active set (including `C` itself)
  + add the resulting new clauses to `S`.

- if at any point the empty clause `⊥` is found, then
  the initial set of clauses is unsatisfiable (absurd).
- otherwise, if the loop stops, we have computed a fixpoint of the
  initial clauses with respect to inferences without finding `⊥`,
  which means the original set of clauses is satisfiable (admits a model)

.. code-block:: ocaml

    let _saturate clauses =
      List.iter _add_passive clauses;
      try
        while not (Queue.is_empty _passive_set) do
          let c = Queue.pop _passive_set in
          (** Is the clause [c] suitable for processing?
              It must not be processed yet and
              not be trivial either. *)
          if not (Clause.is_trivial c) &&
             not (ClauseSet.mem c !_active_set)
          then (
            Util.debug 2 "given clause: %a" Clause.pp c;
            _add_active c;
            _resolve_with c;
            _factoring c;
          )
        done;
        `Sat
      with
      | Unsat -> `Unsat

Main, Options, and other Boring Stuff
-------------------------------------

We only need to define the glue code that reads a file, converts it
into clauses, and calls ``saturate`` to do the real job. Note the
use of an error monad. ``Logtk`` provides type inference and an algorithm
to transform arbitrary formulas to clauses ("CNF").

.. code-block:: ocaml

   (** Read the problem to solve from the file [f],
        (try to) solve it and return the result.
        We use an error monad to make error handling easier (the
        function [>>=] is a {i monadic bind}). *)
   let process_file f =
     Util.debug 2 "process file %s..." f;
     let open Err in
     let res =
       (** parse the file in the TPTP format *)
       Logtk_parsers.Util_tptp.parse_file ~recursive:true f 
       (** Perform type inference and type checking (possibly updating
           the signature) *)
       >>= Logtk_parsers.Util_tptp.infer_types (`sign !_signature)
       (** CNF ("clausal normal form"). We transform
           arbitrary first order formulas into a set of
           clauses (see the {!Clause} module)
           because resolution only works on clauses.
        
           This algorithm is already implemented in {!Logtk}. *)
       >>= fun (signature, statements) ->
       let clauses =
         Logtk_parsers.Util_tptp.Typed.formulas statements in
       let clauses = Sequence.to_list clauses in
       (** A way to create fresh symbols for {i Skolemization} *)
       let ctx = Logtk.Skolem.create ~prefix:"sk" signature in
       let clauses = Logtk.Cnf.cnf_of_list ~ctx clauses in
       let clauses = CCList.map Clause._of_forms clauses in
       _signature := Logtk.Skolem.to_signature ctx;
       (** Perform saturation (solve the problem) *)
       Err.return (_saturate clauses)
     in
     match res with
     | `Error msg ->
         print_endline msg;
         exit 1
     | `Ok `Sat -> print_endline "sat"
     | `Ok `Unsat -> print_endline "unsat"

   (** Parse command-line arguments, including the file to process *)

   let _options = ref (
     [] @ Logtk.Options.global_opts
     )
   let _help = "usage: resolution file.p"
   let _file = ref None

   let _set_file f = match !_file with
     | None -> _file := Some f
     | Some _ -> failwith "can only deal with one file"

   let main () =
     Arg.parse !_options _set_file _help;
     match !_file with
     | None -> print_endline _help; exit 0
     | Some f -> process_file f

   let () = main()

Conclusion
----------

I wrote this program in a short lapse of time, to illustrate
how ``Logtk`` could be used. The result is very naive and has no chance of
competing with real provers (such as `E <eprover.org>`_). Still, I hope
this post will shine some light on the domain of automated theorem
proving and maybe — who knows? — get some people interested in the domain.
I should point out that I wrote a more serious prover, `Zipperposition <https://github.com/c-cube/zipperposition/>`_,
using Logtk.

thanks to nicoo and Enjolras on freenode for their second reading.
