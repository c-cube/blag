+++
date  = 2014-05-02
title = "Representing Lazy Values"
slug = "representing-lazy-values"
[taxonomies]
author = ["simon"]
tags= ["ocaml","lazy","obj","performance"]
+++

A quick survey of Lazy in OCaml
===============================

I remember having heard that [Jane Street](https://www.janestreet.com/) had its own implementation of `Lazy` values, and that it was faster than the standard one. So I played a bit with several ways of managing lazy values in OCaml.

Definition of Lazy implementations
----------------------------------

First we need to define what a lazy value is:

```ocaml
module type LAZY = sig
  type 'a t
  val from_val : 'a -> 'a t
  val from_fun : (unit -> 'a) -> 'a t
  val force : 'a t -> 'a
end
```

We deliberately ignore the `lazy` keyword because there is no way for regular OCaml code to change its behavior. Instead, lazy thunks are created directly from a value, or from a function (the delayed computation). Our specification implicitly requires that calling several times `force` on `from_fun f` only calls `f ()` once, and caches its value; however, for performance comparison, we will also use the non-caching behavior.

Without further ado, here are the alternatives I could come up with (please bear with the naming, I know it's awful):

### FLazy

A function wrapped in a record (a bit like the STG machine used by GHC -- `FLazy` would stand for `function-based lazy`), that replaces itself upon evaluation by a function that returns the value directly.

```ocaml
module FLazy = struct
  type 'a t = {
    mutable flazy : unit -> 'a;
  }

  let from_val x = { flazy = (fun () -> x) }
  let from_fun f =
    let rec thunk = {
      flazy = (fun () -> let x = f() in thunk.flazy <- (fun () -> x); x)
    } in
    thunk

  let force l = l.flazy()
end
```

### ALazy

An algebraic type wrapped in a reference ("Alternative Lazy" or "Algebraic Lazy"). It simply stores either the value, or the function to evaluate.

```ocaml
module ALazy = struct
  type 'a t = 'a alazy_cell ref
  and 'a alazy_cell =
    | Thunk of (unit -> 'a)
    | Res of 'a

  let from_val x = ref (Res x)
  let from_fun f = ref (Thunk f)
  let force t =
    match !t with
    | Res x -> x
    | Thunk f ->
        let x = f () in
        t := Res x;
        x
end
```

### F2Lazy

A variation on the FLazy implementation\_ in which part of the closure is directly inlined in the record type. The principal issue with this implementation is that it uses `Obj` (which is, as <*@gasche>\* would say, "not part of OCaml").

```ocaml
module F2Lazy = struct
  type 'a t = {
    mutable call : 'a t -> 'a;
    mutable x : 'a;
  }

  let _read thunk = thunk.x
  let _eval f thunk =
    let x = f () in
    thunk.x <- x;
    thunk.call <- _read;
    x

  let from_val x = { call=_read; x; }
  let from_fun f = { call=_eval f; x=Obj.magic 0; }
  let force t = t.call t
end
```

### NoLazy

This is the part where I cheat. For lazy lists with very few computations per node, but infinite extension, or when lazy values are used in a linear way (i.e. evaluated at most once) this implementation is excellent. However it doesn't satisfy our requirement that the suspended computation is evaluated at most once.

This module is the simplest, because a lazy value is, well, only a function that is called upon `force`.

```ocaml
module NoLazy = struct
  type 'a t = unit -> 'a

  let from_val x () = x
  let from_fun f = f
  let force f = f ()
end
```

Benchmarking Implementations
----------------------------

To compare the performance of those implementations, we compute sums on lazy lists. I will use the [benchmark](http://ocaml-benchmark.forge.ocamlcore.org/) library. Of course the reference is the standard OCaml [Lazy](http://caml.inria.fr/pub/docs/manual-ocaml/libref/Lazy.html) module, which is built in the compiler (and the GC).

```ocaml
module Make(L : LAZY) = struct
  type 'a llist =
    | Nil
    | Cons of 'a * 'a llist L.t

  (* the list 0...n *)
  let range n =
    let rec make i =
      if i = n then Nil
      else Cons (i, L.from_fun (fun () -> make (i+1)))
    in make 0

  (* sum of elements of the given lazy list *)
  let sum l =
    let rec sum acc l = match l with
      | Nil -> acc
      | Cons (x, l') -> sum (x+acc) (L.force l')
    in sum 0 l

  (* benchmark for n: make a list of [len+1]  elements and sum it [n] times *)
  let bench n len =
    let l = range len in
    for i = 1 to n do ignore (sum l) done
end

module BenchLazy = Make(Lazy)
module BenchFLazy = Make(FLazy)
module BenchALazy = Make(ALazy)
module BenchF2Lazy = Make(F2Lazy)
module BenchNoLazy = Make(NoLazy)

let () =
  List.iter
    (fun i ->
      Printf.printf "\n\nevaluate %d times...\n\n" i;
      let entry name f = name, f i, 100_000 in
      let res = Benchmark.throughputN 3
        [ entry "lazy" BenchLazy.bench
        ; entry "flazy" BenchFLazy.bench
        ; entry "alazy" BenchALazy.bench
        ; entry "f2lazy" BenchF2Lazy.bench
        ; entry "nolazy" BenchNoLazy.bench
        ]
      in
      Benchmark.tabulate res;
    ) [1; 2; 5];
  ()
```

and the results (on an Intel i5 @ 3.4GHz):

```
evaluate 1 times...

Throughputs for "lazy", "flazy", "alazy", "f2lazy", "nolazy" each running for at least 3 CPU seconds:
  lazy:  3.27 WALL ( 3.24 usr +  0.03 sys =  3.27 CPU) @ 120.07/s (n=393)
 flazy:  3.53 WALL ( 3.52 usr +  0.01 sys =  3.53 CPU) @ 49.58/s (n=175)
 alazy:  3.27 WALL ( 3.27 usr +  0.00 sys =  3.27 CPU) @ 83.23/s (n=272)
f2lazy:  3.29 WALL ( 3.29 usr +  0.00 sys =  3.29 CPU) @ 80.17/s (n=264)
nolazy:  3.18 WALL ( 3.18 usr +  0.00 sys =  3.18 CPU) @ 1659.84/s (n=5270)
         Rate  flazy_1 f2lazy_1  alazy_1   lazy_1 nolazy_1
 flazy 49.6/s       --     -38%     -40%     -59%     -97%
f2lazy 80.2/s      62%       --      -4%     -33%     -95%
 alazy 83.2/s      68%       4%       --     -31%     -95%
  lazy  120/s     142%      50%      44%       --     -93%
nolazy 1660/s    3248%    1970%    1894%    1282%       --

evaluate 2 times...

Throughputs for "lazy", "flazy", "alazy", "f2lazy", "nolazy" each running for at least 3 CPU seconds:
  lazy:  3.30 WALL ( 3.30 usr +  0.00 sys =  3.30 CPU) @ 116.81/s (n=385)
 flazy:  3.13 WALL ( 3.12 usr +  0.01 sys =  3.13 CPU) @ 47.28/s (n=148)
 alazy:  3.12 WALL ( 3.12 usr +  0.00 sys =  3.12 CPU) @ 78.13/s (n=244)
f2lazy:  3.29 WALL ( 3.29 usr +  0.00 sys =  3.29 CPU) @ 77.79/s (n=256)
nolazy:  3.17 WALL ( 3.17 usr +  0.00 sys =  3.17 CPU) @ 830.70/s (n=2630)
         Rate  flazy_2 f2lazy_2  alazy_2   lazy_2 nolazy_2
 flazy 47.3/s       --     -39%     -39%     -60%     -94%
f2lazy 77.8/s      65%       --      -0%     -33%     -91%
 alazy 78.1/s      65%       0%       --     -33%     -91%
  lazy  117/s     147%      50%      50%       --     -86%
nolazy  831/s    1657%     968%     963%     611%       --

evaluate 5 times...

Throughputs for "lazy", "flazy", "alazy", "f2lazy", "nolazy" each running for at least 3 CPU seconds:
  lazy:  3.20 WALL ( 3.20 usr +  0.00 sys =  3.20 CPU) @ 107.15/s (n=343)
 flazy:  3.18 WALL ( 3.17 usr +  0.01 sys =  3.18 CPU) @ 43.07/s (n=137)
 alazy:  3.10 WALL ( 3.10 usr +  0.00 sys =  3.10 CPU) @ 70.37/s (n=218)
f2lazy:  3.23 WALL ( 3.23 usr +  0.00 sys =  3.23 CPU) @ 70.21/s (n=227)
nolazy:  3.17 WALL ( 3.17 usr +  0.00 sys =  3.17 CPU) @ 333.54/s (n=1056)
         Rate  flazy_5 f2lazy_5  alazy_5   lazy_5 nolazy_5
 flazy 43.1/s       --     -39%     -39%     -60%     -87%
f2lazy 70.2/s      63%       --      -0%     -34%     -79%
 alazy 70.4/s      63%       0%       --     -34%     -79%
  lazy  107/s     149%      53%      52%       --     -68%
nolazy  334/s     674%     375%     374%     211%       --
```

It clearly appears on all three cases (evaluating once, 2 times or 5 times the sum of the elements of the list `[0, 1, ..., 100_000]`) that `NoLazy` is far ahead, 7.7 times faster than `Lazy` which is itself 1.5 times faster than `ALazy` and `F2Lazy`. `FLazy` lags far behind (probably because it allocates several closures and triggers several write barriers).

**Conclusion**: well, the standard lazy is by far the best implementation that respects our specification (evaluation of the delayed computation at most once). On the other hand, if a lazy value is to be forced at most once, the just using a closure is much more efficient. I don't know how JaneStreet managed to get something comparable to `Lazy`, but I suspect it requires some low-level magic (with `Obj`), same as `Lazy` itself.
