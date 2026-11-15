@id structs
@part p3
@title Structs: building your own types
@short Structs and methods
@level beginner
@time 40
@learn Define a struct that groups related values under one name | Create, read and change struct values | Give a struct behaviour with methods and associated functions | Print structs for debugging and add common abilities with `derive` | Explain how structs differ from classes in other languages

A program often needs to keep related facts together: a user's name and email, or a rectangle's width and height. A **[[struct]]** is a type you define to group named fields into one value. This chapter builds structs, creates and updates their values, and gives them methods.

## The problem structs solve

Suppose a program handles users. Without structs, each user is several loose variables:

```rust
let name = String::from("Sara");
let email = String::from("sara@example.com");
let age = 29;
```

Nothing says these three belong together. Passing a user to a function means passing three arguments in the right order, and with ten users you would need thirty variables. A tuple `(String, String, u32)` keeps them together, but `user.0` and `user.1` do not tell you which one is the email.

:::analogy A form with labelled fields
A struct is like a printed form: "Name: ____, Email: ____, Age: ____". The form defines which fields exist and what kind of answer goes in each. Every filled-in copy of the form is one concrete user.
:::

## Defining and creating a struct

```rust run
struct User {
    name: String,
    email: String,
    age: u32,
    active: bool,
}

fn main() {
    let user = User {
        name: String::from("Sara"),
        email: String::from("sara@example.com"),
        age: 29,
        active: true,
    };

    println!("{} is {} years old.", user.name, user.age);
    println!("Email: {} (active: {})", user.email, user.active);
}
```
```output
Sara is 29 years old.
Email: sara@example.com (active: true)
```

- The `struct User { ... }` block **defines** a new type called `User`. Each line inside is a **[[field]]**: a name and a type. Type names are written in **CamelCase**: every word starts with a capital letter and there are no underscores.
- `User { name: ..., ... }` **creates** a value of that type. Such a value is called an **instance**. Every field must get a value. The order does not matter.
- You read a field with a dot: `user.name`.

A struct definition is written outside of functions, usually near the top of the file.

### Changing fields

To change a field, the whole instance must be `mut`. Rust does not let you mark single fields as mutable.

```rust run
# struct User { name: String, email: String, age: u32, active: bool }
fn main() {
    let mut user = User {
        name: String::from("Sara"),
        email: String::from("sara@example.com"),
        age: 29,
        active: true,
    };
    user.age += 1;
    user.email = String::from("sara@rust-lang.org");
    println!("{} {}", user.age, user.email);
#   let _ = (&user.name, user.active);
}
```
```output
30 sara@rust-lang.org
```

### Two shortcuts

```rust run
# #[derive(Debug)]
# struct User { name: String, email: String, age: u32, active: bool }
fn new_user(name: String, email: String) -> User {
    User {
        name,              // short for `name: name`
        email,             // short for `email: email`
        age: 18,
        active: true,
    }
}

fn main() {
    let first = new_user(String::from("Sara"), String::from("sara@example.com"));
    let second = User {
        name: String::from("Tomas"),
        ..first            // take all remaining fields from `first`
    };
    println!("{} {} {} {}", second.name, second.email, second.age, second.active);
}
```
```output
Tomas sara@example.com 18 true
```

- **Field init shorthand:** when a variable has the same name as the field, write the name once.
- **Struct update syntax:** `..first` fills every field you did not list with the value from `first`.

:::warn Struct update moves fields
`..first` moves or copies each remaining field, following the normal ownership rules. Here `email` is a `String`, so it is *moved* out of `first`. Afterwards `first.email` can no longer be used, but `first.age` and `first.active` can, because they are `Copy` types.
:::

## A struct owns its fields

The `User` struct holds `String` fields, not `&str`. That is a choice: each `User` **owns** its name and email. When the user is dropped, its strings are dropped with it. A user can be moved around or returned from a function freely, because it depends on nothing outside itself.

A struct can also hold references, but then the compiler must be sure that the borrowed data lives at least as long as the struct. That needs *lifetimes*, the subject of [chapter 26](#lifetimes). Until then, let your structs own their data.


### Fields are borrowed and moved one at a time

The compiler looks at every field separately. You can hold a mutable reference to one field and still read another:

```rust run
struct Player {
    name: String,
    score: u32,
}

fn main() {
    let mut player = Player { name: String::from("Sara"), score: 0 };

    let score = &mut player.score; // borrows only the field `score`
    let name = &player.name;       // a different field: no conflict
    *score += 10;

    println!("{name} has {} points.", player.score);
}
```
```output
Sara has 10 points.
```

The same holds for moves. Moving one field out of a struct is called a **partial move**. The fields that stayed can still be used, but the struct as a whole cannot:

```rust fail E0382
#[derive(Debug)]
struct Player {
    name: String,
    score: u32,
}

fn main() {
    let player = Player { name: String::from("Sara"), score: 12 };

    let name = player.name;                // the String moves out of the struct
    println!("{name}: {}", player.score);  // the other field is still there
    println!("{:?}", player);              // the whole struct is not
}
```
```error auto
```

If you need the struct afterwards, borrow the field (`&player.name`) or clone it. If you want to take the struct apart for good, say so with a pattern, `let Player { name, score } = player;`, which [chapter 19](#patterns) explains.

## Printing a struct

`println!("{}", user)` does not compile. Rust cannot know how you would like a `User` to look in a message for users. For debugging, ask the compiler to generate a debug representation by writing `#[derive(Debug)]` above the struct:

```rust run
# #![allow(dead_code)]
#[derive(Debug)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let p = Point { x: 3, y: -7 };
    println!("{:?}", p);
    println!("{:#?}", p);
    dbg!(&p);
}
```
```output
Point { x: 3, y: -7 }
Point {
    x: 3,
    y: -7,
}
```

- `{:?}` prints the struct on one line. `{:#?}` prints it "pretty", over several lines, which helps with big structs.
- **`dbg!`** is a macro made for quick debugging. It prints the file name, the line number, the expression and its value, to the error output of the terminal. That is why you do not see it in the output box above. In your terminal it shows `[src/main.rs:11:5] &p = Point { x: 3, y: -7, }` spread over a few lines.

:::note A warning you may see
When you run small examples like this one, the compiler may warn that the fields `x` and `y` are "never read". It is right: the program only prints the struct for debugging and never uses the fields one by one. In a small example you can ignore that warning.
:::

:::plain Attribute and derive
A line such as `#[derive(Debug)]` is an **attribute**: extra information for the compiler about the item that follows it. `derive` asks the compiler to write some standard code for your type automatically. `Debug` is the ability to be printed with `{:?}`. You will meet more of these abilities below. They are called *traits*, and [chapter 25](#traits) explains them.
:::

## Methods: giving a struct behaviour

A **method** is a function that belongs to a type. Methods are written in an `impl` block ("implementation") and are called with a dot.

```rust run
#[derive(Debug)]
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }

    fn is_square(&self) -> bool {
        self.width == self.height
    }

    fn can_hold(&self, other: &Rectangle) -> bool {
        self.width > other.width && self.height > other.height
    }
}

fn main() {
    let big = Rectangle { width: 30, height: 50 };
    let small = Rectangle { width: 10, height: 10 };

    println!("Area: {}", big.area());
    println!("Square? {} {}", big.is_square(), small.is_square());
    println!("Can big hold small? {}", big.can_hold(&small));
}
```
```output
Area: 1500
Square? false true
Can big hold small? true
```

The first parameter of a method is always some form of **`self`**: the instance the method is called on. In `big.area()`, `self` is `big`. The form of `self` tells you what the method does with the instance, with exactly the meanings you learned in the borrowing chapter:

| First parameter | The method … | Example |
|---|---|---|
| `&self` | only reads the instance | `area`, `is_square` |
| `&mut self` | changes the instance | a method that resizes the rectangle |
| `self` | takes ownership and uses the instance up | a method that turns it into something else |

When you call `big.area()`, Rust borrows `big` in the right way automatically. You do not write `(&big).area()`.

```rust run
#[derive(Debug)]
struct Counter {
    value: u32,
}

impl Counter {
    fn increment(&mut self) {
        self.value += 1;
    }

    fn into_message(self) -> String {
        format!("The final count is {}.", self.value)
    }
}

fn main() {
    let mut counter = Counter { value: 0 };
    counter.increment();
    counter.increment();
    println!("{:?}", counter);

    let message = counter.into_message(); // `counter` is moved into the method
    println!("{message}");
}
```
```output
Counter { value: 2 }
The final count is 2.
```


:::details What the dot does for you
A method is an ordinary function whose first parameter is called `self`. A call with a dot is a short way to write a call with the full name of that function:

```rust run
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }
}

fn main() {
    let big = Rectangle { width: 30, height: 50 };
    let reference = &big;
    let twice = &reference;

    println!("{}", Rectangle::area(&big)); // the call written out in full
    println!("{}", big.area());            // Rust adds the `&`
    println!("{}", reference.area());      // already a reference: nothing to add
    println!("{}", twice.area());          // Rust follows the references
}
```
```output
1500
1500
1500
1500
```

The compiler compares the type in front of the dot with what the method asks for, and adds `&`, `&mut` or `*` until the two fit. It does this only for the value in front of the dot, never for the other arguments. That is why you write `big.can_hold(&small)`: a `&` for `small`, and none for `big`.
:::

:::warn A method borrows the whole struct
Inside one function, the compiler can see that two fields are different. Across a method call it cannot:

```rust fail E0502
struct Player {
    name: String,
    score: u32,
}

impl Player {
    fn add_points(&mut self, points: u32) {
        self.score += points;
    }
}

fn main() {
    let mut player = Player { name: String::from("Sara"), score: 0 };

    let name = &player.name;
    player.add_points(10);
    println!("{name} has {} points.", player.score);
}
```
```error auto
```

The borrow checker reads only the signature of `add_points`, and `&mut self` means "I may change anything in this player". So no reference into the player may be in use during the call. The repair is usually to change the order: call `add_points` first, and borrow the name afterwards.
:::

### Associated functions: making new instances

A function inside an `impl` block that has **no `self`** parameter is called an **[[associated function]]**. It belongs to the type, not to one instance, and is called with `::`. You have used one many times: `String::from`. The most common use is a function that builds a new instance, by convention called `new`.

```rust run
# #![allow(dead_code)]
#[derive(Debug)]
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }

    fn square(size: u32) -> Self {
        Self { width: size, height: size }
    }
}

fn main() {
    let a = Rectangle::new(3, 4);
    let b = Rectangle::square(5);
    println!("{:?} {:?}", a, b);
}
```
```output
Rectangle { width: 3, height: 4 } Rectangle { width: 5, height: 5 }
```

Inside an `impl` block, **`Self`** (with a capital S) is another name for the type itself, here `Rectangle`.

:::compare Structs and classes
If you know Java, Python, C# or C++, a struct with an `impl` block looks like a *class*. There are important differences:

- **Data and behaviour are written separately**: fields in `struct`, methods in `impl`.
- **No inheritance.** A struct cannot extend another struct. Rust shares behaviour between types through *traits* ([chapter 25](#traits)) and builds bigger things by putting structs inside structs.
- **No special constructors.** `new` is an ordinary function with a conventional name. A struct can have several such functions with descriptive names.
- **No half-built objects and no `null`.** Every field must be given a value when the instance is created.
- **`self` is explicit**, and its form (`&self`, `&mut self`, `self`) tells you whether the method reads, changes or consumes the instance. In most languages you must read the method body to find that out.
:::

## Tuple structs and unit structs

A **[[tuple]] struct** has a name, but its fields do not. It is useful when names for the fields would add nothing:

```rust run
# #![allow(dead_code)]
struct Color(u8, u8, u8);
struct Meters(f64);
struct Seconds(f64);

fn main() {
    let orange = Color(255, 140, 0);
    let distance = Meters(100.0);
    let time = Seconds(9.58);

    println!("Red part: {}", orange.0);
    println!("Speed: {:.2} m/s", distance.0 / time.0);
}
```
```output
Red part: 255
Speed: 10.44 m/s
```

`Meters` and `Seconds` both wrap an `f64`, yet they are **different types**. A function that expects `Meters` will not accept `Seconds`. Wrapping a simple value in its own type so that it cannot be mixed up with other values is called the **[[newtype]] pattern**. It turns "I passed the arguments in the wrong order" from a hidden bug into a compile error.

:::details A famous bug that newtypes prevent
In 1999 NASA lost the Mars Climate Orbiter, a spacecraft worth hundreds of millions of dollars. One piece of software produced numbers in pound-force seconds and another expected newton seconds. Both were plain numbers, so nothing complained. With distinct types for the two units, the compiler would have refused to build the program.
:::

A struct with no fields at all is a **unit struct**: `struct Marker;`. It carries no data. It becomes useful together with traits, later in the guide.

## More abilities with `derive`

`Debug` is one of several abilities the compiler can write for you:

```rust run
#[derive(Debug, Clone, Copy, PartialEq, Default)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let a = Point { x: 1, y: 2 };
    let b = a;                      // Copy: `a` stays usable
    let origin = Point::default();  // Default: every field gets its default value

    println!("{:?} {:?} {:?}", a, b, origin);
    println!("{}", a == b);         // PartialEq: comparison with ==
    println!("{}", a == origin);
}
```
```output
Point { x: 1, y: 2 } Point { x: 1, y: 2 } Point { x: 0, y: 0 }
true
false
```

| Derive | What you get | Condition |
|---|---|---|
| `Debug` | printing with `{:?}` | all fields are `Debug` |
| `Clone` | an explicit copy with `.clone()` | all fields are `Clone` |
| `Copy` | automatic copying instead of moving | all fields are `Copy`. Needs `Clone` too |
| `PartialEq` | comparison with `==` and `!=` | all fields can be compared |
| `Default` | `Type::default()` with zero, `false`, empty text and so on | all fields have a default |

A struct with a `String` field cannot be `Copy`, because a `String` is not `Copy`. It can still be `Clone`.

## Structs in memory

A struct's fields are stored side by side as one block. A `Point` with two `i32` fields takes 8 bytes, and it lives wherever the variable lives, usually on the stack. Fields that are `String`s keep their small record inside the struct and their characters on the heap, as always. Making a struct costs nothing extra compared with using its fields as separate variables. Rust calls this kind of feature a **zero-cost abstraction**: it makes the code clearer and adds no cost when the program runs.

:::recap
- A struct groups named fields into a new type. An instance is one concrete value of it.
- Fields are read and changed with a dot. Changing needs a `mut` instance.
- A struct normally owns its fields.
- `#[derive(Debug)]` lets you print it with `{:?}` and `{:#?}`.
- Methods live in `impl` blocks. `&self` reads, `&mut self` changes, `self` consumes.
- Associated functions have no `self` and are called with `Type::name()`. `new` is the usual constructor.
- Tuple structs give a name to a group of unnamed fields. Wrapping one value in its own type is the newtype pattern.
:::

:::quiz Check your understanding
? What does `&self` in a method signature mean?
- The method creates a new instance
+ The method borrows the instance it is called on and can only read it
- The method takes ownership of the instance
- The method does not use the instance
= `&self` is a shared borrow of the instance. To change it, a method needs `&mut self`. To take ownership, it uses `self`.

? How do you call the associated function `new` of the struct `Rectangle`?
- `Rectangle.new(3, 4)`
- `new Rectangle(3, 4)`
+ `Rectangle::new(3, 4)`
- `rectangle.new(3, 4)`
= Associated functions are called on the type with `::`. Methods are called on an instance with a dot.

? Why does this not compile?
```rust
struct Song { title: String, seconds: u32 }
let song = Song { title: String::from("Blue") };
```
- A struct cannot contain a `String`
- `song` must be `mut`
+ The field `seconds` has no value. Every field must be set when a struct is created
- `Song` must derive `Debug`
= Rust has no half-initialised values. All fields need a value, either written out or taken from another instance with `..other`.

? What is the newtype pattern good for?
- It makes programs run faster
+ It gives a simple value its own type, so that the compiler stops you from mixing it up with other values of the same underlying type
- It allows a struct to inherit from another
- It lets you avoid `derive`
= `struct Meters(f64);` and `struct Seconds(f64);` are different types although both hold an `f64`, so they cannot be confused.
:::

:::exercise guided A Book type
Define a struct `Book` with the fields `title` (`String`), `pages` (`u32`) and `finished` (`bool`). Add:

- an associated function `new(title: &str, pages: u32)` that creates an unfinished book,
- a method `is_long` that returns `true` when the book has more than 300 pages,
- a method `finish` that marks the book as finished.

Derive `Debug`, and test all of it from `main`.
::hint
`new` takes a `&str` and must store a `String`: use `title.to_string()`. `is_long` only reads, so it takes `&self`. `finish` changes a field, so it takes `&mut self`, and the variable in `main` must be `mut`.
::solution
```rust run
# #![allow(dead_code)]
#[derive(Debug)]
struct Book {
    title: String,
    pages: u32,
    finished: bool,
}

impl Book {
    fn new(title: &str, pages: u32) -> Self {
        Self {
            title: title.to_string(),
            pages,
            finished: false,
        }
    }

    fn is_long(&self) -> bool {
        self.pages > 300
    }

    fn finish(&mut self) {
        self.finished = true;
    }
}

fn main() {
    let mut book = Book::new("The Rust Book", 560);
    println!("Long? {}", book.is_long());
    book.finish();
    println!("{:?}", book);
}
```
```output
Long? true
Book { title: "The Rust Book", pages: 560, finished: true }
```

`new` accepts a `&str` so that callers can pass a plain string literal, and converts it into an owned `String` for the struct. The two methods show the difference between `&self` (look) and `&mut self` (change).
:::

:::exercise practice Grow a rectangle
Add two methods to `Rectangle` (with `width` and `height` as `u32`):

- `scale(&mut self, factor: u32)` multiplies both sides by `factor`,
- `perimeter(&self) -> u32` returns the total length of all four sides.

A 3 × 4 rectangle scaled by 2 should have the perimeter 28.
::hint
The perimeter is `2 * (width + height)`. Inside `scale`, write `self.width *= factor;`.
::solution
```rust run
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn scale(&mut self, factor: u32) {
        self.width *= factor;
        self.height *= factor;
    }

    fn perimeter(&self) -> u32 {
        2 * (self.width + self.height)
    }
}

fn main() {
    let mut r = Rectangle { width: 3, height: 4 };
    r.scale(2);
    println!("{}", r.perimeter());
}
```
```output
28
```

`scale` needs `&mut self` because it changes the fields, so `r` must be declared with `let mut`. `perimeter` only reads, so `&self` is enough.
:::

:::exercise challenge A bank account
Write a struct `Account` with an `owner` (`String`) and a `balance` in cents (`u64`). Give it:

- `Account::new(owner: &str)` with a balance of 0,
- `deposit(&mut self, amount: u64)`,
- `withdraw(&mut self, amount: u64) -> bool`, which takes the money out and returns `true` only if the balance is large enough. Otherwise it changes nothing and returns `false`.

Test it: deposit 5000, withdraw 2000 (works), then withdraw 9999 (fails). The balance at the end is 3000.
::hint
In `withdraw`, check `amount > self.balance` first and return `false` early. Remember from [chapter 9](#types) that subtracting below zero would overflow a `u64`.
::solution
```rust run
struct Account {
    owner: String,
    balance: u64,
}

impl Account {
    fn new(owner: &str) -> Self {
        Self { owner: owner.to_string(), balance: 0 }
    }

    fn deposit(&mut self, amount: u64) {
        self.balance += amount;
    }

    fn withdraw(&mut self, amount: u64) -> bool {
        if amount > self.balance {
            return false;
        }
        self.balance -= amount;
        true
    }
}

fn main() {
    let mut account = Account::new("Sara");
    account.deposit(5000);
    println!("{}", account.withdraw(2000));
    println!("{}", account.withdraw(9999));
    println!("{} has {} cents.", account.owner, account.balance);
}
```
```output
true
false
Sara has 3000 cents.
```

The check before the subtraction keeps the account in a valid state: the balance can never go below zero. Because code outside the type must go through `withdraw`, the rule is enforced in one place. In [chapter 22](#modules) you will learn to make fields private, so that nothing can change `balance` directly. And in [chapter 23](#errors) you will replace the `bool` with a result that also says *why* a withdrawal failed.
:::
