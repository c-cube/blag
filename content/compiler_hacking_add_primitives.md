+++
date = 2015-08-06
title  = "OCaml Compiler Hacking: how to add a primitive"
[taxonomies]
authors = ["simon"]
tags = ["ocaml","compiler","primitive","C"]
+++
I have been hacking on the OCaml compiler recently; in particular, I added [some support for coloring warning/error messages](https://github.com/ocaml/ocaml/pull/207). At some point during the discussion over this pull request, it became clear that colored output should only be enabled if `stderr` was an interactive terminal (in opposition to a regular file handle or whatnot). The compiler does not link with the `Unix` library, so I finally decided to add a primitive `caml_sys_is_interactive`. My purpose here is to explain how it works (from what I gathered) and how to do it.

<!-- more -->

I am not a compiler expert, some of the explanations here might be wrong or misleading. If you spot mistakes I will be happy to fix them.

What is a primitive?
====================

OCaml allows C functions to be used directly as primitives, that is, as basic operations of the language. The stdlib is full of such functions.

A primitive (generally named `caml_foo` since C is not namespaced) is generally located in a C file in `byterun/` (the directory containing the interpreter and runtime of OCaml). It is prefixed with `CAMLprim` and should take and return only C values of type `value` (that is, an OCaml value, as declared in `byterun/caml/mlvalues.h`).

Let's take an example: `Sys.file_exists : string -> bool`. The module `sys.ml` contains the following signature:

```ocaml
external file_exists : string -> bool = "caml_sys_file_exists"
```

and there is, in `byterun/sys.c`, the function `caml_sys_file_exists` (here in a simplified form):

```C
CAMLprim value caml_sys_file_exists(value name)
{
    struct stat st;

    char *p = String_val(name);
    int ret = stat(p, &st);

    return Val_bool(ret == 0);
}
```

This function uses macros defined in `byterun/caml/mlvalues.h` to convert between OCaml values and C values, but this is not the point of this post.

**note**: I have no idea how `CAMLprim` works, but there is a lot of magical automation that extracts a list of all primitives, exports their names in C arrays, etc. A primitive is a C function shipped with the runtime or a library (such as `Unix`), whereas some other functions are `CAMLexport` or `CAMLlocal` (I don't know exactly what that means).

**edit**: @gasche points that all the `CAMLfoo` primitives are documented in [the official manual](http://caml.inria.fr/pub/docs/manual-ocaml/intfc.html). In particular, writing C "stubs" (C functions that can be used directly from OCaml via a `external` declaration) requires, in general, using `CAMLparam` and `CAMLlocal` to ensure that the GC is aware that some values exist (either as parameters to the function, or as local variables).

How to add a primitive: Bootstrap!
==================================

It is a bad™ idea to add a primitive to, say, `byterun/sys.c` and use it in the compiler immediately. I tried it, and it failed to compile. The correct way, as I learnt from Jérémie Dimino (@diml) and Thomas Refis, is as follows:

1.  add the primitive into the relevant `.c` file, but do not *use* it yet anywhere in the compiler.
2.  `make world`. This compiles the interpreter and bytecode compiler.
3.  `make bootstrap`. This updates the bytecode archives (in `boot/`) of `ocamlc`, `ocamldep`, and `ocamllex`.

    Then, commit those new archives, as they will be needed to compile the compiler.

4.  make changes that use the new primitive, such as fancy coloring system. Using the primitive first requires to declare it as `external foo : a -> b = "caml_foo"` in one or more files.

    In other projects, [ctypes](https://github.com/ocamllabs/ocaml-ctypes) can be used instead of writing primitives by hand, depending on the programmers' preference.
5.  `make world world.opt tests` should now work properly.
6.  argue with @gasche about whether the primitive is useful or not ;-)

