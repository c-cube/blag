+++
date = 2013-10-05
title = "QuickCheck for OCaml"
slug = "quickcheck-for-ocaml"

[taxonomies]
authors = ["simon"]
tags  = ["ocaml","testing","properties"]
+++
I've written, and am using, an [OCaml module](https://github.com/c-cube/qcheck/blob/767e455a81c6a8748f48e22194927e24aad4cd29/src/core/QCheck.mli) (see the [documentation](https://c-cube.github.io/qcheck/)) that is heavily inspired from Haskell's QuickCheck.

<!-- more -->

Note: I will make an extensive use of the convenient notation

```ocaml
Module.(some expression)
```

that evaluates the expression in the scope of the module. It's one of those features of OCaml that is not as well known as it deserves :)

Rather than writing unit tests on specific test cases, the user writes **invariants** as boolean functions, and has them run on randomly-generated values.

For instance, if I want to test that `List.rev` is its own inverse:

```ocaml
let test = QCheck.mk_test ~n:1000
    ~name:"list_rev_is_involutive"
    QCheck.Arbitrary.(list small_int)
    (fun l -> List.rev (List.rev l) = l);;
QCheck.run test;;
```

Here, we define a test (`mk_test`), to be run on 1000 random instances of *lists of integers*. The property that is checked is given by the function

```ocaml
fun l -> List.rev (List.rev l) = l
```

We obtain

    testing property list_rev_is_involutive...
        [✔] passed 1000 tests (0 preconditions failed)
    - : bool = true

So, what about Arbitrary?
=========================

To run a test against random instances, we need to know how to generate such instances. In Haskell it's done using a typeclass, but since OCaml has no such construct, I chose to provide combinators in the module `Arbitrary`.

In the first example, we applied the combinator `list` to the random generator `small_int` (ints between 0 and 100), and that generates lists of random integers.

`QCheck` provides many useful combinators to write generators, especially for recursive types, algebraic types, tuples.

Let's see how to generate random trees:

```ocaml
type tree = Int of int | Node of tree list;;

let ar = QCheck.Arbitrary.(
    fix ~max:10
    ~base:(map small_int (fun i -> Int i))
    (fun t st -> Node (list t st)));;

QCheck.Arbitrary.generate ~n:10 ar;;
```

The `fix` combinator takes a base case (leaves of the recursive structure) and a function for non-terminal cases.

Other combinators include a monadic abstraction, lifting functions, generation of lists, arrays, and a choice function.

Printing Errors
===============

Let us consider this test:

```ocaml
let test = QCheck.(mk_test ~n:10
    QCheck.Arbitrary.(list small_int)
    (fun l -> l = List.sort compare l));;

QCheck.run test;;
```

Obviously, not all lists are sorted, so this fails. But we have no idea of which instances make this fail (imagine we were testing some much more complicated property). So, we can add a printing function to the test:

```ocaml
let test = QCheck.(mk_test ~n:10
    ~pp:PP.(list int)
    QCheck.Arbitrary.(list small_int)
    (fun l -> l = List.sort compare l));;

QCheck.run test;;
```

Now we got a much more detailed output, with failed test cases (which are, indeed, non-sorted lists):

    testing property <anon prop>...
    [×] 7 failures:
      (1, 19, 5)
      (17, 4, 11)
      (2, 6, 50, 95, 59, 14, 10)
      (41, 63, 83, 14, 73, 85, 10, 48)
      (74, 16, 56, 56, 38, 12)
      (4, 93, 45, 27, 80)
      (57, 82, 26, 77, 55, 32, 87, 87, 27)
    - : bool = false

Preconditions
=============

The submodule `Prop` contains a function called `assume: bool -> unit`. It can be used to restrict a property check on those instances that satisfy a precondition:

```ocaml
let test = QCheck.(mk_test
    ~n:1000 ~name:"cons_hd_tl_give_id"
    Arbitrary.(list small_int)
    (fun l ->
        Prop.assume (l <> []);
        l = (List.hd l) :: (List.tl l)));;
QCheck.run test;;
```

We cannot test the property that `(hd l) :: (tl l) = l` on an empty list, so we have to assume the list is not empty. We obtain:

    testing property cons_hd_tl_give_id...
        [✔] passed 1000 tests (117 preconditions failed)
    - : bool = true

So, among the 1000 tests, 117 were blank because the randomly generated list was empty; this still doesn't make the test fail. Conceptually, `assume a; b` is a property `a implies b`. If `a` is false, then `a implies b` is true.

Conclusion
==========

Testing invariant and general properties is invaluable for algorithmic code. I already found 2 bugs in my code using `QCheck`.
