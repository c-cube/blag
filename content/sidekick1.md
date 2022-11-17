+++
date = 2022-11-14
title = "Sidekick project, part 1"
slug = "sidekick-part-1"
draft = true
[taxonomies]
authors = ["simon"]
tags = ["ocaml","smt","sidekick"]
+++

I've been working for years on 
[sidekick](https://github.com/c-cube/sidekick/).
It's getting tiresome to put so much effort into a project in the dark, so here's some basic journaling/rambles about it.

So what's Sidekick? At first, and for a while, it was an attempt at writing a
[SMT](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories) solver, in OCaml,
following the CDCL(T) paradigm, and in a _functorized_ way. I've gone back on at
least the last point, and the CDCL(T) part might be revisited soon.

<!-- more -->

So let's talk a bit more about that. First we'll scratch the surface of what
a SMT solver is and does. Then we'll discuss a bit the goals of Sidekick as a project.

# Quick overview of SMT solving

A SMT solver is a program that tries to determine the _satisfiability_
of a logic formula.
That means, finding out if the formula is _satisfiable_ (admits a model; in other words, a solution),
or _unsatisfiable_ (has no model).

For example, this is a tiny problem involving boolean variables `a` and `b`,
where it turns out that $(a \lor b) \land \lnot a \land \lnot b$ is impossible[^1].
The problem is expressed in SMTLIB-2.6 syntax, which is based on S-expressions
because it's simple to parse:

```scheme
; file: pb1.smt2
(declare-fun a () Bool)
(declare-fun b () Bool)
(assert (and (or a b) (and (not a) (not b))))
(check-sat)
```

easily solved by Sidekick in 0s:

```sh
$ sidekick pb1.smt2
unsat
; (0.000/0.000/0.000)
```

A sligtly more sophisticated problem might involve equality and function symbols
(a theory called "EUF"):


```scheme
; file: pb2.smt2
(declare-sort tau 0)
(declare-fun a () tau)
(declare-fun f (tau) tau)
(assert (= (f (f (f a))) a))
(assert (= (f (f a)) a))
(assert (not (= (f a) a)))
(check-sat)
```

This is a proof that, _for any $f$ and $a$_, if $f^3(a)=a$ and $f^2(a)=a$, then $f(a)=a$.
It proceeds by refutation, asserting the negation of the conjecture and aiming
at obtaining "unsat".
Solving it with Sidekick looks like that:

```sh
$ sidekick pb2.smt2
unsat
; (0.003/0.001/0.000)
```

SMT solving is a difficult problem (NP complete) and
more engineering-heavy than [SAT-solving](https://en.wikipedia.org/wiki/SAT_solver), of
which it is an extension.
Any SAT problem is a SMT problem, but most SMT problems involve,
as the name indicates, _theories_, such as linear arithmetic.

Big, competitive SMT solvers are [Z3](https://github.com/Z3Prover/z3),
[CVC5](https://cvc5.github.io/),
[yices2](https://github.com/SRI-CSL/yices2), and a few others.

A good introduction to Z3 is
[Z3's online guide](https://microsoft.github.io/z3guide/programming/Z3%20JavaScript%20Examples);
the website https://sat-smt.codes/ is also known to have lots of resources on the topic.

# The Sidekick project

So, SMT solvers are fascinating.
Most existing solvers are big and monolithic C or C++ programs, and I wanted a modular solver, in OCaml, that'd be easy to modify and extend (by me).
Also, to be perfectly honest, I just wanted to implement _all_ the algorithms.

So in the original version, sidekick was to be _functorized_ (i.e parametrized[^2]) over the representation of terms.
The idea was to be able to bring your own term representation — perhaps an existing one in a different project — and instantiate the SMT solver libraries on it. There would be no need for translation between your terms and the SMT solver terms.


I started work on Sidekick itself in 2018, forking and refactoring the SAT solver of my friend, Guillaume Bury, [mSAT](https://github.com/Gbury/mSAT/) (to which I contributed in the past).
mSAT already brought to the table a functorized SAT solver. You could bring your own theory which would get partial models ("trails") and propagate new booleans, or trigger conflicts.
Sidekick builds on top of that to add theory reasoning, a congruence closure, terms, etc.

In early 2022, Sidekick was supporting:
- EUF (equality and uninterpreted functions, via an incremental [congruence closure algorithm](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/cc/Sidekick_cc.ml), of which I'm quite proud)
- basic boolean formulas (via Tseitin encoding)
- [LRA](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/lra/sidekick_arith_lra.ml#L102-L107) (linear real arithmetic, via a pretty straightforward [Simplex](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/simplex/sidekick_simplex.ml) implementation)
- DT (algebraic datatypes, via a [plugin](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/th-data/Sidekick_th_data.ml#L158) which also adds [logic](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/th-data/Sidekick_th_data.ml#L169-L225) into the congruence closure itself to track which constructor a class can have)

As far as I know, there is no proof soundness issue now.
There is a system of proof traces about which I want to blog later.
However, Sidekick had (and still has) a persistent bug related to _theory completion_ (😱); on a single `QF_UFLRA` problem, it fails to detect some conflict and returns an invalid "SAT" answer.
I wanted to rewrite the theory combination, but the design was in the way.

## Giving up on functors

The last commit embodying the idea of functorizing over term representation
dates [back to july 15, 2022](https://github.com/c-cube/sidekick/tree/last-stable-with-functor).
So I gave up, after years of work, on the functorized aspect.

It was a nightmare to make it work and every modification required new additions to module arguments, type constraints, etc. so code velocity was really low.
Just look at [the core _signatures_](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/core/Sidekick_core.ml) to observe the madness of all the type and module aliases going around.
In each component, the [amount](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/lra/sidekick_arith_lra.ml#L102-L107) of [aliases](https://github.com/c-cube/sidekick/blob/last-stable-with-functor/src/cc/Sidekick_cc.ml#L17-L38) was painful to maintain.
Type errors were quite obscure; I even learnt that sometimes, the order of module aliases inside a functor matters!


## New term representation

Instead of functorizing over term representation, Sidekick now contains
a universal [term representation](https://github.com/c-cube/sidekick/blob/f5ccbb476b2693e1259e3071c137d2983c781deb/src/core-logic/types_.ml#L3-L39v).
You can't bring your own.

The term representation is basically like this:

```ocaml
type const_view = ..

type term = {
  id: int; (* hashconsing *)
  term_view: term_view
}

and term_view =
  | E_app of term * term
  | E_var of var
  | E_bound_var of int
  | E_const of const
  | E_type of int (* level *)
  | E_pi of term * term

and const = {
  view: const_view;
  ty: term;
  pp: const_view printer;
  equal: const_view -> const_view -> bool;
}
```

This is simplified but close enough.
The new term representation is based on the
[Calculus of Constructions](https://en.wikipedia.org/wiki/Calculus_of_constructions),
with universes, but no universe polymorphism or cumulativity.
This is enough to represent most interesting terms, and is certainly enough
to cover SMTLIB's first-order logic[^3].
Types are also just terms.
Polymorphism is implemented using `E_pi`.
A term like `a = b`, where `a` and `b` are constants of type `tau`,
would be represented by `(((= tau) a) b)`, where `= : Π (A: type). A -> (A -> Bool)`.

The representation retains some extensibility when it comes to _constants_.
A constant has a _view_ (an extensible variant, bring your own constructor)
and operations (like a typeclass) to manipulate this variant in
various ways.
This way, it's possible to add custom representations for theories.

For example, for LRA, one could write something like this:
```ocaml
type const_view +=
  | Const of Q.t
  | Plus
  | Mult of Q.t (* multiply only by constants *)
  | Neg

(* constructors (specific to LRA) *)

let const (q: Q.t) : expr =
  Expr.const (Const q) ~pp:… ~equal:… ()

let plus (a: expr) (b: expr) : expr =
  let plus_const = Expr.const Plus ~pp:… ~equal:… () in
  Expr.app_l plus_const [a;b]

let mult (c: Q.t) (e: expr) : expr =
  let mult_const = Expr.const (Neg c) ~pp:… ~equal:… () in
  Expr.app_l mult_const [e]

let neg (e: expr) : expr =
  let neg_const = Expr.const Neg ~pp:… ~equal:… () in
  Expr.app_l neg_const [e]
```

After this (large) refactoring, code became simpler and easier to modify.

## conclusion

Sidekick has recently undergone a lot of changes, and I haven't
even breached the topic of proof production.

Sadly, the lingering theory combination bug is still present, and I have no idea how to fix it.
I've recently tried to improve model construction;
trying to produce a model actually makes Sidekick crash instead of emitting the invalid "SAT answer; I guess that's progress?

I'll try to blog more about Sidekick and various implementation aspects.
The implementation of SMT solvers is quite an obscure topic that is sparsely covered in the literature.


[^1]: $a \land b$ means "a and b"; $a \lor b$ means "a or b"; $\lnot a$ means "not a".

[^2]: in OCaml, a _functor_ is a module-level function. It takes a module (containing types and values) and returns another module, which can use the types and values of the argument module. It's a powerful construct.

[^3] SMTLIB v3, still in development, is also based on some form of CoC.

<!-- math support -->
<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<script>
MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']]
  }
};
</script>
