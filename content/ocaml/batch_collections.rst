:author: simon
:date: 11-6-2014
:title: Batch Operations on Collections
:tags: ocaml,flat_map,collections,performance,batch,gadt


Some very common (and useful) operations, including the classic
``map``, ``filter``, and ``flat_map``, traverse their whole argument
and return another collection. When several such operations are composed,
intermediate collections will be created and become useless immediately
after. Languages like Haskell sometimes perform optimizations
that *merge* together the operations so as to minimize the
number of intermediate collections :

.. code-block:: haskell

   map f . map g == map (f . g)

Sadly, the OCaml compiler performs very few optimizations (and in this case,
the optimization would not be correct anyway, because it would change
the order of evaluation and therefore side-effects).

Batch
-----

We can still combine operations efficiently by making their composition explicit.
I wrote a module, `CCBatch`_ (the implementation is
`there <https://github.com/c-cube/ocaml-containers/blob/master/core/CCBatch.ml>`_)
for this exact purpose.

.. _`CCBatch`: https://github.com/c-cube/ocaml-containers/blob/master/core/CCBatch.mli

The module is parametrized by a collection type, whose signature follows.
A collection contains elements of type ``'a``, and provides a few
basic operators.

.. code-block:: ocaml

    module type COLLECTION = sig
      type 'a t

      val empty : 'a t
      val map : ('a -> 'b) -> 'a t -> 'b t
      val filter : ('a -> bool) -> 'a t -> 'a t
      val filter_map : ('a -> 'b option) -> 'a t -> 'b t
      val flat_map : ('a -> 'b t) -> 'a t -> 'b t
    end

Then, we provide a functor that returns batch operations:

.. code-block:: ocaml

    module type S = sig
      type 'a t

      type ('a,'b) op

      val optimize : ('a, 'b) op -> ('a, 'b) op

      val apply : ('a,'b) op -> 'a t -> 'b t

      val id : ('a, 'a) op

      val map : ('a -> 'b) -> ('a, 'b) op

      val filter : ('a -> bool) -> ('a,'a) op

      val filter_map : ('a -> 'b option) -> ('a,'b) op

      val flat_map : ('a -> 'b t) -> ('a,'b) op

      val (>>>) : ('a,'b) op -> ('b,'c) op -> ('a,'c) op
    end

    module Make(C : COLLECTION) : S with type 'a t = 'a C.t

An operation of type ``('a,'b) op`` is conceptually a function
``'a t -> 'b t``. The operator ``>>>`` composes operations, such
that ``a >>> b`` first applies the operation ``a``, then the operation
``b``, but there is a ``optimize`` function that, whenever possible,
merges two operations (for instance ``map f >>> map g`` into ``map (f . g)``).
GADTs are used to represent the chain of compositions.

Internals
^^^^^^^^^

The internal representation of a chain of operations is based on GADTs.
Composition is done through a ``_compose`` internal function that
does some basic simplifications, like removing ``Id`` when required
and right-parenthesing the composition operators.

.. code-block:: ocaml

  type (_,_) op =
    | Id : ('a,'a) op
    | Compose : ('a,'b) base_op * ('b, 'c) op -> ('a, 'c) op
  and (_,_) base_op =
    | Map : ('a -> 'b) -> ('a, 'b) base_op
    | Filter : ('a -> bool) -> ('a, 'a) base_op
    | FilterMap : ('a -> 'b option) -> ('a,'b) base_op
    | FlatMap : ('a -> 'b t) -> ('a,'b) base_op

  (* associativity: put parenthesis on the right *)
  let rec _compose : type a b c. (a,b) op -> (b,c) op -> (a,c) op
  = fun f g -> match f with
    | Compose (f1, Id) -> Compose (f1, g)
    | Compose (f1, f2) -> Compose (f1, _compose f2 g)
    | Id -> g

Then, optimization is done through a lengthy pattern-match (an excerpt
of which follows):

.. code-block:: ocaml

  type 'a optim_result =
    | Same of 'a
    | New of 'a

  let _new_compose a b = New (Compose(a,b))

  let rec _optimize_head
  : type a b. (a,b) op -> (a,b) op optim_result
  = fun op -> match op with
    | Id -> Same Id
    | Compose (Map f, Compose (Map g, cont)) ->
        _new_compose (Map (fun x -> g (f x))) cont
    | Compose (Map f, Compose (Filter p, cont)) ->
        _new_compose
          (FilterMap (fun x -> let y = f x in if p y then Some y else None)) cont
    | Compose (Map f, Compose (FilterMap f', cont)) ->
        _new_compose
          (FilterMap (fun x -> f' (f x))) cont
    (* ... *)
    | _ -> Same op


Evaluation
^^^^^^^^^^

To actually compute the result of an operation on a proper collection,
the ``apply`` function should be used. For instance, with an
instance of ``CCBatch.Make`` on arrays:

.. code-block:: ocaml

    # let f x = x+1 ;;
    # let g x = if x mod 2 = 0 then Some (x*10) else None ;;
    # let op = map f >>> filter_map g ;;
    op : (int,int) op = <abstr>
    # BA.apply op [| 1; 2; 3; 4 |] ;;
    - : int array = [| 20; 40 |]

In this case, the actual operation performed on the array
should basically be ``filter_map (fun x -> g (f x))``, which doesn't
need any intermediate structure.

Benchmark
---------

Now the question is: does this actually bring more performance? To test
this I wrote a
`benchmark module <https://github.com/c-cube/ocaml-containers/blob/master/tests/bench_batch.ml>`_. It compares the performance of a chain of operations
using several methods:

#. regular composition ("``naive``")
#. batch evaluation, without optimizing ("``batch_simpl``")
#. batch evaluation with optimization enabled ("``batch``")

The chain of operation (pretty artificial) is as follows.

.. code-block:: ocaml

    let f1 x = x mod 2 = 0
    let f2 x = -x
    let f3 x = C.doubleton x (x+1)  (* [x;x+1] *)
    let f4 x = -x
    let collect a = C.fold (+) 0 a

    let naive a =
      let a = C.filter f1 a in
      let a = C.flat_map f3 a in
      let a = C.filter f1 a in
      let a = C.map f2 a in
      let a = C.flat_map f3 a in
      let a = C.map f4 a in
      ignore (collect a);   (* force evaluation *)
      a

    let ops =
        BA.(filter f1 >>> flat_map f3 >>> filter f1 >>>
            map f2 >>> flat_map f3 >>> map f4)

Several data structures are evaluated: lists, arrays, and *klist* (an
iterator structure defined as
``type 'a klist = unit -> [ `Nil | `Cons of 'a * 'a klist ]``).
As we see in the results, fusion of batch operations can make operations
on big arrays or lists much faster, by removing most intermediate structures;
it has no visible impact on ``klist`` because it's a lazy data structure anyway.

::

    benchmark for array of len 100
                           Rate array_batch_simple array_naive array_batch
    array_batch_simple 149087/s                 --         -1%        -11%
           array_naive 150311/s                 1%          --        -10%
           array_batch 167024/s                12%         11%          --


    benchmark for array of len 100000
                         Rate array_naive array_batch_simple array_batch
           array_naive 63.6/s          --                -0%        -31%
    array_batch_simple 63.7/s          0%                 --        -31%
           array_batch 91.7/s         44%                44%          --


    benchmark for array of len 1000000
                         Rate array_batch_simple array_naive array_batch
    array_batch_simple 4.48/s                 --         -0%        -41%
           array_naive 4.49/s                 0%          --        -41%
           array_batch 7.63/s                70%         70%          --


    benchmark for list of len 100
                          Rate list_batch_simple list_naive list_batch
    list_batch_simple 232397/s                --        -2%        -3%
           list_naive 236217/s                2%         --        -1%
           list_batch 239182/s                3%         1%         --


    benchmark for list of len 100000
                        Rate list_batch_simple list_naive list_batch
    list_batch_simple 20.4/s                --        -1%       -28%
           list_naive 20.6/s                1%         --       -27%
           list_batch 28.3/s               39%        38%         --


    benchmark for list of len 1000000
                        Rate list_naive list_batch_simple list_batch
           list_naive 1.54/s         --               -3%       -37%
    list_batch_simple 1.58/s         3%                --       -35%
           list_batch 2.43/s        58%               53%         --


    benchmark for klist of len 100
                           Rate klist_batch_simple klist_naive klist_batch 
    klist_batch_simple 141107/s                 --         -1%         -2% 
           klist_naive 141959/s                 1%          --         -2% 
           klist_batch 144303/s                 2%          2%          -- 


    benchmark for klist of len 100000
                        Rate klist_naive klist_batch_simple klist_batch
           klist_naive 149/s          --                -0%         -1%
    klist_batch_simple 149/s          0%                 --         -1%
           klist_batch 151/s          2%                 1%          --


    benchmark for klist of len 1000000
                         Rate klist_batch_simple klist_naive  klist_batch
    klist_batch_simple 15.0/s                 --         -0%          -1%
           klist_naive 15.0/s                 0%          --          -1%
           klist_batch 15.2/s                 1%          1%           --
    

