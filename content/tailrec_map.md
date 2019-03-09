+++
date = 2012-12-03
title = "Tail-recursive map in OCaml"
slug = "tail-recursive-map-in-ocaml"
[taxonomies]
authors = ["simon"]
tags  = ["ocaml","unsafe","optimization"]
+++

The `List.map` function of the OCaml standard lib is not implemented tail-recursively. The current version (as of 4.00 on my computer) is

```ocaml
let rec map f = function
    [] -> []
  | a::l -> let r = f a in r :: map f l
```

It's pretty efficient on small lists, but blows up the stack on big lists. After discussing on IRC with a friend of mine, that loves C and believes functional languages are too slow, I tried to write an efficient, although totally unsafe, version of `List.map`. The trick is to use the module `Obj` to manipulate the local, non-shared list we are creating. The code is:

```ocaml
let unsafe_map f l =
  let rec recurse first prev l =
  match l with
    | [] -> assert false
    | x::[] ->
    let l' = [f x] in
    Obj.set_field (Obj.repr prev) 1 (Obj.repr l'); first
    | x::l' ->
      let cur = [f x] in
      Obj.set_field (Obj.repr prev) 1 (Obj.repr cur);
      recurse first cur l'
  in match l with
    | [] -> []
    | x::l' -> let first = [f x] in recurse first first l'
```

So, it's uglier, and longer. However, it is tail-recursive, and allocates only n elements, where n is the length of the list l. The helper function `recurse` traverses `l`, applying `f` to its elements, keeping a handle on the previous list node. It then modifies (**unsafe**) the `next` pointer of the previous node to point to the new one, and continue until it reaches the last node. Then it can return a pointer to the very first node of the list.

Let's benchmark it:

```ocaml
let bench n =
  (* generate big list *)
  let rec generate acc i = match i with
    | 0 -> acc
    | _ -> generate (i :: acc) (i-1)
  in
  let l = generate [] n in
  let t1 = Unix.gettimeofday () in
  let l' = unsafe_map f l in
  let t2 = Unix.gettimeofday () in
  let l'' = List.rev (List.rev_map f l) in
  let t3 = Unix.gettimeofday () in
  Format.printf "%d elements: %fs for unsafe, %f for safe@."
    n (t2 -. t1) (t3 -. t2)

let _ =
  List.iter bench [10; 100; 10000; 1000000; 10000000]
```

Here we compare the `unsafe_map` implementation with `fun f l -> List.rev (List.map f l)`, but not with `List.map` because it cannot handle very long lists. The results on my laptop (with a dual-core "Genuine Intel(R) CPU U7300 @ 1.30GHz", according to /proc/cpuinfo), are:

    10 elements: 0.000004s for unsafe, 0.000002 for safe
    100 elements: 0.000005s for unsafe, 0.000005 for safe
    10000 elements: 0.000395s for unsafe, 0.000490 for safe
    1000000 elements: 0.186290s for unsafe, 0.470396 for safe
    10000000 elements: 2.000005s for unsafe, 4.958645 for safe

So we see that allocating twice as few list nodes pays off quite quickly.
