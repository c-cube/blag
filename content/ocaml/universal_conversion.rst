:author: simon
:date: 12-3-2014
:title: Universal Serialization and Deserialization
:tags: ocaml,serializing,json,sexp,GADT

**TL;DR**: combinators and GADTs allow to describe types in abstract enough
a way that they can be converted into/from various serialization
formats.

**Edit**: the code is now available in its own repository
on [github](https://github.com/c-cube/cconv), and
on my [opam repository](https://github.com/c-cube/yolopam-repository)
under the name ``CConv``. Optional interfaces to Yojson, Sexplib and Bencode
are also provided.

The problem
-----------

For most IO-related tasks, e.g. networking or saving some state to the disk to
work on it later, programs need some form of *serialization* (and the
converse operation, *deserialization*).

OCaml doesn't provide any reflection (introspecting values and their types
at runtime to decide what to do). During the compilation, types are effectively
erased and at runtime there is no difference between a tuple ``(int, int)``
and a record ``{x:int; y:int}`` for instance.
Therefore, reflection-based serialization is impossible in OCaml
(and would probably be considered unsafe, anyway)

This leaves OCaml programmers with the following options:

- writing serialization/deserialization code by hand. This is painful.
- generating serialization/deserialization code from a type, with a code
  generator such as
  `camlp4 <http://caml.inria.fr/pub/docs/manual-camlp4/index.html/>`_ or
  `deriving <http://code.google.com/p/deriving/>`_. This is the most
  popular approach right now (see how JaneStree's
  `Core <https://ocaml.janestreet.com/ocaml-core/latest/doc/>`_
  library uses something
  called *type_conv* to generate conversions functions from/to *S-expressions*)
  but it complicates the compiling process and doesn't work for types defined
  in foreign (third-party) code.
- generating code from a specification. Some libraries do take this
  way, for instance `Atdgen <https://github.com/mjambon/atdgen>`_
  or `piqi <http://piqi.org/doc/ocaml/>`_. It can be
  especially nice if you share the specification between several languages
  (see `Apache thrift <http://thrift.apache.org/>`_ which supports OCaml,
  among many other languages). This doesn't work for types that
  are defined in a pre-existing OCaml module (as are most types in a
  library).
- using combinators to compose together small serialization (resp.
  deserialization) functions into bigger ones, that can serialize (resp.
  deserialize) more complicated types.
  
In this post I'll explore the last approach, based on combinators. The reason
is that I dislike code generation, and I want something decoupled from the
actual serialization format (i.e., that can be used with a format I didn't
specifically think of). Of course this last requirement has limits, some
assumptions about the serialization format are needed.
Moreover, in a library like `Batteries Included`_, choosing a code
generator -- and therefore a (set of) serialization format --
is arbitrary, blocks extensibility, and forces the designers's choices on the
user.
  
The combinators I'm talking about are implemented in
a module `Conv`_ (`Conv.ml`_).
They can be seen as (partial) descriptions of a type; for instance a ``'a
Conv.Sink.t`` is a value that describes how to build instances of the type ``'a``
from any serialization format (it can fail, of course, for instance if you
provide a list where an integer is expected).
So far this technique works for me, on some small tests, and doesn't require
code generation at all [#codegen]_.
It can be a bit more cumbersome to use because you have to explicitely combine
the combinators(!). I don't know of any equivalent so far,
although some people already use combinators for printing
functions [#printing]_ (which is a kind of serialization).

.. _`Conv`: https://github.com/c-cube/ocaml-containers/blob/master/conv.mli
.. _`Conv.ml`: https://github.com/c-cube/ocaml-containers/blob/master/conv.ml
.. _`Batteries Included`: http://ocaml-batteries-team.github.io/batteries-included/hdoc2

Gory Details
------------

The module ``Conv`` contains four main concepts that go pairwise. The first
two concepts, *universal sinks* and *sources*, are used for serialization,
and the concepts *universal sources* and *sinks* are used for de-serialization.
If you're bored with the details jump to `the conclusion`_.

Universal Sinks
^^^^^^^^^^^^^^^

A ``'a Conv.UniversalSink.t``
is a builder for the serialization type ``'a``. The type ``'a`` must be
buildable from basic values (strings, integers, booleans) and composite
structures such as sum types, records and lists.

I implemented a few examples of such universal sinks in the ``Conv`` module, to
``JSON``, ``B-encode`` and ``Sexplib.Sexp.t`` (a popular S-expressions
library). The implementation for the ``JSON`` sink is the following:

.. code-block:: ocaml

    module Json = struct
      type t = [
        | `Int of int
        | `Float of float
        | `Bool of bool
        | `Null
        | `String of string
        | `List of t list
        | `Assoc of (string * t) list
      ]


      let sink : t UniversalSink.t =
        let open UniversalSink in
        { unit_ = `Null;
          bool_ = (fun b -> `Bool b);
          float_ = (fun f -> `Float f);
          int_ = (fun i -> `Int i);
          string_ = (fun s -> `String s);
          list_ = (fun l -> `List l);
          record = (fun l -> `Assoc l);
          tuple = (fun l -> `List l);
          sum = (fun name l -> match l with
            | [] -> `String name
            | _::_ -> `List (`String name :: l));
        }
   end


Here we first define a ``Json.t`` type (compatible with
`Yojson <http://mjambon.com/yojson.html>`_) and then a universal sink
for this json type. To do this we provide a bunch of functions (wrapped
in a structure) that respectively detail how to convert a value
of type ``unit``, of type ``int``, of type ``string``, etc. into ``JSON``. It
also details how to encode lists of ``JSON`` values into ``JSON``,
records (we use ``JSON`` objects, and so on).

A second example is S-expressions.

.. code-block:: ocaml

    module Sexp = struct
      type t =
        | Atom of string
        | List of t list

      let sink =
        let open UniversalSink in
        { unit_ = List [];
          bool_ = (fun b -> Atom (string_of_bool b));
          float_ = (fun f -> Atom (string_of_float f));
          int_ = (fun i -> Atom (string_of_int i));
          string_ = (fun s -> Atom (String.escaped s));
          list_ = (fun l -> List l);
          record = (fun l -> List (List.map (fun (a,b) -> List [Atom a; b]) l));
          tuple = (fun l -> List l);
          sum = (fun name l -> match l with
            | [] -> Atom name
            | _::_ -> List (Atom name :: l));
        }
    end

The type ``Sexp.t`` is the same as ``Sexplib.Sexp.t`` (which would be used
instead in a real setting). We provide the same set of projections to
``Sexp.t`` but have to make different choices at some places: for instance,
to encode a record, there is no primitive way of doing this so instead
we use lists of pairs of strings and values. An OCaml record ``{x=42; y="foo"}``
will therefore be encoded into the S-expression
``(("x" "42") ("y" "foo"))``. Same goes for sums.

Sources
^^^^^^^

A ``'a Conv.Source.t`` is basically a function
``'b. 'b Conv.UniversalSink.t -> 'a -> 'b``. It means that a ``'a source``
can take any universal sink (encoding to the serialization format ``'b``),
any value of type ``'a``, and encode the latter into ``'b``. If the universal
sink describes how to build ``JSON``, then you effectively can translate values
of type ``'a`` into ``JSON``; if the sink describes how to build S-expressions
you can use *the same source* to convert ``'a`` into S-expressions.

Let us detail the two examples provided in ``Conv``: the option type,
a record ("point") and a recursive algebraic type ("lambda", a basic lambda-calculus term).

.. code-block:: ocaml

    let opt src = Source.(
      sum
        (function
        | Some x -> "some", hcons src x hnil
        | None -> "none", hnil)
    )

    module Point = struct
      type t = {
        x : int;
        y : int;
        color : string;
        prev : t option; (* position at previous time step *)
      }

      let source =
        Source.(record_fix
          (fun self ->
            field "x" (fun p -> p.x) int_ @@
            field "y" (fun p -> p.y) int_ @@
            field "color" (fun p -> p.color) string_ @@
            field "prev" (fun p -> p.prev) (opt self) @@
            record_stop
          ))
    end

    module Lambda = struct
      type t =
        | Var of string
        | App of t * t
        | Lambda of string * t

      let source = Source.(sum_fix
        (fun self t -> match t with
            | Var s -> "var", hcons string_ s @@ hnil
            | App (t1, t2) -> "app", hcons self t1 @@ hcons self t2 @@ hnil
            | Lambda (s, t) -> "lam", hcons string_ s @@ hcons self t @@ hnil
          ))
    end

Here we use the combinators from ``Conv.Source`` to build descriptions of
points and lambda-terms. Note the ``record_fix`` and ``sum_fix`` that are
used to build recursive types (respectively recursive records and recursive
sums). GADTs [#gadt]_ are used to build heterogeneous lists of sub-values that
are to be converted too.

The combinators for records and sums respectively require to provide a
(heterogeneous) list of record fields with their names and accessor functions,
and a projection function that maps sum constructors to strings and a list
of arguments.

.. _`the section about sinks`:

Sinks
^^^^^

Now, say we want to de-serialize some ``JSON`` object (or ``S-expression``)
into a OCaml value. Black magic notwithstanding, we clearly need some
description of the type we expect (for instance "list of pairs of integer
and string"). Such a description will be called a **sink**. In practice
a sink for an expected type ``'a`` is a value of type ``'a Conv.Sink.t``,
implemented as a nice GADT seen in the following code listing.
To build records, tuples or sums we need heterogeneous lists (the ``hlist``
and ``record_sink`` types).

.. code-block:: ocaml

   module Sink = struct
     type 'a t =
       | Unit : unit t
       | Bool : bool t
       | Float : float t
       | Int : int t
       | String : string t
       | List : (('b t -> 'b list) -> 'a) -> 'a t
       | Record : 'a record_sink -> 'a t
       | Tuple : 'a hlist -> 'a t
       | Sum : (string -> 'a hlist) -> 'a t
       | Map : 'a t * ('a -> 'b) -> 'b t
       | Fix : ('a t -> 'a t) -> 'a t

     and 'r record_sink =
       | RecordField : string * 'a t * ('a -> 'r record_sink) -> 'r record_sink
       | RecordStop : 'r -> 'r record_sink

     and 't hlist =
       | HCons : 'a t * ('a -> 't hlist) -> 't hlist
       | HNil : 't -> 't hlist
   end

and again our ``option``, ``point`` and ``lambda`` examples:

.. code-block:: ocaml

    let opt sink = Sink.(
      sum (function
          | "some" -> sink |+| fun x -> yield (Some x)
          | "none" -> yield None
          | _ -> __error "unexpected variant %s" name)
    )

    module Point = struct
      type t = {
        x : int;
        y : int;
        color : string;
        prev : t option; (* position at previous time step *)
      }

      let sink =
        Sink.(record_fix
          (fun self ->
            field "x" int_ @@ fun x ->
            field "y" int_ @@ fun y ->
            field "color" string_ @@ fun color ->
            field "prev" (opt self) @@ fun prev ->
            yield_record {x;y;color;prev}
          ))
    end

    module Lambda = struct
      type t =
        | Var of string
        | App of t * t
        | Lambda of string * t

      let sink = Sink.(sum_fix
        (fun self str -> match str with
          | "var" -> string_ |+| fun s -> yield (Var s)
          | "app" -> self |+| fun t1 -> self |+| fun t2 -> yield (App (t1, t2))
          | "lam" -> string_ |+| fun s -> self |+| fun t -> yield (Lambda (s, t))
          | _ -> __error "expected lambda term"
        ))
    end

**Note**: ``|+|`` is an infix constructor for ``hlist`` and we again provide
fixpoint combinators ``record_fix`` and ``sum_fix``. In OCaml >= 4.01.0,
the operator ``@@`` just applies its left argument to its right one,
but is right-binding, so that ``f @@ g @@ x`` means ``f (g x)``.

In the ``opt`` combinator, we see that given a sum starting with
``"some"`` we require one value (whose structure is described by
the argument ``sink``) and provide a continuation
``fun x -> yield (Some x)``. If the sum had one argument and we could de-serialize it
using ``sink``, the de-serialized value is passed to the continuation that
simply wraps it into a ``Some`` constructor. We also note that
if the ``opt`` combinator is given a sum starting with an unknown name (neither
``"none"`` nor ``"some"`` an exception is raised).

We don't have to follow the exact structure of a type when describing how
to serialize or deserialize it. We have the freedom to ignore some fields
of a record, or even to map (using
``Conv.Sink.map : ('a -> 'b) -> 'a sink -> 'b sink``, and the ``Source`` equivalent
``Conv.Source.map : ('a -> 'b) -> 'b source -> 'a source``). Mapping can be
very useful if we want to serialize sets or arrays as if they were just
lists (rather than balanced trees or other private, specific structure).

Universal Sources
^^^^^^^^^^^^^^^^^

As a dual to universal sinks, some serialization formats are actually designed
to be read back to proper data structures. In order to do this we need
a way to read the structure of a ``JSON`` value (or any other serialization
format); here come **universal sources**. Such a universal source is a function
that recursively traverses the serialized value, and the **sink**
(See `the section about sinks`_)
that describes which type we expect.

Again, let's read the universal sources for ``Json.t`` and ``Sexplib.Sexp.t``.
Here the attentive reader may notice that during the traversal of JSON values
(or S-expressions), the universal source sometimes needs to peek at
what is expected by the ``Sink.t``. In particular, if the value at hand is
a S-expression atom (a ``string``), we need to discriminate:

- if the sink requires a string, it's direct;
- if the sink requires a sum, then it must be a sum with no arguments;
- if the sink requires an int, we try to read an integer from the string
  (built-in combinators already do that).

Similarly, when a list of S-expressions starting with a string is met,
we need to peek at the expected structure to choose between yielding
a list or yielding a sum (whose constructor is the first string).

.. code-block:: ocaml

    module Json = struct
      type t = [
        | `Int of int
        | `Float of float
        | `Bool of bool
        | `Null
        | `String of string
        | `List of t list
        | `Assoc of (string * t) list
      ]

      let source =
        let module U = UniversalSource in
        (* recursively traverse the JSON, mapping it to the given 'b Sink.t *)
        let rec visit : type b. b Sink.t -> t -> b =
        fun sink x -> match x with
          | `Int i -> U.int_ sink i
          | `Float f -> U.float_ sink f
          | `Bool b -> U.bool_ sink b
          | `Null -> U.unit_ sink
          | `String s ->
              begin match Sink.expected sink with
              | Sink.ExpectSum -> U.sum ~src sink s []
              | _ -> U.string_ sink s
              end
          | `List ((`String name :: l) as l') ->
              begin match Sink.expected sink with
              | Sink.ExpectSum -> U.sum ~src sink name l
              | _ -> U.list_ ~src sink l'
              end
          | `List l -> U.list_ ~src sink l
          | `Assoc l -> U.record ~src sink l
        and src = { U.visit=visit; } in
        src
    end
    module Sexp = struct
      type t =
        | Atom of string
        | List of t list

      let source =
        let module U = UniversalSource in
        let rec visit : type b. b Sink.t -> t -> b =
        fun sink x -> match x, Sink.expected sink with
          | Atom s, Sink.ExpectSum -> U.sum ~src sink s []
          | List (Atom name :: l), Sink.ExpectSum -> U.sum ~src sink name l
          | List l, Sink.ExpectRecord ->
              let l' = List.map (function
                | List [Atom name; x] -> name, x
                | _ -> __error "get List, but expected Record") l
              in U.record ~src sink l'
          | Atom s, _ -> U.string_ sink s
          | List [], Sink.ExpectUnit -> U.unit_ sink
          | List l, _ -> U.list_ ~src sink l
        and src = { U.visit=visit; } in
        src
    end

.. _`the conclusion`:

Conclusion
----------

The module ``Conv`` defines combinators to describe how to:

- inject values into a serialization format (using ``UniversalSink.t``);
- convert values of a type ``'a`` into any ``'b UniversalSink.t`` to
  eventually get a value of type ``'b`` that can be sent on the network
  or written on the disk;
- build values of a user type ``'a`` from some **universal source**,
  following a blueprint ``'a Sink.t``;
- traverse serialized values of type ``'b``
  (in parallel with the traversal of a ``'a Sink.t`` value)
  following a ``'b UniversalSource.t``, to eventually obtain a de-serialized
  value of type ``'a``... Or an exception.

.. rubric:: Footnotes:

.. [#gadt] Since OCaml >= 4.00.0. A really nice feature of the type system.
.. [#codegen] Descriptions of types could still be generated automatically,
   it's an orthogonal problem. The point is that it's not required.
.. [#printing] In `Batteries Included`_ every module that has a type ``t``
    defines a value ``val print : t printer``; polymorphic types define
    combinators such as ``val print : 'a printer -> 'a t printer``, etc.
