Author: Shuba
Date: 29-11-2012
Title: The inside of a curve
Tags: topology,graphics,2D
Slug: inside-a-curve

Hi, I am Shuba, and I'll be using this blog to dicuss various computer graphics
topics I find interesting. I might also disgress on C++, which is my main
programming language.

For my first article, I'll try and answer a question that's not as simple as it
seems: _onto what did I click?_  How did the program know what I clicked on?
We're used to be able to click on various kinds of button, rectangular or
circular. But when using image editing software such as The Gimp or Inkscape, we
want to select the freeform shapes we create.

# Connex components

The shapes in question are delimited by freeform curves which are drawn by the
user. But how does a curve define a region? To answer this question, let's dive
into topology.

A subset of the plane is _connex_ if any two points in that set can be joined by
a continuous line lying in that set. Let's consider a curve C, and the set S
containing the points of the plane that don't belong to C. The curve defines a
region if and only if S is not connex. The following picture shows a curve C
which does not define a region, and a curve D which defines one.

<img src="images/curve_region.png" width=700> . 

One can notice the second curve is closed. It turns out being closed, though not
necessary to define a region, is crucial if we want to define a coherent notion
of interior. Going through the curve should bring from the interior to the
exterior and vice versa. But this can not be achieved with an open curve, as the
following picture shows: the red arrow crosses the curve but both its start and
its end belong to the same connected component.

<img src="images/curve_no_valid_interior.png" width=350> 

# Inside a curve

We can now define the inside of a curve. Any[^mathematicians] closed curve
with no self intersections splits the plane into at two closed components,
one of which has no finite bounds. The bounded component is the interior of the
curve.

# Let's shoot lines
$ ax + by +c $




[^mathematicians]: Any continuous closed curve, if you're peeky...
