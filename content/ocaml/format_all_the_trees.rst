:author: simon
:date: 20-03-2016
:title: Format All the Data Structures
:tags: ocaml,printing,format
:status: draft

Last October, I moved in Nancy to start working as an engineer with
`Jasmin Blanchette <http://www4.in.tum.de/~blanchet/>`_ on an exciting
project called `Nunchaku <https://github.com/nunchaku-inria/nunchaku/>`_.
Since my domain is formal logic, I spend a lot of time manipulating,
transforming, and traversing ASTs (abstract syntax trees). My primary
method for debugging is pretty-printing structures; which nunchaku,
I even have a ``--print-all`` flag to print the AST after each transformation,
since the tool is basically a bidirectional pipeline that composes
transformations. I will certainly blog on the design of Nunchaku
later, but today I want to present the
standard
`Format <http://caml.inria.fr/pub/docs/manual-ocaml/libref/Format.html>`_
module from OCaml, that I use for pretty-printing all my data structures.

I will also use `containers <https://github.com/c-cube/ocaml-containers>`_
because it provides some additional utils, in particular
the ``CCFormat`` module contains predefined pretty-printers and printer
combinators that are handy.
Every module name starting with ``CC`` belongs to containers and not to the
standard library.
Even then, it is easy, although a bit tedious, to re-write the
combinators from ``CCFormat`` using only what ``Format`` provides,
so what I'll explain here can be done with vanilla OCaml.

A first taste
=============

Let us say we have a value of type ``(int * bool) list``, and we want
to print it. We could print it "by hand"
(using ``print_endline``, ``print_int``, etc. or even using ``Printf``)
but it would be nice to have proper alignment.

.. code-block:: ocaml

    let l =
      CCList.(1 -- 100) |> List.map (fun n -> n, n mod 2 = 0);;

    Format.printf "l = [@[<hov>%a@]]@."
      CCFormat.(list ~start:"" ~stop:"" (pair int bool)) l;;

And we get something like this (depending on the margin, you might not
get the exact same output):

::

    l = [(1, false), (2, true), (3, false), (4, true), (5, false), (6, true),
         (7, false), (8, true), (9, false), (10, true), (11, false),
         (12, true), (13, false), (14, true), (15, false), (16, true),
         (17, false), (18, true), (19, false), (20, true), (21, false), (22,
         true), (23, false), (24, true), (25, false), (26, true), (27, false),
         (28, true), (29, false), (30, true), (31, false), (32, true), (33,
         false), (34, true), (35, false), (36, true), (37, false), (38, true),
         (39, false), (40, true), (41, false), (42, true), (43, false), (44,
         true), (45, false), (46, true), (47, false), (48, true), (49, false),
         (50, true), (51, false), (52, true), (53, false), (54, true), (55,
         false), (56, true), (57, false), (58, true), (59, false), (60, true),
         (61, false), (62, true), (63, false), (64, true), (65, false), (66,
         true), (67, false), (68, true), (69, false), (70, true), (71, false),
         (72, true), (73, false), (74, true), (75, false), (76, true), (77,
         false), (78, true), (79, false), (80, true), (81, false), (82, true),
         (83, false), (84, true), (85, false), (86, true), (87, false), (88,
         true), (89, false), (90, true), (91, false), (92, true), (93, false),
         (94, true), (95, false), (96, true), (97, false), (98, true), (99,
         false), (100, true)]

