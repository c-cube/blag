+++
date = 2012-12-18
title = "Go, C++!!"
slug = "go-cpp"
[taxonomies]
authors = ["shuba"]
tags = ["c++11"," concurrency"," go"]
+++

I've recently read an [interesting article](http://himmele.blogspot.fr/2012/11/concurrent-hello-world-in-go-erlang.html) which shows an example of concurrency implemented in 3 differenet languages, namely Go, Erlang and C++. While the Erlang and Go examples seemed clear and concise, the C++ one looks long and hard to understand. The reason behind this complexity is that C++ does not provide a simple message passing primitive such as Go channels.

Channels in C++
===============

So I wondered, is it possible to implement channels in C++, and thus be able to implement a simple concurrent Hello World concisely? The [go channel specification](http://golang.org/ref/spec#Channel_types) is quite simple: channels support two operations, sending data to a channel and reading from a channel. The channel has a capacity, and is non-blocking as long as it does not store as many elements as its capacity (hence a channel of capacity 0 is always synchronous). This calls for the following C++ signature:

```c++
template <typename T>
class channel
{
public:
  channel( int64_t capacity = 0 );
  void operator<<( const T & val ); //< send a value to the channel
  void operator>>( T& retVal); //< read a value from the channel
};
```

C++11 to the rescue
===================

Historically, C++ does not provide any cross-platform support for multithreading, but this has changed with C++11 and its support for [threading facilities](http://en.cppreference.com/w/cpp/thread) and [atomic operations](http://en.cppreference.com/w/cpp/atomic) . Among all these shiny new tools, I thought I would be able to find one to implement easily channels. I first thought of the channel with 0 capacity as a special case, and attempted to solve it beforehand. My first try made use of *futures* and *promises*, which enable waiting until a result is available. Using two promises I was able to successfully implement the synchronous behavior of channels, or thought so. One issue arose though: once their values have been retrieved, promises cannot be used any longer. I thought that swaping the useless promise with a new one would do the trick, but it turned out the swap was not atomic, so I could have concurrent access to the promise while I was swapping it, resulting in undefined behaviour. Protecting the promise swap with a mutex was not a reasonable option, as I was already using a mutex to protect it.

Atomic counters
===============

So I decided to throw my first attempt away, and to try and remember my concurrency courses, which dealt with atomicity and wait-free implementations. Of course I would not end up with a wait-free channel, as it is specified to wait in some cases. But I could try and reduce the use of waits as much as I could. The channel can be seen as a queue with pre-defined capacity. I recalled from my courses that queues can solve the [consensus problem](http://en.wikipedia.org/wiki/Consensus_%28computer_science%29) for 2 processes and thus require the use of a consensus primitive to be implemented. C++11 provides [compare and swap](http://en.cppreference.com/w/cpp/atomic/atomic_compare_exchange) and [fetch and increment](http://en.cppreference.com/w/cpp/atomic/atomic_fetch_add) as consensus primitives. Fetch and increment has a consensus number of 2, as the queue, so I picked it to implement my channel. The idea is to use two atomic counters to index an infinite array, one counter indicating the beginning of the queue and thus used by the dequeue operation, and the other indicating the end of the queue and used to append elements to the queue. The operations would block when the queue is either empty or full, depending on the operation. Of course, there can be no infinite array, but realising that there can never be more than the capacity plus one element to be stored, means the index can be taken modulo this constant. Hence this simple implementation:

```c++
template <typename T>
void
channel<T>::operator<<( const T & val )
{
  int64_t counterRight = m_counterRight.fetch_add( 1 );
  while ( counterRight - m_counterLeft.load( ) >= m_capacity )
  {
    std::this_thread::yield( );
  }

  m_data[counterRight%(m_dataSize)] = val;
}

template <typename T>
void channel<T>::operator>>( T & retVal )
{
  int64_t counterLeft = m_counterLeft.fetch_add( 1 );
  while ( m_counterRight.load( ) - counterLeft < 1 )
  {
    std::this_thread::yield( );
  }

  retVal = m_data[counterLeft%(m_dataSize)];
}
```

Concurrent Hello World, at last
===============================

This enables this very concise Hello World implementation:

```c++
#include <iostream>
#include <string>
#include <future>

#include "channel.hh"

static const int kGo = 0;
static const int kQuit = 1;
static const int kDone = 2;

int
main( )
{
  channel<int> sayHello(0), sayWorld(0), quitter(0);

  auto d = std::async( std::launch::async, [&]
      {
        for ( int i = 0; i < 1000; ++i )
        {
          std::cout << "Hello ";
          sayWorld << kGo;
          int a;
          sayHello >> a;
        }
        sayWorld << kQuit;
      } );

  auto b = std::async( std::launch::async, [&]
      {
        while ( true )
        {
          int reply;
          sayWorld >> reply;
          if ( reply == kQuit )
            break;
          std::cout << "world!\n";
          sayHello << kGo;
        }
        quitter << kDone;
      } );

  int a;
  quitter >> a;
  return 0;
}
```

Notice that I read the return values of the async calls, even though they are void:

```c++
auto b = std::async( std::launch::async, [&]...
```

This is because futures join when their destructors are called, which are called when the object they reference go out of scope. Thus if the return value is not read, the destructor is called immediately, which would result in the async calls to be in fact synchronous...

The code for the C++ channels can be found on [github](https://github.com/vbarrielle/cppChan/), feel free to test and tell me my code is buggy, I'd be glad to try and improve it.
