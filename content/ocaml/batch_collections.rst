:author: simon
:date: 11-6-2014
:status: draft
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

   map f . map g ---> map (f . g)

Sadly, the OCaml compiler performs very few optimizations (and in this case,
the optimization would not be correct anyway, because it would change
the order of evaluation and therefore side-effects).

Batch
=====

We can still combine operations efficiently by making their composition explicit.
I wrote a module, `CCBatch`_ (the implementation is
`there <https://github.com/c-cube/ocaml-containers/blob/master/core/CCBatch.ml>`_)
for this exact purpose.


_`CCBatch`: https://github.com/c-cube/ocaml-containers/blob/master/core/CCBatch.mli
