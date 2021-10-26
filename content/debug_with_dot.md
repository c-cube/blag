+++
date = 2012-11-30
title = "Debugging with DOT"
slug = "debug-with-dot"
[taxonomies]
tags = ["dot","debug","logic","proof","simon"]
+++
# Rationale
I'm starting a PhD on first-order automated theorem proving, which is the reason I'm writing an [experimental theorem prover](http://github.com/c-cube/zipperposition/) in OCaml. Theorem provers are full of complicated algorithms (that I plan to write on later), and my usual techniques for debugging are twofold:

1.  Writing a lot of `assert` to make sure invariants are not broken
2.  Printing debug information on stdout, if required, to get an idea of what the prover is doing. This allows me to choose the level of detail of what is printed, depending on which incorrect behavior I'm tracking.

The second technique, also known as *printf debugging*, is quite powerful (especially since OCaml does not feature a great debugger as an alternative). However, text is not great for representing structured data, and especially **graphs**. Here is where I bring [DOT](http://graphviz.org/) into play.

<!-- more -->

# A detailed example

DOT allows one to describe very simply (oriented) graphs, and to produce images from this description. To illustrate the difference between text and such images, let us take an example from logic:

```prolog
% prove that set equality is transitive
fof(a1, axiom, ![A,B]: (equ(A, B) <=>
                        ![C]: (contains(A, C) <=> contains(B, C)))).

fof(goal, conjecture, ! [A, B, C]:
                      ((equ(C, B) & equ(B, A)) => equ(C, A))).
```

This is a logic problem, expressed in the [TPTP](http://www.cs.miami.edu/~tptp/%20/) format (a standard format for first-order logic problems). It is composed of an *axiom*, that defines equality `equ` using the notion of membership. Then, a *conjecture* (the goal to prove) states that equality is transitive.

My prover, on this example, outputs this trace (brace yourselves):

    $ ./zipperposition.native -progress -calculus delayed pelletier_problems/equivalence.p -dot proof.dot
    % format: debug, print sort: false, print all: false
    % process file pelletier_problems/equivalence.p
    % parsed 2 clauses
    % rewrite rule: equ(X2, X1) --> •∀(contains(X2, •0) = contains(X1, •0))
    % definition: equ(X2, X1) == •∀(contains(X2, •0) = contains(X1, •0))
    % found precedence after 1 attempts, cost 0 / 7
    % signature: sig equ > contains > •s > •0 > sk2 > sk1 > sk0 > •= > •→ > •∀ > •∃ > •λ > •| > •& > •¬ > $false > $true
    % use indexing structure fp
    % selection function: SelectComplex
    0 steps; 0 active; 4 passive% ===============================================
    % done 8 iterations
    % hashcons stats for terms: size 5003, num 139, sum length 414, buckets: small 0, median 0, big 3
    % hashcons stats for clauses: size 5003, num 14, sum length 42, buckets: small 0, median 0, big 3
    % proof state stats:
    %   active clauses   5
    %   passive clauses  3
    % superposition calls            ... 14
    % equality_resolution calls      ... 0
    % equality_factoring calls       ... 0
    % subsumption calls              ... 2
    % subsumed_in_set calls          ... 5
    % subsumed_by_set calls          ... 14
    % basic_simplify calls           ... 166
    % demodulate calls               ... 42
    % demodulate steps               ... 3
    % fresh_clause                   ... 260
    % final signature: sig equ > contains > •s > •0 > sk3 > sk2 > sk1 > sk0 > •= > •→ > •∀ > •∃ > •λ > •| > •& > •¬ > $false > $true
    % print state to proof.dot
    % SZS status Theorem
    % SZS output start CNFRefutation
    []
        <--- demod with [[contains(sk0, sk3) != contains(sk2, sk3)*] at ε with {}], 
                        [[contains(sk0, X0) = contains(sk1, X0)*] at ε with {}], 
                        [[contains(sk1, X0) = contains(sk2, X0)*] at ε with {}]
    [contains(sk0, sk3) != contains(sk2, sk3)*]
        <--- elim with [[¬•∀(contains(sk0, •0) = contains(sk2, •0))+*] at ε with {}]
    [contains(sk0, X0) = contains(sk1, X0)*]
        <--- elim with [[•∀(contains(sk0, •0) = contains(sk1, •0))*] at ε with {}]
    [contains(sk1, X0) = contains(sk2, X0)*]
        <--- elim with [[•∀(contains(sk1, •0) = contains(sk2, •0))*] at ε with {}]
    [¬•∀(contains(sk0, •0) = contains(sk2, •0))+*]
        <--- demod with [[¬equ(sk0, sk2)*] at ε with {}], 
                        [[equ(X1, X0) = •∀(contains(X1, •0) = contains(X0, •0))*] at ε with {}]
    [•∀(contains(sk0, •0) = contains(sk1, •0))*]
        <--- sup+ with [[equ(X2, X1) = •∀(contains(X2, •0) = contains(X1, •0))*] at 0.1 with {X1 → sk1, X2 → sk0}], 
                       [[equ(sk0, sk1)*] at 0.1 with {X1 → sk1, X2 → sk0}]
    [•∀(contains(sk1, •0) = contains(sk2, •0))*]
        <--- sup+ with [[equ(X2, X1) = •∀(contains(X2, •0) = contains(X1, •0))*] at 0.1 with {X1 → sk2, X2 → sk1}], 
                       [[equ(sk1, sk2)*] at 0.1 with {X1 → sk2, X2 → sk1}]
    [¬equ(sk0, sk2)*]
        <--- elim with [[¬((equ(sk0, sk1) •& equ(sk1, sk2)) •→ equ(sk0, sk2))*] at ε with {}]
    [equ(X1, X0) = •∀(contains(X1, •0) = contains(X0, •0))*]
        <--- elim with [[•∀(equ(•0, X1) = •∀(contains(•1, •0) = contains(X1, •0)))*] at ε with {}]
    [equ(X2, X1) = •∀(contains(X2, •0) = contains(X1, •0))*]
        <--- elim with [[•∀(equ(•0, X1) = •∀(contains(•1, •0) = contains(X1, •0)))*] at ε with {}]
    [equ(sk0, sk1)*]
        <--- elim with [[(equ(sk0, sk1) •& equ(sk1, sk2))*] at ε with {}]
    [equ(sk1, sk2)*]
        <--- elim with [[(equ(sk0, sk1) •& equ(sk1, sk2))*] at ε with {}]
    [¬((equ(sk0, sk1) •& equ(sk1, sk2)) •→ equ(sk0, sk2))*]
        <--- elim with [[¬•∀(((equ(sk0, sk1) •& equ(sk1, •0)) •→ equ(sk0, •0)))*] at ε with {}]
    [•∀(equ(•0, X1) = •∀(contains(•1, •0) = contains(X1, •0)))*]
        <--- elim with [[•∀(•∀(equ(•0, •1) = •∀(contains(•1, •0) = contains(•2, •0))))*] at ε with {}]
    [(equ(sk0, sk1) •& equ(sk1, sk2))*]
        <--- elim with [[¬((equ(sk0, sk1) •& equ(sk1, sk2)) •→ equ(sk0, sk2))*] at ε with {}]
    [¬•∀(((equ(sk0, sk1) •& equ(sk1, •0)) •→ equ(sk0, •0)))*]
        <--- elim with [[¬•∀(•∀(((equ(sk0, •1) •& equ(•1, •0)) •→ equ(sk0, •0))))*] at ε with {}]
    [•∀(•∀(equ(•0, •1) = •∀(contains(•1, •0) = contains(•2, •0))))*]
        <--- axiom a1 in equivalence.p
    [¬•∀(•∀(((equ(sk0, •1) •& equ(•1, •0)) •→ equ(sk0, •0))))*]
        <--- elim with [[¬•∀(•∀(•∀(((equ(•2, •1) •& equ(•1, •0)) •→ equ(•2, •0)))))*] at ε with {}]
    [¬•∀(•∀(•∀(((equ(•2, •1) •& equ(•1, •0)) •→ equ(•2, •0)))))*]
        <--- axiom goal in equivalence.p
    % run time: 0.032

It describes a [DAG](http://en.wikipedia.org/wiki/Directed_acyclic_graph%20/) of inferences, that deduce clauses from other clauses, until the empty clause is found (which may never occur, first-order logic being undecidable).

Now the option `-dot proof.dot` produces [this file](../images/proof.dot); once translated using DOT,

```sh
$ dot -Tsvg proof.dot > proof.svg
```

the output gives a far better idea of the inferences, and an idea of the global structure of the proof. Take a look by yourself.

![image](../images/proof.svg)

Generating DOT
==============

DOT is remarquably easy to generate for simple graphs (avoiding complicated nodes, or subgraphs). The description is just a list of nodes and arrows between nodes.

```
node_6 [label="[•∀(contains(sk1, •0) = contains(sk2, •0))*]",shape=box,style=filled];
node_6 -> node_3 [label="elim"];
node_3 [label="[contains(sk1, X0) = contains(sk2, X0)*]",shape=box,style=filled];
```

Here we see two nodes of the graph, annotated by clauses (formulas), and an arrow that indicates that the second one is derived from the first one by eliminating a quantifier. The proof graph is generated by a [simple piece of OCaml code](http://github.com/c-cube/zipperposition/blob/61530e886353a577dea1dde802baf456594c39d1/src/proofState.ml#L235/) using a [module](https://github.com/c-cube/zipperposition/blob/61530e886353a577dea1dde802baf456594c39d1/src/dot.ml/) - I should use a library - for printing DOT graphs.

Conclusion: Using dot to produce automatically to reflect some internal state of your programs (e.g. tree-like or graph-like data structures) is easy and makes for more intuitive debugging.
