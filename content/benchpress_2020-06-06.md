+++
date = 2020-06-06
title = "Benchpress hacking: log 1"
slug = "benchpress-hacking-log1"
[taxonomies]
authors = ["simon"]
tags = ["ocaml","benchpress","httpd"]
+++
<link rel="stylesheet" type="text/css" href="/asciinema-player.css"/>

I've decided I want to resume blogging. So without further ado,
here's a short piece about one of my side projects:
[benchpress](https://github.com/sneeuwballen/benchpress)
(with a live hosting [of the web ui](https://benchpress.cedeela.fr/)).

In short, benchpress is a tool I use for running _provers_, by which I mean, generally,
command-line tools that take a logic problem as input, and output something
about the file such as "it's a valid theorem" or "it typechecks" or some
sort of failure or timeout. The idea is to make it easy to run a tool you're
developing (e.g. [E](eprover.org/),
[Zipperposition](https://github.com/sneeuwballen/zipperposition),
[Batsat](https://github.com/c-cube/batsat/), [Archsat](https://github.com/Gbury/archsat/), etc.)
on a large set of benchmarks, and analyze the results.

<!-- more -->

## Overview

Currently [Benchpress](https://github.com/sneeuwballen/benchpress/tree/19ecfca231112c053d41ae4d045e5e4a683b36dc)
is composed of two distinct tools that share a common library:

- `benchpress` is a CLI tool with subcommands such as `benchpress run`,
  which I tend to put in makefiles as `make benchpress-foobar` to run
  the solver I'm developping on some set of files labelled `foobar`
  which a bunch of preset parameters.

  <details><summary>a sample run of benchpress</summary>
  <div style="width=1200px">
  <asciinema-player src="/benchpress.cast"></asciinema-player>
  <script src="/asciinema-player.js"></script>
  </div>
  </details>

- `benchpress-server` is a daemon embedding a
  [tiny httpd](https://github.com/c-cube/tiny_httpd) server to visualize results
  produced by `benchpress run`.

Anyhow. Currently my friend [Guillaume Bury](https://gbury.eu/) and myself are working
on different things: Guillaume is stress testing benchpress by running
hundreds of thousands of job pairs at once,
for his tool [dolmen](https://github.com/Gbury/dolmen/),
and I work a bit on the web UI and a dynamic notification system.
Together we worked on [a previous tool](https://github.com/c-cube/frog-utils)
to the same effect.

## Storage of results with sqlite

An interesting (imho) design decision that was made at the beginning of the
current iteration of benchpress, is to store the result of each run into
a separate [sqlite](https://sqlite.org/) file. These files can be safely
copied from a big workstation onto someone's machine, they can be deleted,
backuped, etc. quite nicely.

Yet, it's useful to compare the results from distinct runs, to find regressions
or improvements between successive versions of a tool.
The killer sqlite feature that enables that is
[its ability](https://www.sqlite.org/lang_attach.html)
to query several files at the same time, by attaching them onto an existing
database.
The [code to compare two files](https://github.com/sneeuwballen/benchpress/blob/19ecfca231112c053d41ae4d045e5e4a683b36dc/src/core/Test_compare.ml#L41)
does exactly that, onto an in-memory database.
Sqlite also provides excellent indexing into the tables of results (which can
now reach hundreds of thousands of results in one run);
this makes the web interface quick to produce results.

## Web UI architecture

The web UI is pretty basic. It's almost entirely static, produced via tiny
[tiny httpd](https://github.com/c-cube/tiny_httpd) (which serves the content
over http/1.1) and [tyxml](https://github.com/ocsigen/tyxml/) (which
provides well-typed combinators for producing the html).
[Bootstrap](https://getbootstrap.com/) helped make the UI not too ugly,
as I don't know anything about modern CSS.
I found class-based CSS to be quite convenient.

Sqlite is used for answering most queries. The notable exception is the main
page, which lists results by exploring the `~/.local/share/benchpress`
directory (xdg compliant); but even then, each result has a summary
associated that is lazily loaded and incurs a query to gather metadata
such as the set of solvers used in this run, the number of problems,
and the total clock time it took.
Lazy loading is achieved via a tiny piece of javascript.
