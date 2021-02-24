+++
date = 2021-02-23
title = "Curry-Howard is a scam"
slug = "curry-howard-scam"
[taxonomies]
authors = ["simon"]
tags = ["logic"]
+++

The
[Curry-Howard correspondence](https://en.wikipedia.org/wiki/Curry%E2%80%93Howard_correspondence)
has been talked about a lot recently, not only in Haskell circles, but also
among CiC-based proof assistant practitioners (Coq, Lean, etc.).
In a nutshell, it makes a deep parallel between "programs" (terms of some flavor
of lambda calculus, typically), and "proofs" (these programs are a proof of their type,
or more precisely they are witnesses that their types are inhabited).
The most basic example is `id x = x` which, in Haskell, would be a proof of
$ \forall a. a \rightarrow a $, a trivial theorem of propositional logic.

That's all good and well, but my point here is that _in practice_, the equivalence is
not as interesting as it first looks.

<!-- more -->

## Programs are not really proofs

A real program (i.e. one that is written to be executed and do something useful)
is not really a proof of anything interesting.
Pedantically, a haskell program has type `IO ()`, which is not really a valid
proposition. But even beyond that, if we look just below the surface of `main`,
nothing has that interesting a type:

A classic Haskell program that is used by people is [pandoc](https://pandoc.org/).
Most of what it does could be described as `Doc Markdown -> Doc Html` (or
a similar pair of document formats). So you have a "proof" that these two trees
can be somehow mapped onto one another. No mathematician will fawn over that.

Servers written in Haskell, like webservers, would have the type `request -> IO response`
(or something close to that, maybe `request -> M response` for some custom monad `M`)
if you look inside the server loop. Again that's not really mathematically interesting.

It's only if you look in combinator libraries (like Parsec, say) that types get more generic,
and start looking more like formulas. Things like `flip : (a -> b -> c) -> b -> a -> c`
are as generic as it gets… and are proofs of super trivial propositional logic theorems.
In fact you can't even state much in Haskell, any real mathematical statement will at least
require first-order logic (which corresponds to dependent types — no mainstream
language features these beyond, er, C++). Idris could _possibly_
have some interesting proofs that are also real programs… if it were designed to
be a proof assistant and not a beefed-up programming language.

If anyone has a useful program that is also actually a proof of something non
trivial, I'd be happy to be proven wrong.

## Proofs are not really programs

What is the program corresponding to a proof of
"there exists an infinite number of primes"?
If I run this program, what input does it takes, and what do I get as an
output?

I don't have a direct answer to that question. If you develop this proof in Coq,
using a `Prop` typed statement, I don't even think it could be extracted to OCaml
and compiled.

For most of mathematics, I have no idea what the "programs" corresponding to proofs
found in textbooks would look like, nor what they would compute. There are
very complicated lambda terms for these proofs, but what they compute is
unclear.

### A concession

A domain where CH **does** make sense to me, is algorithms (written in a functional
style) that are used as _existential witnesses_ of some property.
For example, the Euclid GCD algorithm is, in a very real sense, a proof that
two natural numbers have a GCD. You can write some Coq or Lean code that
computes the GCD of two numbers and proves that it's indeed their greatest divisor.

That said, I don't know of any large program written this way. It's a labor intensive
way of writing programs, even compared to alternatives like [why3](https://why3.lri.fr/)
where you can cleanly separate the code and the specification, and ask automatic provers
to do as much proving as possible for you.

## But what about Compcert/SEL4/… ?

Let's look at [Compcert](https://compcert.inria.fr/), famously one of the largest
programs written in Coq.
I suppose the main type is `compile : C_program -> Option Asm_program`
or something like that (I'm no expert on Compcert so I could be very wrong).
However, as far as I know, it's not written in a purely dependent style: proofs are
separated from the "real code" part of the development. This means
we don't get $\forall x: \text{C_program} -> Option {y : \text{ASM_program} | R(x,y)}$
where $R(x,y)$ would mean that $x$ and $y$ have the same semantics; rather you
have `C_program -> ASM_program` and proofs on the side that the function preserves
its input's semantic.

For SEL4 it's developed with Isabelle/HOL, which isn't dependently typed
and is classical logic.

## Conclusion

The title was click-baity, of course 🙂. But I do think that CH is over-hyped,
because the correspondence is ~~only~~ mostly interesting abstractly; in practice things
are either a (interesting) program, or a (interesting) proof, but not both
at the same time.


<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<script>
MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']]
  }
};
</script>
