@id smart-pointers
@part p6
@title Smart pointers: `Box`, `Rc`, `RefCell` and friends
@short Smart pointers
@level advanced
@time 60
@learn Put data on the heap with `Box` and build recursive types | Explain what `Deref` and `Drop` do | Share ownership with `Rc` and break cycles with `Weak` | Change data behind a shared reference with `Cell` and `RefCell` | Pick the right pointer type for a task

A reference (`&T`) borrows a value and does nothing else. A **smart pointer** is a type that also points to data, but in addition **owns** it and adds some extra ability. You already know two: `String` and `Vec<T>` own a block of heap memory and manage it for you. This chapter introduces the smart pointers that are about ownership itself.

:::analogy Four kinds of key to the same store room
`Box` is your own locked room with one key: whoever holds the key owns everything inside, and the room is emptied when they leave. `Rc` is a shared flat where every flatmate gets a copy of the key, and the room is cleared only when the last of them leaves. `Weak` is a visitor pass: it can look in, but it does not keep the room alive. `RefCell` is a room with a sign on the door, "free" or "occupied", checked while you are there rather than at the door.
:::

| Type | In one sentence |
|---|---|
| `Box<T>` | one owner, data on the heap |
| `Rc<T>` | several owners, read-only, one thread |
| `RefCell<T>` | borrowing rules checked while the program runs, not at compile time |
| `Arc<T>`, `Mutex<T>` | the same ideas, safe to use from several threads ([chapter 31](#shared-state)) |

## `Box<T>`: a value on the heap

`Box::new(value)` moves a value to the heap and gives you a pointer to it. The box is the single owner. When the box goes out of scope, the heap memory is freed.

```rust run
fn main() {
    let boxed = Box::new(42);
    println!("{}", boxed);          // use it like the value inside
    println!("{}", *boxed + 1);     // `*` reaches the value explicitly

    let moved = boxed;              // moving a box copies only the pointer
    println!("{moved}");
}
```
```output
42
43
42
```

:::stepper A `Box` in memory
```rust
fn main() {
    let a = 42;
    let b = Box::new(42);
    let c = b;
    println!("{a} {c}");
}
```
2 | [main] a = 42 !new | - | A plain `i32` lives directly on the stack.
3 | [main] a = 42; b = ->#1 !new | #1 = 42 !new | `Box::new` asks for heap memory, moves the value there, and keeps a pointer on the stack. `b` owns the heap value.
4 | [main] a = 42; b = ->#1 !moved; c = ->#1 !new | #1 = 42 | Moving the box copies only the pointer. Ownership passes to `c`, and the value on the heap stays where it is.
5 | [main] a = 42; b = ->#1 !moved; c = ->#1 | #1 = 42 | Both values are printed.
6 | - | #1 = 42 !freed | At the end, `c` is dropped and frees the heap memory.
:::

Putting a single number in a box is pointless. A `Box` is needed in three situations.

### 1. Types that contain themselves

A list can be described as "an element, followed by a (shorter) list". A direct translation does not compile:

```rust fail E0072
enum List {
    Node(i32, List),
    End,
}

fn main() {
    let list = List::End;
}
```
```error auto lines=11
```

The compiler must know the size of every type. A `List` would contain a `List`, which contains a `List`, without end: "infinite size". The compiler's hint is the solution. A `Box` is a pointer, and a pointer has a fixed, known size, whatever it points to:

```rust run
enum List {
    Node(i32, Box<List>),
    End,
}

impl List {
    fn sum(&self) -> i32 {
        match self {
            List::Node(value, rest) => value + rest.sum(),
            List::End => 0,
        }
    }
}

fn main() {
    let list = List::Node(1, Box::new(List::Node(2, Box::new(List::Node(3, Box::new(List::End))))));
    println!("{}", list.sum());
}
```
```output
6
```

Each node owns the next one through a box. The same trick builds **trees**, which appear everywhere in programming: folders that contain folders, the nested structure of a web page, the parts of a mathematical expression.

```rust run
enum Expr {
    Number(f64),
    Add(Box<Expr>, Box<Expr>),
    Multiply(Box<Expr>, Box<Expr>),
}

fn evaluate(expr: &Expr) -> f64 {
    match expr {
        Expr::Number(n) => *n,
        Expr::Add(a, b) => evaluate(a) + evaluate(b),
        Expr::Multiply(a, b) => evaluate(a) * evaluate(b),
    }
}

fn main() {
    // (2 + 3) * 4
    let expr = Expr::Multiply(
        Box::new(Expr::Add(Box::new(Expr::Number(2.0)), Box::new(Expr::Number(3.0)))),
        Box::new(Expr::Number(4.0)),
    );
    println!("{}", evaluate(&expr));
}
```
```output
20
```

This is, in miniature, how compilers and calculators represent what you type.

:::note Do not build linked lists for everyday work
The linked list above is a teaching example. For a real sequence of values, a `Vec` is nearly always faster and simpler, because its elements sit side by side in memory.
:::

### 2. Trait objects

You met `Box<dyn Shape>` in [chapter 20](#traits). Values of different types have different sizes, so a collection of "anything that implements `Shape`" stores boxes, which all have the same size.

### 3. Large values

Moving a value copies its bytes. For a struct of several thousand bytes, moving a `Box` (one pointer) is cheaper than moving the struct itself.

## `Deref`: why a box feels like its content

You can call methods of the inner value directly on a box, and pass a `&Box<String>` where a `&str` is wanted. The trait **`Deref`** makes this possible. It defines what the `*` operator returns for a type. When the types of a reference do not fit, the compiler inserts as many `*` steps as needed. That is called **deref coercion**.

```rust run
fn shout(text: &str) {
    println!("{}!", text.to_uppercase());
}

fn main() {
    let boxed: Box<String> = Box::new(String::from("hello"));

    println!("{}", boxed.len());   // a method of String, called through the box
    shout(&boxed);                 // &Box<String> -> &String -> &str, automatically
}
```
```output
5
HELLO!
```

You have relied on this since [chapter 11](#slices-strings): `&String` turns into `&str`, and `&Vec<T>` into `&[T]`, by the same mechanism. `String` implements `Deref` with the target `str`.

## `Drop`: code that runs at the end

When a value goes out of scope, Rust runs its **destructor** and then frees its memory. With the trait **`Drop`** you supply your own clean-up code:

```rust run
struct Guard {
    name: &'static str,
}

impl Drop for Guard {
    fn drop(&mut self) {
        println!("cleaning up {}", self.name);
    }
}

fn main() {
    let _a = Guard { name: "first" };
    let _b = Guard { name: "second" };
    {
        let _inner = Guard { name: "inner" };
        println!("end of the inner block");
    }
    let early = Guard { name: "early" };
    drop(early);                              // drop it now, not at the end of the scope
    println!("end of main");
}
```
```output
end of the inner block
cleaning up inner
cleaning up early
end of main
cleaning up second
cleaning up first
```

- Values are dropped at the end of their scope, in the **reverse** order of their creation.
- `drop(value)` is an ordinary function that takes ownership of its argument and lets it go out of scope immediately.

You will rarely write `Drop` yourself. You benefit from it all the time: it is how a `File` closes itself, how a `Vec` frees its memory, and how a lock releases itself ([chapter 31](#shared-state)).

:::compare RAII
Tying a resource (memory, a file, a lock, a network connection) to a value, so that the resource is released when the value dies, is a technique from C++ with the awkward name **RAII** ("resource acquisition is initialization"). In Java, Python or Go you write `try … finally`, `with` or `defer` each time, and can forget it. In Rust the clean-up is attached to the type once, and then it cannot be forgotten.
:::

## `Rc<T>`: several owners

Ownership has one owner per value. Sometimes that does not describe reality. Imagine a city map in which several routes pass through the same stations. No route is "the" owner of a station. The station should exist as long as any route uses it.

`Rc<T>` (for "reference counted") allows several owners. It keeps a counter next to the value. Each `Rc::clone` adds one, each drop of an `Rc` subtracts one, and when the counter reaches zero, the value is freed.

```rust run
use std::rc::Rc;

fn main() {
    let station = Rc::new(String::from("Central Station"));
    println!("owners: {}", Rc::strong_count(&station));

    let route_a = Rc::clone(&station);
    let route_b = Rc::clone(&station);
    println!("owners: {}", Rc::strong_count(&station));

    drop(route_a);
    println!("owners: {}", Rc::strong_count(&station));
    println!("{} {}", station, route_b.len());
}
```
```output
owners: 1
owners: 3
owners: 2
Central Station 15
```

:::stepper Shared ownership with `Rc`
```rust
use std::rc::Rc;

fn main() {
    let a = Rc::new(String::from("shared"));
    let b = Rc::clone(&a);
    drop(a);
    println!("{b}");
}
```
4 | [main] a = ->#1 !new | #1 = count 1, "shared" !new | `Rc::new` puts the value on the heap together with a counter. One owner so far.
5 | [main] a = ->#1; b = ->#1 !new | #1 = count 2, "shared" | `Rc::clone` does **not** copy the text. It makes a second pointer to the same heap data and raises the counter to 2.
6 | [main] a = ->#1 !gone; b = ->#1 | #1 = count 1, "shared" | Dropping `a` lowers the counter to 1. The value stays alive, because `b` still owns it.
7 | [main] b = ->#1 | #1 = count 1, "shared" | The value is used through the remaining owner.
8 | - | #1 = count 0, "shared" !freed | `b` goes out of scope, the counter reaches 0, and only now is the memory freed.
:::

Three things to remember:

- **`Rc::clone(&a)` is cheap.** It copies a pointer and adds one to a number. By convention it is written as `Rc::clone(&a)` and not `a.clone()`, so that readers see at once that no data is copied.
- **The value is read-only.** An `Rc<T>` gives out only shared references. With several owners, a `&mut` would break the borrowing rules.
- **One thread only.** The counter is not protected against simultaneous changes. The compiler refuses to send an `Rc` to another thread. `Arc` is the thread-safe version.

:::compare `Rc` is a small garbage collector
Reference counting is how Python and Swift manage *all* their objects, and what `std::shared_ptr` does in C++. In Rust it is something you choose for the few values that need it. Everything else keeps the cheaper single-owner model.
:::

## Interior mutability: `Cell` and `RefCell`

The borrowing rules say: either many readers, or one writer. The compiler enforces this before the program runs. Occasionally the rule is too strict. You *know* a change is safe, but the structure of the program hides that from the compiler. For such cases there are types that let you change a value **through a shared reference**. This is called **interior mutability**.

### `Cell<T>`: for small `Copy` values

A `Cell` never hands out a reference to its content. You can only put a value in (`set`) or copy the value out (`get`). Nothing can be left dangling, so this is always safe:

```rust run
use std::cell::Cell;

struct Page {
    title: String,
    views: Cell<u32>,
}

impl Page {
    fn show(&self) -> &str {                  // note: &self, not &mut self
        self.views.set(self.views.get() + 1);
        &self.title
    }
}

fn main() {
    let page = Page { title: String::from("Home"), views: Cell::new(0) };
    page.show();
    page.show();
    println!("{} was shown {} times", page.show(), page.views.get());
}
```
```output
Home was shown 3 times
```

Showing a page does not change it in any way its users care about, so `show` takes `&self`. The view counter is a detail on the inside.

### `RefCell<T>`: the borrow checker at run time

A `RefCell` works for any type. You ask it for a borrow, and it checks the borrowing rules **while the program runs**:

- `.borrow()` gives a shared borrow. Any number of them may exist together.
- `.borrow_mut()` gives a mutable borrow. It must be the only borrow at that moment.

```rust run
use std::cell::RefCell;

fn main() {
    let log = RefCell::new(Vec::new());

    log.borrow_mut().push("started");
    log.borrow_mut().push("working");

    println!("{} entries, first: {}", log.borrow().len(), log.borrow()[0]);
}
```
```output
2 entries, first: started
```

`log` is not declared `mut`, and yet its content changes. If you break the rules, the compiler does not catch it. The program panics:

```rust panic
use std::cell::RefCell;

fn main() {
    let data = RefCell::new(vec![1, 2, 3]);

    let reader = data.borrow();
    let mut writer = data.borrow_mut();     // a writer while a reader exists
    writer.push(4);
    println!("{}", reader.len());
}
```
```output auto panic
```

:::warn A trade, not a free lunch
`RefCell` moves a compile-time guarantee to run time. You gain flexibility. You lose the certainty that the program cannot fail that way, and you pay a tiny cost for each check. Use it when you have a clear reason, keep each borrow short, and prefer ordinary `&mut` wherever it works. To test without a panic, use `try_borrow_mut()`, which returns a `Result`.
:::

### The combination: `Rc<RefCell<T>>`

`Rc` gives several owners, but read-only access. `RefCell` gives changes through a shared reference. Together they give **data with several owners that can be changed**:

```rust run
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
struct Account {
    balance: i64,
}

struct Person {
    name: String,
    account: Rc<RefCell<Account>>,
}

impl Person {
    fn pay(&self, amount: i64) {
        self.account.borrow_mut().balance -= amount;
        println!("{} paid {amount}", self.name);
    }
}

fn main() {
    let shared = Rc::new(RefCell::new(Account { balance: 1000 }));

    let sara = Person { name: String::from("Sara"), account: Rc::clone(&shared) };
    let tomas = Person { name: String::from("Tomas"), account: Rc::clone(&shared) };

    sara.pay(300);
    tomas.pay(150);

    println!("{:?}, {} owners", shared.borrow(), Rc::strong_count(&shared));
}
```
```output
Sara paid 300
Tomas paid 150
Account { balance: 550 }, 3 owners
```

Two people share one account, and both can change it. Read the type from the outside in: `Rc` (shared ownership) of a `RefCell` (changeable inside) of an `Account`. You will see this shape in graphical user interfaces, in games, and in graph-like data structures, where many parts refer to the same object.

## Cycles and `Weak<T>`

Reference counting has one weakness. If two values own each other through `Rc`, their counters can never reach zero, even when nothing else refers to them. The memory is never freed. This is a **reference cycle**, and it is a **memory leak**.

Think of a tree. A parent owns its children. A child should also be able to find its parent. If the child held an `Rc` to its parent, parent and child would own each other: a cycle.

The answer is a second kind of pointer, **`Weak<T>`**. A weak pointer refers to the value but does **not** own it, and does not keep it alive. Because the value may be gone, you must ask for access with `.upgrade()`, which returns an `Option<Rc<T>>`.

```rust run
use std::cell::RefCell;
use std::rc::{Rc, Weak};

struct Folder {
    name: String,
    parent: RefCell<Weak<Folder>>,          // does not own the parent
    children: RefCell<Vec<Rc<Folder>>>,     // owns the children
}

impl Folder {
    fn new(name: &str) -> Rc<Folder> {
        Rc::new(Folder {
            name: name.to_string(),
            parent: RefCell::new(Weak::new()),
            children: RefCell::new(Vec::new()),
        })
    }

    fn add_child(parent: &Rc<Folder>, child: Rc<Folder>) {
        *child.parent.borrow_mut() = Rc::downgrade(parent);
        parent.children.borrow_mut().push(child);
    }

    fn path(&self) -> String {
        match self.parent.borrow().upgrade() {
            Some(parent) => format!("{}/{}", parent.path(), self.name),
            None => self.name.clone(),
        }
    }
}

fn main() {
    let root = Folder::new("home");
    let docs = Folder::new("documents");
    let letter = Folder::new("letters");

    Folder::add_child(&root, Rc::clone(&docs));
    Folder::add_child(&docs, Rc::clone(&letter));

    println!("{}", letter.path());
    println!("root: {} strong, {} weak", Rc::strong_count(&root), Rc::weak_count(&root));
    println!("children of root: {}", root.children.borrow().len());
}
```
```output
home/documents/letters
root: 1 strong, 1 weak
children of root: 1
```

`Rc::downgrade(&parent)` creates a weak pointer. Ownership runs in one direction only, from parents down to children. The pointers upwards are weak. When `root` is dropped, the whole tree is freed.

:::key The rule for cycles
Decide which direction **owns**. Use `Rc` (or `Box`) in that direction, and `Weak` in the other. Parents own children. Children know their parents weakly.
:::

## `Cow`: copy only if you must

One more type from the standard library is worth knowing. `Cow<str>` ("clone on write") holds *either* a borrowed `&str` *or* an owned `String`. It lets a function return its input unchanged, without copying, in the common case, and a new `String` only when a change was needed:

```rust run
use std::borrow::Cow;

fn remove_spaces(text: &str) -> Cow<'_, str> {
    if text.contains(' ') {
        Cow::Owned(text.replace(' ', ""))     // a change is needed: make a new String
    } else {
        Cow::Borrowed(text)                   // nothing to do: hand back the input
    }
}

fn main() {
    for input in ["no_spaces", "some spaces here"] {
        let result = remove_spaces(input);
        let kind = match &result {
            Cow::Borrowed(_) => "borrowed",
            Cow::Owned(_) => "owned",
        };
        println!("{result} ({kind})");
    }
}
```
```output
no_spaces (borrowed)
somespaceshere (owned)
```

A `Cow<str>` can be used like a `&str` through `Deref`. The `'_` in the return type is the placeholder lifetime from [chapter 21](#lifetimes): it shows the reader that the result may borrow from the argument. `Cow` is a tool for making code faster, and you can ignore it until you need it.

## Choosing a pointer

| You need | Use |
|---|---|
| to look at a value for a while | `&T` |
| to change a value for a while | `&mut T` |
| one owner, on the heap (recursive type, trait object, big value) | `Box<T>` |
| several owners, read-only | `Rc<T>` |
| several owners that can change the value | `Rc<RefCell<T>>` |
| a pointer back to an owner, without owning | `Weak<T>` |
| to change a small `Copy` field through `&self` | `Cell<T>` |
| the same across threads | `Arc<T>`, `Arc<Mutex<T>>` ([chapter 31](#shared-state)) |

The order of this table is also the order of preference. Plain references and single ownership are the simplest and the fastest, and the compiler checks them completely. Reach for `Rc` and `RefCell` when the shape of your data truly demands shared ownership.

:::recap
- A smart pointer owns the data it points to and adds behaviour.
- `Box<T>` puts a value on the heap with one owner. It makes recursive types and trait objects possible.
- `Deref` lets a pointer be used like its content. `Drop` runs clean-up code when a value dies.
- `Rc<T>` counts its owners and frees the value when the last one goes. It is read-only and for one thread.
- `Cell<T>` and `RefCell<T>` allow changes through a shared reference. `RefCell` checks the borrowing rules at run time and panics if they are broken.
- `Rc<RefCell<T>>` is shared, changeable data.
- `Rc` cycles leak memory. `Weak<T>` points without owning and breaks the cycle.
:::

:::quiz Check your understanding
? Why does `enum List { Node(i32, List), End }` not compile, while `Node(i32, Box<List>)` does?
- Enums cannot contain themselves in any form
+ The compiler needs a known size. A type that directly contains itself would be infinitely large, and a `Box` is a pointer of fixed size
- `Box` makes the list faster
- The first version needs a lifetime
= A `Box<List>` has the size of one pointer, whatever it points to, so the size of `List` can be calculated.

? What does `Rc::clone(&a)` do?
- It copies the data that `a` points to
+ It creates another pointer to the same data and increases the owner count
- It moves the data to another thread
- It makes the data mutable
= Cloning an `Rc` is cheap. The data exists once, and is freed when the last `Rc` is dropped.

? What happens when `borrow_mut()` is called on a `RefCell` while a `borrow()` is still active?
- A compile error
- The call waits until the other borrow ends
+ The program panics
- The data is copied
= `RefCell` enforces the borrowing rules at run time. A violation is a panic, not a compile error.

? Two values hold an `Rc` to each other and nothing else refers to them. What happens?
- Rust detects it and frees them
- The program panics
+ Their counts never reach zero, so the memory is never freed: a memory leak
- The compiler refuses the program
= Reference counting cannot free cycles. Make one of the two directions a `Weak` pointer.

? In which order are the local variables of a function dropped?
- In the order they were created
+ In the reverse order of their creation
- In alphabetical order
- In no defined order
= The variable declared last is dropped first. Later variables may refer to earlier ones, so they must go first.
:::

:::exercise guided A tree of numbers
Define a binary tree: `enum Tree { Leaf, Node(Box<Tree>, i32, Box<Tree>) }`. Write the methods `sum(&self) -> i32` and `depth(&self) -> usize` (the number of levels, where a `Leaf` has depth 0). Build a small tree by hand and test both.
::hint
Both methods are a `match` with two arms. For a node, `sum` is `left.sum() + value + right.sum()`, and `depth` is `1 + left.depth().max(right.depth())`.
::solution
```rust run
enum Tree {
    Leaf,
    Node(Box<Tree>, i32, Box<Tree>),
}

impl Tree {
    fn node(left: Tree, value: i32, right: Tree) -> Tree {
        Tree::Node(Box::new(left), value, Box::new(right))
    }

    fn sum(&self) -> i32 {
        match self {
            Tree::Leaf => 0,
            Tree::Node(left, value, right) => left.sum() + value + right.sum(),
        }
    }

    fn depth(&self) -> usize {
        match self {
            Tree::Leaf => 0,
            Tree::Node(left, _, right) => 1 + left.depth().max(right.depth()),
        }
    }
}

fn main() {
    //        10
    //       /  \
    //      5    20
    //     /
    //    1
    let tree = Tree::node(
        Tree::node(Tree::node(Tree::Leaf, 1, Tree::Leaf), 5, Tree::Leaf),
        10,
        Tree::node(Tree::Leaf, 20, Tree::Leaf),
    );
    println!("sum {} depth {}", tree.sum(), tree.depth());
}
```
```output
sum 36 depth 3
```

A recursive data type is handled by recursive functions that have the same shape as the type: one `match` arm per variant. The helper `Tree::node` hides the `Box::new` calls and makes building a tree readable. Each node owns its two subtrees, so dropping the root frees the whole tree.
:::

:::exercise practice Count the clean-ups
Write a struct `Tracker` with a name and a shared counter of type `Rc<Cell<u32>>`. Implement `Drop` so that it adds one to the counter. In `main`, create three trackers in different scopes, and check after each step that the counter shows how many have been dropped so far.
::hint
All trackers share one `Rc<Cell<u32>>`, created first. Each tracker gets an `Rc::clone` of it. In `drop`, write `self.counter.set(self.counter.get() + 1);`.
::solution
```rust run
use std::cell::Cell;
use std::rc::Rc;

struct Tracker {
    name: &'static str,
    counter: Rc<Cell<u32>>,
}

impl Drop for Tracker {
    fn drop(&mut self) {
        self.counter.set(self.counter.get() + 1);
        println!("dropped {}", self.name);
    }
}

fn main() {
    let dropped = Rc::new(Cell::new(0));

    let _a = Tracker { name: "a", counter: Rc::clone(&dropped) };
    {
        let _b = Tracker { name: "b", counter: Rc::clone(&dropped) };
    }
    println!("after the block: {}", dropped.get());

    let c = Tracker { name: "c", counter: Rc::clone(&dropped) };
    drop(c);
    println!("after drop(c): {}", dropped.get());
}
```
```output
dropped b
after the block: 1
dropped c
after drop(c): 2
dropped a
```

The counter is owned jointly by `main` and by every tracker (`Rc`), and each tracker can change it through its shared pointer (`Cell`). `_b` is dropped at the end of its block, `c` by the explicit `drop`, and `_a` last, when `main` ends, after the final `println!`.

A variable name that starts with an underscore, like `_a`, tells the compiler "I know this is unused", but the value still lives to the end of its scope. A lone `_` is different: `let _ = Tracker { ... };` drops the value immediately.
:::

:::exercise challenge A shared shopping list
Two household members share one shopping list. Model it with `Rc<RefCell<Vec<String>>>`. Write a struct `Member { name: String, list: Rc<RefCell<Vec<String>>> }` with the methods `add(&self, item: &str)` and `buy(&self, item: &str) -> bool` (removes the item if it is on the list). Show that an item added by one member can be bought by the other.
::hint
`self.list.borrow_mut().push(item.to_string())` adds. For `buy`, get one mutable borrow into a variable, find the position with `list.iter().position(|i| i == item)`, and `remove` it. Do not call `borrow_mut()` twice in the same expression chain while the first borrow is still alive.
::solution
```rust run
use std::cell::RefCell;
use std::rc::Rc;

struct Member {
    name: String,
    list: Rc<RefCell<Vec<String>>>,
}

impl Member {
    fn add(&self, item: &str) {
        self.list.borrow_mut().push(item.to_string());
        println!("{} added {item}", self.name);
    }

    fn buy(&self, item: &str) -> bool {
        let mut list = self.list.borrow_mut();
        match list.iter().position(|i| i == item) {
            Some(index) => {
                list.remove(index);
                println!("{} bought {item}", self.name);
                true
            }
            None => false,
        }
    }
}

fn main() {
    let list = Rc::new(RefCell::new(Vec::new()));
    let sara = Member { name: String::from("Sara"), list: Rc::clone(&list) };
    let tomas = Member { name: String::from("Tomas"), list: Rc::clone(&list) };

    sara.add("milk");
    sara.add("bread");
    tomas.add("coffee");

    println!("{}", tomas.buy("milk"));
    println!("{}", sara.buy("tea"));
    println!("still needed: {:?}", list.borrow());
}
```
```output
Sara added milk
Sara added bread
Tomas added coffee
Tomas bought milk
true
false
still needed: ["bread", "coffee"]
```

Both members and `main` own the same list. In `buy`, the mutable borrow is taken once and stored in `list`. It ends when the method returns, so the next call can borrow again. Every borrow here is short and never overlaps with another, which is how `RefCell` should be used.

A different design avoids `Rc<RefCell<…>>` altogether: keep the list in one place, and pass `&mut Vec<String>` to functions that need it. That is often the better choice. Shared ownership is for cases where no single place can own the data.
:::

:::exercise challenge A stack made of boxes
Build a stack (the last value in is the first one out) as a linked list. Every node owns the next node:

```rust
struct Node<T> {
    value: T,
    next: Option<Box<Node<T>>>,
}
```

Write a type `Stack<T>` with `new`, `push`, `pop` (returns `Option<T>`), `peek` (returns `Option<&T>`), `len`, and `iter`, which gives references to the values from the top down. Then push a million numbers and let the stack go out of scope.
::hint
You cannot move a field out of `&mut self` and leave a hole. `self.top.take()` moves the value out of the `Option` and leaves `None` in its place. To look without taking, `as_ref()` turns `&Option<Box<Node<T>>>` into `Option<&Box<Node<T>>>`, and `as_deref()` goes one step further to `Option<&Node<T>>`. If the program ends with "has overflowed its stack", think about what dropping one node does to the next node.
::solution
```rust run
struct Node<T> {
    value: T,
    next: Option<Box<Node<T>>>,
}

pub struct Stack<T> {
    top: Option<Box<Node<T>>>,
    len: usize,
}

impl<T> Stack<T> {
    pub fn new() -> Self {
        Stack { top: None, len: 0 }
    }

    pub fn push(&mut self, value: T) {
        // `take` moves the old top out and leaves `None` in its place.
        let old_top = self.top.take();
        self.top = Some(Box::new(Node { value, next: old_top }));
        self.len += 1;
    }

    pub fn pop(&mut self) -> Option<T> {
        let node = self.top.take()?; // an empty stack returns `None` here
        self.top = node.next;
        self.len -= 1;
        Some(node.value)
    }

    pub fn peek(&self) -> Option<&T> {
        self.top.as_ref().map(|node| &node.value)
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn iter(&self) -> Iter<'_, T> {
        Iter { next: self.top.as_deref() }
    }
}

pub struct Iter<'a, T> {
    next: Option<&'a Node<T>>,
}

impl<'a, T> Iterator for Iter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<&'a T> {
        let node = self.next?;
        self.next = node.next.as_deref();
        Some(&node.value)
    }
}

impl<T> Drop for Stack<T> {
    fn drop(&mut self) {
        // Unlink the nodes one at a time, so that each node is dropped alone.
        let mut current = self.top.take();
        while let Some(mut node) = current {
            current = node.next.take();
        }
    }
}

fn main() {
    let mut stack = Stack::new();
    for word in ["plate", "bowl", "cup"] {
        stack.push(word.to_string());
    }
    println!("top: {:?}, {} items", stack.peek(), stack.len());
    println!("all: {:?}", stack.iter().collect::<Vec<_>>());
    println!("pop: {:?}", stack.pop());
    println!("pop: {:?}", stack.pop());
    println!("left: {:?}", stack.iter().collect::<Vec<_>>());

    let mut big = Stack::new();
    for n in 0..1_000_000 {
        big.push(n);
    }
    println!("a million items: {}", big.len());
}
```
```output
top: Some("cup"), 3 items
all: ["cup", "bowl", "plate"]
pop: Some("cup")
pop: Some("bowl")
left: ["plate"]
a million items: 1000000
```

Three things in this small program come up again and again in Rust:

1. **`take()` to move out from behind `&mut`.** `push` needs the old top as an owned value, to put it inside the new node. `take` hands it over and leaves `None`, so `self.top` is never without a value, not even for a moment. `pop` does the same, and the `?` after `take()` returns `None` at once when the stack is empty.
2. **`as_ref()` and `as_deref()` to look without taking.** `peek` and the iterator only borrow. The iterator holds `Option<&Node<T>>`: the node it will give out next.
3. **A drop that does not call itself.** Without the `impl Drop`, Rust would drop the first node, which drops the second node inside it, which drops the third, a million calls deep. Tried without it, this program stopped with `thread 'main' has overflowed its stack`. The loop unlinks each node before it is dropped, so every node is dropped alone.

For real work, use a `Vec`: `push` and `pop` do the same job, and the values sit side by side in memory, which is much faster to walk through ([chapter 51](#performance)). A linked list is worth writing once, because it trains exactly the moves that the borrow checker asks for.
:::
