Author: simon
Date: 5-02-2016
Title: Maki: on-disk memoization for (deterministic) fun and profit
Tags: ocaml,build,memoization,cache,make

Greating, earthlings! Today I will present an exciting new OCaml library
called **maki**. This post will be longer as usual, because it is actually
two posts in one:

- first, I'll present the goals of Maki, sketch its design, and present the
  most salient parts of its API;
- then I will demonstrate how to use it to quickly build a (very naive) OCaml build
  system, featuring parallel build and cached computations thanks to Maki.

## Overview of Maki

In a nutshell: `maki` is a OCaml library for **on-disk memoization**. It allows
you to cache the result of **pure** computations on the disk, with some special
support for computations that input or output files (and that are deterministic).
The initial use-case for it is to memoize the results of running theorem
provers on a large set of problems (to benchmark them), so that
the hours- or days-long computation is parallelized and interruptible at any
moment: to resume an interrupted computation, just re-compute everything
from scratch and let the memoization take care of not repeating what was
already done. In other words, it looks like this:

```ocaml
open Lwt.Infix

let benchmark
  : prover list -> file list -> (prover * result list) list Lwt.t
  = fun provers files ->
    (* no more than 10 simultaenous jobs *)
    let limit = Maki.Limit.create 10 in
    Lwt_list.map_p
      (fun p ->
        Lwt_list.map_p
          (fun f ->
            (* here be magic *)
            Maki.call ~limit (fun () -> run_prover_on_file p f)
          files
        >|= fun results ->
        prover, results)
      provers
```

This code would be very naive if it weren't for maki, because:

- we would be running `length provers * length files` sub-processes at the
  same time; if we have a lot of files this will freeze the machine
  or just not work;
- if we stop the computation before it completes, all the work is lost.

But the point is that `Maki.call (fun () -> run_prover_on_file p f)`
will only be computed once
for a given pair `(prover, file)`; if it was already computed before we
kill and restart the computation, then this call returns immediately with
the result. The parameter `limit` is there to limit the number of
jobs that run concurrently.
Maki builds on SHA1 (values are memoized by the hash of their computation)
and [Lwt](https://github.com/ocsigen/lwt/) (for concurrency and IOs;
`limit` is basically just `Lwt_pool.t` underneath).

Assume we had a list of files `f1, …, f100`, and provers `p1` and `p2`.
If we called `benchmark [p1;p2] [f1;...;f100]`, and we want to print
the results, nothing easier:

```ocaml
(* ... *)

let benchmark_and_print provers files =
  benchmark provers files >>= fun l ->
  print_results l

let () =
  benchmark_and_print [p1;p2] [f1;...;f100]

```

We can just run `benchmark_and_print` on the same list of provers and files;
it will call `benchmark` (which returns quickly because all its calls
to `run_prover_on_file` have been memoized), and print its results.
If we add a few files `f101,…,f105` to the list,
the only work to do is calling `run_prover_on_file p1 f10{1...5}` and
`run_prover_on_file p2 f10{1..5}`; the other 200 invocations are cached
and return immediately. If we hadn't run `benchmark` earlier,
however, then `benchmark_and_print` will first do all the
computations, cache them, and print the result.

The point is that for the user, all happens as if the **pure** computations
are done every time; the only difference is speed.

## The design and Implementation

The code first: [here is the repository](https://github.com/c-cube/maki/)
(and the [current API documentation](https://c-cube.github.io/maki/dev)).
The most important modules are:

- `Maki`: the main module and entry point to the library. It contains a few
  submodules; in particular, `Maki.Value` is used to describe how to store
  memoized results on the disk and retrieve them.
- `Maki_storage`: a basic abstraction of a persistent key-value store,
   with a very simple default implementation that stores a pair `key -> value`
   as a file `~/.cache/maki/key` containing `value`. It is possible to
   provide one's own implementation, for instance using a database.
- `Maki_bencode`: some serialization support.
- `Maki_log`: used mostly for debugging purpose.

In practice, memoizing a function is
[done this way](https://github.com/c-cube/frog-utils/blob/d02cf1009f233d2c51bd2f1db77970d284978d65/src/frogTest.ml#L434):

```ocaml
let call_prover_on_file ?limit prover file =
  let module V = Maki.Value in
  Maki.call_exn
    ?limit
    ~lifetime:(`KeepFor Maki.Time.(days 2))
    ~deps:[V.pack Config.maki config;
           V.pack_program prover;
           V.pack_file file]
    ~op:Res.maki
    ~name:"call_prover_on_file"
    (fun () -> actual_shell_invocation prover file)
```

What's going on here?

- `Maki.call_exn : […other arguments…] -> (unit -> 'a Lwt.t) -> 'a Lwt.t`
  is the actual memoization function. There is also
  `Maki.call : […] -> (unit -> 'a Lwt.t) -> ('a, exn) result Lwt.t` when
  error handling matters.

-   the parameter `deps` (not optional) describes the set of parameters `f`
    depends upon. When calling `Maki.call_exn ~deps f`, the user
    **promises** that `f ()` always returns the same results for the same value
    of `deps`. Conceptually, `Maki.call_exn f`
    is similar to `f ()`, but `f ()` is called only if its result couldn't be
    found on disk.

    In this case, we promise that `actual_shell_invocation prover file` returns
    the same result for fixed values of `(config, prover, file)` (the prover
    should be deterministic). `Maki.Value` contains some builtin
    serialization operators for basic values, files, programs, integers, lists,
    and sets.

- the parameter `op` describes how to serialize and deserialize the
  result of `f()`. If the result was cached, `op` is used to deserialize
  and return it; if it was not cached, `f()` is called, and its result
  is serialized and put on disk.

- the parameter `name` is the **unique** name of this computation.
  Caching is controlled by the pair `(name, serialization of deps)`

- the optional parameter `lifetime` controls how long the memoized value
  will stay on disk (here, we are allowed to remove it if
  it's not used for 2 days). More on this when I explain `maki_gc` below.

### The memoization scheme

Invoking `Maki.call_exn ~name ~deps ~op f` starts by mapping each
value in `deps` into a [Bencode](https://en.wikipedia.org/wiki/Bencode) value.
Each type is encoded in a different way; files are encoded into a pair
`(absolute_path, sha1)`, programs are looked up in `$PATH` and then
processed like files, lists are mapped to `Bencode` lists, etc.
Then, `name` and the encoding of `deps` are combined into a string `s`,
and `SHA1(s)` becomes the unique identifier of this computation (up to
very, very unlikely collisions).

The library looks `SHA1(s)` up in the file storage. If not found,
then `f()` is computed, obtaining `result`, and `op.to_bencode(result)` is
stored under the key `SHA1(s)`. This way, next time we ask for this
very same computation, `SHA1(s)` will be a cache hit and `f()` will
not be called!

In some sense, this is similar to how git, nix, and the likes
store immutable values by content (`maki` is a kind of Merkle tree since
the result of a computation is hashed before it is used as the
dependency of another computation). The difference is that we do not
access values by their content, but by the computation that produces them.

**Note**: most operations in `maki` are cached throughout a given process;
for instance, once the SHA1 of a file is computed, it is cached along with
the file's current `mtime` (and recomputed only if this timestamp changes).

### Cleaning the cache: `maki_gc`

Values are actually stored on disk with a few meta-data attributes,
including the `lifetime` parameter mentioned above. A simple tool called
`maki_gc` can be used to remove key/value bindings that have expired.

### What `maki` is not

- a reliable long-term storage (it's just caching!).
- a gigantic distributed system. It (currently) only works on one computer,
  although one can dream of a distributed implementation of `Maki_storage.t`
  based on memcache and a DHT.
- stable. Currently it's still in the "experimental" phase, but feedback is
  welcome!

## Case study: a toy build system

I think `maki` might be useful for many things involving heavy computations,
but since the name is derived from "make" I want to show how to build a
very naive build system for OCaml with it.
The code is [here](https://github.com/c-cube/maki/blob/1a7e715c4e16f452a26e5bed595870bc4304d079/src/demo_build/maki_build.ml) — a bit more than 300 lines for compiling
OCaml libraries and executables, parallelizing jobs, and avoiding
recompiling.

**Note**: do not use this in production, or kittens will die of sadness.

There is some boilerplate and code for corner cases, mapping module
names to file names, etc. in addition to parsing a `_oasis` file to get
a description of libraries and executables.
Let us review the central parts of the build system:

### Computing dependencies

The first function is `find_deps`. It takes a module `m`,
a list of libraries `deps` that are required for building `m`, and
the `path` in which `m` lives; it returns the list of modules `m`
depends upon using a **memoized** invocation of `ocamldep`.

```ocaml
(* other modules [m] depends on *)
let find_deps ~deps ~path m : string list Lwt.t =
  let file = module_to_ml ~path m in
  let pdeps = CCList.flat_map (fun d -> ["-package"; d]) deps in
  (* call "ocamldep" *)
  Maki.call_exn ~name:"find_deps" ~limit
    ~deps:[V.pack_program "ocamldep"; V.pack_file file; V.pack_set V.string pdeps]
    ~op:V.(set string)
    (fun () ->
       shellf "@[<h>ocamlfind ocamldep -modules %a %s@]"
         pp_strings_space pdeps file
       >|= fun (out,_,_) ->
       out
       |> CCString.Split.left_exn ~by:":"
       |> snd
       |> CCString.Split.list_cpy ~by:" "
       |> List.map String.trim
       |> List.filter (fun s -> s<>"")
    )
  >|= fun l ->
  Maki_log.logf 5 (fun k->k "deps of %s/%s: %a" path m pp_strings l);
  l
```

The body of the call consists in calling `ocamlfind ocamldep` in a shell
and parsing the output.
This result is then memoized using `~op:Maki.Value.(set string)` (the order of
the modules does not matter). It depends on the program `ocamldep`, the
module `m` (rather, the actual `.ml` file for `m`) and the list of library
dependencies. Indeed, if all those are fixed, `ocamldep` should always return
the same result.

### Finding recursive dependencies

When compiling an executable, we are only given the main module's name `m`,
so we need to discover the list of modules it depends on. The
function `find_local_deps_rec` returns this list (without duplicates), by a
recursive computation. Note that every step is memoized!

1. call `find_local_deps` (which is a wrapper of `find_deps`
   that only keeps dependencies in the same path), obtain a list `mdeps`
2. for each module `m'` in `mdeps`, compute its own recursive
   dependencies (possibly memoized already)
3. flatten the result and append `mdeps` (immediate dependencies)
4. remove duplicates

```ocaml
(* find recursive deps (without duplicates) *)
let rec find_local_deps_rec ~deps ~path m =
  let%lwt mdeps = find_local_deps ~deps ~path m in
  Maki.call_exn
    ~name:"find_local_deps_rec"
    ~deps:[V.pack_string m; V.pack_string path; V.pack_set V.string deps]
    ~op:V.(set string)
    (fun () ->
       Lwt_list.map_p (find_local_deps_rec ~deps ~path) mdeps
       >|= List.flatten
       >|= (fun l->List.rev_append mdeps l)
       >|= CCList.sort_uniq ~cmp:String.compare)
```

### Linking order

We skip on `build_interface`, which invokes `ocamlc` to build a `.cmi`,
for something more interesting. When linking an executable, we have to provide
all its modules in a topological order (that is, if `A` depends on `B`, then
`B` has to come earlier than `A` in the list). Again this is easy to write
in a naive way, as we can let `maki`'s memoization avoid duplicating
costly computations (such as calls to `ocamldep`):

1. given the list of modules to sort, compute `mdeps`, the direct
   dependencies of each module (using `find_deps`);
2. the mapping `m -> find_deps m` describes a directed graph; compute
   some topological ordering of this graph (here, using
   [containers's graph module](file:///home/simon/workspace/containers/containers.docdir/CCGraph.html). Since is is relatively cheap, we do not bother memoizing it.

```ocaml
(* find a topological ordering of given modules *)
let topo_order ~path ~deps modules : string list Lwt.t =
  let%lwt mdeps =
    Lwt_list.map_p
      (fun m ->
         find_deps ~deps ~path m
         >|= fun l -> m, List.filter (fun m' -> List.mem m' modules) l)
      modules
  in
  (* build a graph to obtain a topological order *)
  let g = CCGraph.make_tuple (fun m -> List.assoc m mdeps |> CCList.to_seq) in
  let l = CCGraph.topo_sort ~rev:true ~graph:g (CCList.to_seq modules) in
  Lwt.return l
```

### Compiling a `.cmo` file

Now for the final blow: compile a module into a `.cmo` bytecode file.
Native compilation is left as an exercise! Again, we just write the naive
code:

1. compute dependencies;
2. *compile each dependency, recursively and in parallel*;
3. build the `.cmi` interface;
4. build the `.cmo` file, memoizing the result as a file.

There are several interesting points here:

-   compiling a module `Foo` depends on several values:

    * the `ocamlc` program (if we
      modify the compiler, e.g. after an upgrade, then compiled files
      will change);
    * the input file `foo.ml` itself;
    * the library dependencies;
    * the list `m_deps'` (actually, a set): this is the list of `.cmo` that
      `Foo` directly depends upon. I think this is overkill for bytecode
      compilation, but it plays a role in native compilation since
      inlining can happen between modules.

- the `op` (used to serialize and deserialize the result)
  is `Maki.Value.file`. This means that the computation returns
  a file name, and the file's content is assumed to be the actual
  computation's result. In this case, the on-disk memoization table
  only contains the output's path + SHA1. Upon cache hit, `maki` will
  check if the file exists *and* if it has the correct hash;
  otherwise the computation is done again.

- the computation might fail (here, it just checks if the expected
  output file was produced).


```ocaml
(* build module [m] (after building its dependencies).
   @param path path in which [m] lives
   @param deps library [m] depends upon *)
let rec build_module ~path ~deps m : Maki.path Lwt.t =
  (* compute deps *)
  let%lwt m_deps = find_local_deps ~deps ~path m in
  (* build deps, obtain the resulting .cmo files *)
  let%lwt m_deps' =
    Lwt_list.map_p (fun m' -> build_module ~path ~deps m') m_deps
  in
  (* build interface *)
  let%lwt _ = build_interface ~path ~deps m in
  let file_ml = module_to_ml ~path m in
  let file_cmo = module_to_cmo ~path m in
  Maki.call_exn
    ~name:"build_module" ~limit
    ~lifetime:(`KeepFor Maki.Time.(hours 2))
    ~deps:[V.pack_program "ocamlc"; V.pack_file file_ml;
           V.pack_set V.string deps; V.pack_set V.file m_deps']
    ~op:V.file
    (fun () ->
       shellf "@[<h>ocamlfind ocamlc -I %s -c %a %a %s -o %s@]"
         path
         pp_strings_space (deps_to_args deps)
         pp_strings_space m_deps'
         file_ml file_cmo
       >>= fun (o,e,_) ->
       if Sys.file_exists file_cmo
       then Lwt.return file_cmo
       else failf_lwt "failed to build %s for %s:\n%s\n%s" file_cmo m o e)
```

After that, there is some glue code for parsing command line arguments,
linking libraries and executables (using `topo_sort` from above),
parsing the `_oasis` file, etc.
I tested this build system on a few small, pure OCaml projects (it doesn't
handle C bindings or packs!); it works and does a decent job at
parallelizing. Note, however, that it computes more hashes than most build
system (which are happy using the timestamp as a shortcut, since they
are not interesting in the produced files' content, but only their
being up-to-date w.r.t their sources).

## Conclusion

Well, that was quite a long post! I intended to give a tour of `maki` original
intent and design, and to demonstrate how to use it by showing this
baroque build system that-you-should-not-actually-use.

The idea should be quite straightforward to port to other languages, and in
particular Haskell where the notion of purity is enforceable in types
(although here we cut some slack to the user, allowing her to run sub-processes,
create files, etc. as long as determinism is guaranteed).

