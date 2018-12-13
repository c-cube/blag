+++
date  = 2015-10-16
title  = "Tooling is Awesome"
[taxonomies]
author = ["simon"]
tags = ["ocaml,merlin,inotify"]
+++

A quick note about my current OCaml setup, in my last project, [Nunchaku](https://github.com/nunchaku-inria/nunchaku/).

Oasis
=====

First, I use [Oasis](http://oasis.forge.ocamlcore.org/) to manage and build the project. It relies on OCamlbuild, but brings in several niceties:

-   automatic generation of `configure` and `Makefile` files.
-   it deals with sub-libraries, and the `configure` script can enable or disable the build of each sub-library.
-   it builds and runs my tests. Yay!

Merlin
======

Oh dear. [Merlin](https://github.com/the-lambda-church/merlin) has improved my workflow with OCaml so much that I can't imagine working without it now. I can use it with Vim, but it also works for emacs users, so everyone is happy. The basics features I use are the ability to ask for the type of any expression (cursor on it, then `\t`), and the omni-completion of functions and modules in the same project or from (ocamlfind) libraries.

Incidentally, my vim setup includes a file `~/.vim/after/ftplugin/ocaml.vim` containing

```vim
au filetype ocaml   :setlocal comments=sr:(*,m1:\ ,e:*)
au filetype ocaml   :nmap <leader>d :MerlinDestruct<CR>
au filetype ocaml   :nmap <leader>r :MerlinRename

au filetype ocaml   :syn sync maxlines=1500
```

The two middle lines are key bindings:

-   map `\d` to `:MerlinDestruct`, which decomposes variables into constructors in pattern matches.
-   map `\r` to `:MerlinRename`, to easily change the name of functions or variables (yes, it's better than a regex, because it knows about scoping).

Auto rebuild
============

The Makefile contains a target `make watch` that will loop forever, watching for changes in `.ml` files to recompile. It looks like this (careful, use tabs, as always with Makefiles):

```sh
# OASIS_START
# OASIS_STOP

watch:
    while find src/ -print0 | \
     xargs -0 inotifywait -e delete_self -e modify ;\
    do \
      echo "============ at `date` ==========" ; \
      make ; \
    done
```

Conclusion
==========

Well, that's it. I also use some other things, including of course [Opam](http://opam.ocaml.org/) and [opam.vim](https://github.com/rgrinberg/opam.vim).

I will post something about the internals of Nunchaku some day, it has a cool 5-arguments GADT ;-)
