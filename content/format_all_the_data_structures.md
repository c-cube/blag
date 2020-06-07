+++
date = 2016-03-20
title = "Format All the Data Structures"
slug = "format-all-the-data-structures"
[taxonomies]
tags = ["ocaml","printing","format"]
authors = ["simon"]
+++

Last October, I moved in Nancy to start working as an engineer with
[Jasmin Blanchette](https://www.cs.vu.nl/~jbe248/) on an exciting
project called [Nunchaku](https://github.com/nunchaku-inria/nunchaku/).
Since my domain is formal logic, I spend a lot of time manipulating,
transforming, and traversing ASTs (abstract syntax trees). My primary
method for debugging is pretty-printing structures; in nunchaku,
I even have a `--print-all` flag to print the AST after each transformation,
since the tool is basically a bidirectional pipeline that composes
transformations. I will certainly blog on the design of Nunchaku
later, but today I want to present the
standard
[Format](http://caml.inria.fr/pub/docs/manual-ocaml/libref/Format.html)
module from OCaml, that I use for pretty-printing all my data structures.

<!-- more -->

I will also use [containers](https://github.com/c-cube/ocaml-containers)
because it provides some additional utils, in particular
the `CCFormat` module contains predefined pretty-printers and printer
combinators that are handy.
Every module name starting with `CC` belongs to containers and not to the
standard library.
Even then, it is easy, although a bit tedious, to re-write the
combinators from `CCFormat` using only what `Format` provides,
so what I'll explain here can be done with vanilla OCaml,
or with, say, [the Fmt library](https://github.com/dbuenzli/fmt).

A quick work on `Fmt` and `CCFormat`: both are modules that provide additional
facilities on top of `Format` (combinators for printing lists, options,
arrays, etc., ANSI codes for coloring the output) that makes life easier.
Indeed, `Format` provides the pretty-printing algorithm, the support for
format strings (same as `Printf`), basic printers, but does not provide
more than the bare minimum for printing data structures, and that is why
extension libraries exist.

## A first taste

Let us say we have a value of type `(int * bool) list`, and we want
to print it. We could print it "by hand"
(using `print_endline`, `print_int`, etc. or even using `Printf`)
but it would be nice to have proper alignment.


```ocaml
let l = CCList.init 100 (fun n-> n, n mod 2 = 0);;

Format.printf "l = [@[<hov>%a@]]@."
  CCFormat.(list ~start:"" ~stop:"" (pair int bool)) l;;
```


And we get something like this (depending on the margin, you might not
get the exact same output):

    l = [(1, false), (2, true), (3, false), (4, true),
         (5, false), (6, true), (7, false), (8, true),
         (9, false), (10, true), (11, false), (12, true),
         (13, false), (14, true), (15, false), (16, true),
         (17, false), (18, true), (19, false), (20, true),
         (21, false), (22, true), (23, false), (24, true),
         (25, false), (26, true), (27, false), (28, true),
         (29, false), (30, true), (31, false), (32, true),
         (33, false), (34, true), (35, false), (36, true),
         (37, false), (38, true), (39, false), (40, true),
         (41, false), (42, true), (43, false), (44, true),
         (45, false), (46, true), (47, false), (48, true),
         (49, false), (50, true), (51, false), (52, true),
         (53, false), (54, true), (55, false), (56, true),
         (57, false), (58, true), (59, false), (60, true),
         (61, false), (62, true), (63, false), (64, true),
         (65, false), (66, true), (67, false), (68, true),
         (69, false), (70, true), (71, false), (72, true),
         (73, false), (74, true), (75, false), (76, true),
         (77, false), (78, true), (79, false), (80, true),
         (81, false), (82, true), (83, false), (84, true),
         (85, false), (86, true), (87, false), (88, true),
         (89, false), (90, true), (91, false), (92, true),
         (93, false), (94, true), (95, false), (96, true),
         (97, false), (98, true), (99, false), (100, true)]

Nice, but what does this horrible `"l = [@[<hov>%a@]]@."` mean?
It's a *formatting string* (same as in C printf), but more expressive.

- The terminating `@.` prints a newline;
- The `@[<hov>......@]` is a *box* that prints the same as `....`,
  but will align its content either horizontally ("h") or
  vertically ("v"). The other kinds of boxes are "h" (horizontal),
  "v" (vertical), and "hv" (behaves either like "h" or like "v",
  but does not mix them).
  There is a [tutorial about boxes](http://caml.inria.fr/resources/doc/guides/format.en.html) on OCaml's website.
- the `"%a"` is similar to `"%d"`, `"%s"`, etc.
  (which print respectively
  an integer and a string), but it's used for user-defined printers.
  For instance, `Format.printf "hello %a"` has type
  `(Format.formatter -> 'a -> unit) -> 'a -> unit`: it takes a first
  argument that is an `'a` printer, then the `'a` to print.
  Luckily (or not), the combinators in `CCFormat` have similar types,
  so for instance `CCFormat.int : Format.formatter -> int -> unit`,
  and `CCFormat.(pair int bool) : Format.formatter -> (int * bool) -> unit`. Here, `CCFormat.pair` is a *printer combinator*; the stdlib
  provides a few useful combinators such as `Format.pp_print_list`.

It is usually convenient, when you define some type `t`, to
also define nearby a value `val print : Format.formatter -> t -> unit`.
This way, it is straightforward to print values of type `t` when
debugging time has come. Note that printers take a `formatter` as
their first argument (to be used, typically, with `Format.fprintf`)
which makes it possible to use them directly on files, etc. without
creating a big string first.

## Trees, Recursion, and nested Boxes

A case where boxes are really important is for printing recursive
structures, such as trees. As far as I know, OCaml itself (the compiler)
uses `Format` to print its intermediate ASTs, the signatures, etc.
Let us define a small expression type, as an example:

```ocaml
type expr =
  | Add of expr * expr
  | Fun of bytes * expr
  | Const of int
  | Var of string
  | Let of string * expr * expr
  | App of expr * expr ;;

let e1 = Fun ("x", Add (Var "x", Const 1));;
val e1 : expr = Fun ("x", Add (Var "x", Const 1))
```

Ok, it does the job of representing a λ-calculus expression (with
let-bindings and syntactic sugar for integers, wow!), but the representation
of expressions is not very pretty. So let us use `Format`:

```ocaml
let rec print_expr out = function
  | Const i -> CCFormat.int out i
  | Var s -> CCFormat.string out s
  | Add (e1,e2) ->
    Format.fprintf out "@[<2>%a@ + %a@]" print_expr_inner e1 print_expr_inner e2
  | Let (x,e1,e2) ->
    Format.fprintf out "@[<v>@[<2>let %s =@ @[%a@] in@]@ %a@]"
      x print_expr e1 print_expr e2
  | App (e1,e2) ->
    Format.fprintf out "@[<2>%a@ %a@]" print_expr_inner e1 print_expr_inner e2
  | Fun (x,e) ->
    Format.fprintf out "@[<2>fun %s ->@ @[%a@]@]" x print_expr_inner e
and print_expr_inner out e = match e with
  | Const _ | Var _ -> print_expr out e
  | Add _ | Fun _ | App _ | Let _ ->
    Format.fprintf out "(@[%a@])" print_expr e
;;
```

where:

- the argument `out` is the formatter we write into,
- `CCFormat.int` is short for `Format.pp_print_int`,
- the second printer is used to wrap an expression in parenthesis
  when needed to avoid ambiguities,
- we put boxes around composite expressions to enforce proper
  indentation,
- `"@,"` is a break (can be replaced by a newline + indentation
  if it pleases the pretty-printer),
- `"@ "` is either a space or a break,
- `"@[<2>"` starts a box with indentation 2.

This is a very simple printer, and it could be improved, but
it contains the gist of how to write a printer for recursive structures.
Let see how it performs:

```ocaml
(* define a bigger expression *)
let e2 =
  Let ("f", e1,
    Let ("x",
      App (Var "f", App (Var "f", Const 0)),
      Let ("result",
        Let ("g",
          Fun ("y", App(Var "f", Add (Var "x", Var "y"))),
          App (Var "g", (Add (Const 40, Var "x")))),
        Add (Const 0, Var "result"))))
;;

(* print it: see the indentation *)
Format.printf "@[<2>e2 =@ %a@]@." print_expr e2;;
e2 =
  let f = fun x -> (x + 1) in
  let x = f (f 0) in
  let result = let g = fun y -> (f (x + y)) in
               g (40 + x) in
  0 + result
- : unit = ()
```

For a more realistic example, [here is the main printer in Nunchaku](https://github.com/nunchaku-inria/nunchaku/blob/a69d3ebce2fb83c40824420c4d93cc615c8a5fa1/src/core/terms/TermInner.ml#L311).
It's not perfect (it prints too many parenthesis) but works pretty well,
as the following example shows. Just imagine if there was no indentation…

![a pretty-printed term](/images/pretty_print_term.png)

## The toplevel

The toplevel itself (or [utop](https://github.com/diml/utop), you
should probably use it!) uses `Format` for printing values.
There is a pragma `#install_printer` to make it use your own printer:

```ocaml
type complex = Complex.t = { re: float; im: float; };;
let pp_complex out c =
  Format.fprintf out "%.2f + %.2fi" c.re c.im;;
#install_printer pp_complex;;

[ {re=1.0; im=(atan 1. *. 4.)}
; {re=0.; im=37.}
];;
- : complex list = [1.00 + 3.14i; 0.00 + 37.00i]
```

Yes, the toplevel will use the custom printer even inside structures
such as lists.

## Deriving printers

It is possible to derive printers automatically, using
[ppx_deriving.show](https://github.com/whitequark/ppx_deriving) (and
possibly camlp4-based things, in versions anterior to 4.02, but
ppx is the future). This makes printers even easier to use
as, in general, you don't have to write anything to use them
on your types (unless you want some specific behavior). It
is as simple as:

```ocaml
#require "ppx_deriving.show";;

type foo =
  | A of int
  | B of string * bool list
  [@@deriving show] ;;

type bar = {
  foo1 : foo;
  foo2 : foo option
} [@@deriving show];;

let b = {foo1=A 42; foo2=Some (B ("a string", [true; false])); };;

Format.asprintf "b=%a" pp_bar b;;
- : string = "b={ foo1 = (A 42); foo2 = (Some B (\"a string\", [true; false])) }"

```

## A word on performance

Adding GADTs to OCaml made it possible  to clean
the old magic code dealing with format strings that, once, gave `Format`
a reputation for slowness (see [the awesome work of Benoit
Vaugon](http://caml.inria.fr/mantis/view.php?id=6017)). I hope that flambda
(the new optimization pass in OCaml 4.03) will reduce  the performance
overhead even further.

## Conclusion

`Format` is great and you should use it! :)
