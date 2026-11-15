@id types
@part p3
@title Basic data types: numbers, truth values, characters and groups
@short Basic data types
@level beginner
@time 35
@learn Choose the right number type and explain what the names like `i32` and `u8` mean | Calculate with whole numbers and decimals, and convert between them | Work with true/false values and single characters | Group several values in a tuple or an array | Explain what Rust does when a number gets too big or an index is out of range

A **[[type]]** tells Rust what a value represents and which operations make sense for it. For example, integer values can be added, while text is handled with text operations. A type also determines a value's representation and layout; some types, such as slices, need context to determine their size.

## Why types matter

:::plain Type, value, and width in one paragraph
A **type** is a promise about what a value is and what you may do with it: `i32` is a whole number stored in 32 bits, `f64` is a decimal, `bool` is `true` or `false`, `char` is one Unicode character. The **width** (the `32` in `i32`) sets both the range of values and the memory each one takes, which is why `u8` stops at 255 and `i32` does not. Rust fixes every value's type at compile time, so a mistake like adding text to a number is caught before the program runs, and a runtime overflow or bad index panics instead of quietly corrupting something.
:::

:::analogy Types are like containers
A kitchen has egg boxes, milk cartons and spice jars. Each is built for one kind of thing. Nobody pours milk into an egg box. A type is the same idea for data: it says what kind of thing is stored and how big the container is.
:::

Rust is **statically typed**: the compiler must know the type of every value *before the program runs*. That sounds like extra work, but you have already seen that the compiler usually works the type out by itself (type inference). The benefit is large: mistakes such as "add a number to a name" are found at compile time, not by your users.

:::compare Static and dynamic typing
Python and JavaScript are **dynamically typed**: a variable may hold a number now and text later, and type mistakes show up only when the faulty line actually runs, maybe months after you wrote it. Rust, like C, C++, Java and Go, checks all types during compilation. Rust's type inference gives you most of the comfort of a dynamic language with the safety of a static one.
:::

## Bits and bytes in one minute

A computer stores everything as **bits**. A bit is a tiny switch that is either off (0) or on (1). Eight bits make a **byte**. With 8 switches there are 256 possible on/off patterns, so one byte can stand for 256 different values, for example the numbers 0 to 255. More bits give more patterns: 16 bits give 65,536, and 32 bits give over 4 billion. That is all you need to know to understand Rust's number types.

## Whole numbers: integers

A whole number is called an **[[integer]]**. Rust has several integer types. The name tells you two things:

- **`i` or `u`:** `i` types are *signed*: they can be negative or positive. `u` types are *unsigned*: zero or positive only.
- **A number:** how many bits the value uses. More bits mean a larger range and more memory.

| Type | Smallest value | Largest value |
|---|---|---|
| `i8` | −128 | 127 |
| `u8` | 0 | 255 |
| `i16` | −32,768 | 32,767 |
| `u16` | 0 | 65,535 |
| `i32` | −2,147,483,648 | 2,147,483,647 |
| `u32` | 0 | 4,294,967,295 |
| `i64` | about −9.2 quintillion | about 9.2 quintillion |
| `u64` | 0 | about 18.4 quintillion |
| `i128`, `u128` | astronomically small | astronomically large |
| `isize`, `usize` | as big as your computer's "natural" size: 64 bits on most machines today | |

:::details Why −128 to 127, and not −127 to 127
A signed type has the same number of bits as an unsigned one, but one of those bits is used to mark the sign. Rust stores signed numbers in a scheme called **two's complement**: to get the negative of a number, flip every bit and add one. The price of marking the sign that way is that there are exactly one more negative values than positive ones, which is why an `i8` reaches down to −128 but only up to 127. That "extra" −128 is where the asymmetry in the table comes from, and it is the reason the most-negative number has no positive twin of the same size. You never have to do any of this by hand — it just explains where the range comes from.
:::

You do not have to remember the limits. The program can tell you:

```rust run
fn main() {
    println!("u8:  {} to {}", u8::MIN, u8::MAX);
    println!("i8:  {} to {}", i8::MIN, i8::MAX);
    println!("i32: {} to {}", i32::MIN, i32::MAX);
    println!("u64: {} to {}", u64::MIN, u64::MAX);
}
```
```output
u8:  0 to 255
i8:  -128 to 127
i32: -2147483648 to 2147483647
u64: 0 to 18446744073709551615
```

**Which one should you use?**

- If you are not sure, use **`i32`**. It is what Rust picks when you write `let x = 5;`.
- For counting things and for positions in a list, Rust uses **`usize`**.
- Use **`u8`** for raw bytes, and **`i64`** or **`u64`** when numbers can get very large.

### Ways to write a number

```rust run
fn main() {
    let population = 8_100_000_000_u64; // underscores make long numbers readable
    let colour = 0xFF;                  // hexadecimal (base 16): 255
    let switches = 0b1010;              // binary (base 2): 10
    let small = 7u8;                    // the type can be attached to the number
    println!("{population} {colour} {switches} {small}");
}
```
```output
8100000000 255 10 7
```

### Arithmetic

```rust run
fn main() {
    let apples = 17;
    let people = 5;
    println!("Each person gets {} apples.", apples / people);
    println!("{} apples are left over.", apples % people);
    println!("17 / 5 with decimals is {}.", 17.0 / 5.0);
}
```
```output
Each person gets 3 apples.
2 apples are left over.
17 / 5 with decimals is 3.4.
```

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` | add | `7 + 2` | `9` |
| `-` | subtract | `7 - 2` | `5` |
| `*` | multiply | `7 * 2` | `14` |
| `/` | divide | `7 / 2` | `3` |
| `%` | remainder after division | `7 % 2` | `1` |

:::warn Dividing integers throws away the decimals
`7 / 2` is `3`, not `3.5`. When both numbers are integers, the result is an integer, and anything after the decimal point is cut off. This is not rounding: `99 / 100` is `0`. The remainder operator `%` gives you the part that was left over. Together they are very useful, as you will see in the exercises.
:::

### Bitwise operators

Sometimes you need to work with the bits of a number directly — for example when you read a piece of hardware, or when you pack several small yes-or-no flags into one number. Rust has operators that combine the bits of two numbers, column by column.

| Operator | Name | What it does, for each pair of bits |
|---|---|---|
| `&` | **and** | 1 only if *both* bits are 1 |
| `\|` | **or** | 1 if *at least one* bit is 1 |
| `^` | **xor** (exclusive or) | 1 if the two bits are *different* |
| `!` | **not** | flips every bit of one number |
| `<< n` | **shift left** by n | moves every bit n places left (the same as multiplying by 2 to the power n) |
| `>> n` | **shift right** by n | moves every bit n places right (the same as dividing by 2 to the power n) |

```rust run
fn main() {
    let a = 12;   // 1100 in binary
    let b = 10;   // 1010 in binary
    println!("{} & {} = {}", a, b, a & b);
    println!("{} | {} = {}", a, b, a | b);
    println!("{} ^ {} = {}", a, b, a ^ b);
    println!("{} << 2 = {}", a, a << 2);
    println!("{} >> 2 = {}", b, b >> 2);
    println!("{:b}  {:b}", a, b);
}
```
```output
12 & 10 = 8
12 | 10 = 14
12 ^ 10 = 6
12 << 2 = 48
10 >> 2 = 2
1100  1010
```

You will not reach for these every day, but recognising them matters. A line of code full of `&`, `|` and `<<` is usually doing something with flags or with the raw bits of a number, and the table above lets you read what it means instead of guessing.

### When a number gets too big: overflow

A `u8` can hold at most 255. What is 255 + 1 in a `u8`? There is no room for 256. This situation is called **[[overflow]]**.

:::analogy A car's mileage counter
An old mileage counter with five digits shows 99999, and after one more kilometre it shows 00000. The number did not get smaller. The counter simply ran out of digits. Integer overflow is the same thing.
:::

Overflow is almost always a bug, so Rust takes it seriously. When the compiler can see the problem in advance, it refuses to compile:

```rust fail
fn main() {
    let level: u8 = 255;
    let next = level + 1;
    println!("{next}");
}
```
```error auto
```

When the numbers are only known while the program runs, Rust does this:

- In a **debug build** (the normal `cargo run`), the program stops at once with a clear error message. Rust calls such a controlled stop a **panic**.
- In a **release build**, the check is left out for speed, and the number wraps around like the mileage counter.

If overflow can really happen in your program, say what you want with one of these methods:

```rust run
fn main() {
    let level: u8 = 255;
    println!("wrapping:   {}", level.wrapping_add(1));
    println!("saturating: {}", level.saturating_add(1));
    println!("checked:    {:?}", level.checked_add(1));
    println!("checked:    {:?}", 200u8.checked_add(1));
}
```
```output
wrapping:   0
saturating: 255
checked:    None
checked:    Some(201)
```

`wrapping_add` wraps around on purpose. `saturating_add` stops at the largest value. `checked_add` gives `None` ("no valid answer") on overflow and `Some(result)` otherwise. You will learn about `Some` and `None` in [chapter 18](#enums). The `{:?}` placeholder is explained at the end of this chapter.

:::compare What other languages do
In C and C++, overflowing a signed integer is "undefined behaviour": the program may do anything, and compilers use that freedom in ways that have caused real security holes. Java silently wraps around. Python switches to bigger numbers automatically, which is safe but slow. Rust makes you notice the problem while you develop, and lets you choose the behaviour.
:::

## Numbers with decimals: floats

Numbers with a decimal point are called **[[floating|float]]-point numbers**, or **floats**. Rust has two: `f32` (32 bits) and `f64` (64 bits, more exact). Use `f64` unless you have a reason not to. It is the type Rust picks for `let x = 2.5;`.

```rust run
fn main() {
    let price = 2.5;
    let quantity = 3.0;
    let total = price * quantity;
    println!("Total: {total}");
    println!("Pi to two places: {:.2}", 3.14159);
    println!("Square root of 2: {}", 2.0_f64.sqrt());
    println!("0.1 + 0.2 = {}", 0.1 + 0.2);
}
```
```output
Total: 7.5
Pi to two places: 3.14
Square root of 2: 1.4142135623730951
0.1 + 0.2 = 0.30000000000000004
```

`{:.2}` prints a float rounded to two decimal places. (With a variable name it is written `{total:.2}`.)

:::warn Floats are approximate
Look at the last line: 0.1 + 0.2 is not exactly 0.3. A float stores a number in a fixed number of bits, and most decimal fractions cannot be stored exactly, just as 1/3 cannot be written exactly as a decimal. This is true in every programming language. Two rules follow:

- Never test floats for exact equality. Check that the difference is very small instead.
- Do not use floats for money. Store the amount in the smallest unit (cents) as an integer.
:::

:::details Where the extra digits come from
A `f64` keeps its number in three parts: a sign bit, a small set of bits that choose the *size* of the number (the exponent), and the remaining bits that store its *digits* (the fraction). There are not enough digit-bits to write most decimal fractions exactly, so the number is stored as the closest value that *can* be written. That stored value is a hair away from 0.1, and when you add a second value that is a hair away from 0.2, the result is a hair away from 0.3 — which is why the printed answer ends with all those digits. The scheme is called **IEEE-754**, and every mainstream language uses it, so this behaviour is not a Rust quirk and it will not go away.
:::

## Rust never converts numbers behind your back

```rust fail E0277
fn main() {
    let total = 5 + 2.5;
    println!("{total}");
}
```
```error auto lines=6
```

An integer and a float are different types, and Rust will not mix them silently. You must convert one of them yourself with the keyword **`as`**:

```rust run
fn main() {
    let whole = 7;
    let half = whole as f64 / 2.0;
    println!("{half}");

    let height = 3.99;
    let cut = height as i32;    // the decimals are cut off, not rounded
    println!("{cut}");

    let big = 300;
    let tiny = big as u8;       // 300 does not fit in a u8, so it wraps around
    println!("{tiny}");
}
```
```output
3.5
3
44
```

Converting to a *bigger* type is always safe. Converting to a *smaller* type with `as` can silently change the value, as the last lines show (300 − 256 = 44). Later you will meet safer conversions that report the problem instead ([chapter 34](#type-system)).

:::compare Why so strict?
C, Java and JavaScript convert between number types automatically in many places, and the rules are complicated enough to cause real bugs: a large number quietly squeezed into a small type, or decimals quietly dropped. In Rust every conversion is visible in the code. You type a little more, and you can always see what happens.
:::

## True or false: `bool`

A **[[Boolean]]** (`bool`) has only two possible values: `true` and `false`. Comparisons produce Booleans, and decisions in your program are based on them.

```rust run
fn main() {
    let age = 20;
    let has_ticket = true;
    let is_adult = age >= 18;
    println!("Adult: {is_adult}");
    println!("May enter: {}", is_adult && has_ticket);
    println!("Needs help: {}", !is_adult || !has_ticket);
    println!("5 == 5 is {}, 5 != 5 is {}", 5 == 5, 5 != 5);
}
```
```output
Adult: true
May enter: true
Needs help: false
5 == 5 is true, 5 != 5 is false
```

| Operator | Meaning | | Operator | Meaning |
|---|---|---|---|---|
| `==` | is equal to | | `&&` | **and**: true if both sides are true |
| `!=` | is not equal to | | `\|\|` | **or**: true if at least one side is true |
| `<`  `>` | less than, greater than | | `!` | **not**: turns true into false and back |
| `<=`  `>=` | less or equal, greater or equal | | | |

:::warn One equals sign or two
`=` stores a value: `age = 20`. `==` asks a question: `age == 20` ("is age equal to 20?") and gives `true` or `false`. Mixing them up is a classic beginner mistake. Rust's compiler catches it.
:::

## A single character: `char`

A `char` holds exactly one character, written in **single quotes**. Rust's `char` can hold any character from any writing system, including emoji, because it is based on the worldwide *Unicode* standard.

```rust run
fn main() {
    let letter = 'R';
    let amharic = 'ሀ';
    let emoji = '🦀';
    println!("{letter} {amharic} {emoji}");
    println!("{}", letter.is_alphabetic());
    println!("{}", '7'.is_numeric());
    println!("{}", letter.to_ascii_lowercase());
}
```
```output
R ሀ 🦀
true
true
r
```

Single quotes mean one character (`'a'`, a `char`). Double quotes mean text of any length (`"a"`, a *string*). They are different types. A `char` always takes four bytes, which is exactly enough for any single **Unicode scalar value**. There are a few things that a person sees as one character — some emoji, a letter with a separate accent mark — that are actually built from several of these units, and those do not fit in one `char`. You will meet that subtlety properly in [chapter 16](#slices-strings), because text is more complicated than it looks.

## Groups of values: tuples

A **tuple** groups a fixed number of values into one. The values may have different types.

```rust run
fn main() {
    let person = ("Sara", 29, true);
    println!("Name: {}", person.0);
    println!("Age: {}", person.1);

    let (name, age, is_member) = person;
    println!("{name} is {age}. Member: {is_member}");
    println!("{:?}", person);
}
```
```output
Name: Sara
Age: 29
Sara is 29. Member: true
("Sara", 29, true)
```

- You reach one part with a dot and its position: `person.0` is the first part. **Counting starts at 0.**
- `let (name, age, is_member) = person;` unpacks the tuple into three variables in one step. This is called **[[destructuring]]**.
- The type of this tuple is written `(&str, i32, bool)`.

Tuples are good for small groups, such as a pair of coordinates `(x, y)`. For anything bigger you will use a *struct*, which gives each part a name ([chapter 17](#structs)).

The empty tuple `()` is called the **[[unit]]** type. It means "nothing useful here", and you will meet it in the next chapter.

## Lists of the same type: arrays

An **[[array]]** is a row of values that all have the same type. Its length is fixed when you write the program.

```rust run
fn main() {
    let days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    println!("First day: {}", days[0]);
    println!("Last day: {}", days[4]);
    println!("Number of days: {}", days.len());

    let mut scores = [0; 3];      // three zeros: [0, 0, 0]
    scores[1] = 50;
    println!("{:?}", scores);
}
```
```output
First day: Mon
Last day: Fri
Number of days: 5
[0, 50, 0]
```

- The position of an element is called its **index**. The first element has index 0, so an array of 5 elements has indexes 0 to 4.
- `[0; 3]` is short for "the value 0, three times".
- The type of `scores` is `[i32; 3]`: three `i32` values. The length is part of the type.
- To change an element, the array must be `mut`.

:::analogy Why counting starts at zero
Think of the index as "how many steps from the start". The first element is zero steps away. Floors in many countries are numbered the same way: ground floor, then first floor.
:::

### Reaching past the end

What if you ask for an element that does not exist?

```rust panic
fn main() {
    let days = ["Mon", "Tue", "Wed"];
    let position: usize = "7".parse().unwrap(); // turns the text "7" into the number 7
    println!("{}", days[position]);
}
```
```output auto panic
```

The program **panics**: it stops immediately and says exactly what went wrong and where. (The number is produced from text here so that the compiler cannot know it in advance. If you write `days[7]` directly, the compiler already refuses to build the program.)

:::note A small difference you may notice
On your computer the first line has a number in parentheses after the name, for example `thread 'main' (48213) panicked at …`. It identifies the running thread and changes from run to run, so this guide leaves it out of the printed outputs.
:::

:::compare A crash that protects you
In C, reading `days[7]` would not stop the program. It would read whatever lies in memory after the array and carry on with garbage, or leak secret data. Many famous security holes are exactly this mistake. Rust checks every index while the program runs. A clean stop with a clear message is far better than a program that silently works with wrong data.
:::

An array cannot grow or shrink. For a list that can, Rust has the *vector* (`Vec`), which you will use all the time from [chapter 20](#collections) on.

## Printing for programmers: `{:?}`

`{}` prints a value in a form meant for the users of your program. Some types, such as tuples and arrays, have no single obvious way to be shown to users, so `{}` does not work for them. `{:?}` prints a value in a form meant for programmers, called the **debug** form. It works for almost everything and is perfect for looking inside your data while you develop.

```rust run
fn main() {
    let point = (3, -7);
    let primes = [2, 3, 5, 7];
    println!("{:?} {:?}", point, primes);
    println!("{point:?}");
}
```
```output
(3, -7) [2, 3, 5, 7]
(3, -7)
```

## The basic types at a glance

| Type | Holds | Example |
|---|---|---|
| `i32`, `u8`, `usize` … | whole numbers | `42`, `-7`, `1_000` |
| `f64`, `f32` | numbers with decimals | `3.14`, `-0.5` |
| `bool` | true or false | `true` |
| `char` | one character | `'a'`, `'🦀'` |
| `(i32, bool)` | tuple: a fixed group of mixed types | `(5, true)` |
| `[i32; 3]` | array: a fixed row of one type | `[1, 2, 3]` |
| `&str` | text | `"hello"` |

:::recap
- Every value has a type, and the compiler knows it before the program runs.
- Integers: `i` types can be negative, `u` types cannot, and the number is the size in bits. Use `i32` by default.
- Integer division cuts off the decimals. `%` gives the remainder.
- Overflow is treated as a bug: a compile error when it can be seen in advance, a panic in debug builds.
- Floats (`f64`) hold decimals but are approximate. Do not use them for money.
- Rust never mixes number types silently. Convert with `as`.
- `bool` is `true` or `false`. `char` is one character in single quotes.
- Tuples group mixed types, arrays hold one type. Both have a fixed size, and indexes start at 0.
- An index that is out of range causes a panic, not a silent error.
:::

:::quiz Check your understanding
? Which of these values fits in a `u8`?
- `-5`
+ `200`
- `256`
- `3.5`
= A `u8` holds whole numbers from 0 to 255. It cannot be negative (the `u` means unsigned), 256 is one too big, and 3.5 is not a whole number.

? What does `println!("{}", 9 / 2);` print?
- `4.5`
- `5`
+ `4`
- It does not compile
= Both numbers are integers, so the result is an integer and the decimals are cut off. For 4.5 you would write `9.0 / 2.0`.

? Which line compiles?
- `let x = 5 + 2.0;`
- `let x: i32 = 2.5;`
+ `let x = 5 as f64 + 2.0;`
- `let x: u8 = -1;`
= Rust never mixes integers and floats silently. `5 as f64` converts the integer first. The other lines try to mix types or put a value into a type that cannot hold it.

? An array has 4 elements. What is the index of the last one?
- 4
+ 3
- 5
- 0
= Indexes start at 0, so four elements have the indexes 0, 1, 2 and 3. The last index is always the length minus one.

? What is the difference between `'x'` and `"x"`?
- There is none
- `'x'` is text and `"x"` is a number
+ `'x'` is a single character (`char`) and `"x"` is a string
- `"x"` can only hold letters
= Single quotes make a `char`, which is always exactly one character. Double quotes make a string, which can hold any number of characters.
:::

:::exercise guided Seconds to hours, minutes and seconds
A video is 7384 seconds long. Write a program that prints its length as hours, minutes and seconds:

```text
7384 seconds = 2 h 3 min 4 s
```

Work it out in steps. How many whole hours fit into the total? How many seconds remain after that? How many whole minutes fit into the rest?
::hint
An hour has 3600 seconds. `total / 3600` gives the whole hours and `total % 3600` gives the seconds that remain. Do the same again with 60.
::solution
```rust run
fn main() {
    let total = 7384;
    let hours = total / 3600;
    let rest = total % 3600;
    let minutes = rest / 60;
    let seconds = rest % 60;
    println!("{total} seconds = {hours} h {minutes} min {seconds} s");
}
```
```output
7384 seconds = 2 h 3 min 4 s
```

Integer division and remainder work as a pair: `/` tells you how many whole units fit, and `%` tells you what is left. The same pattern converts cents to dollars and cents, days to weeks and days, and many other things.
:::

:::exercise practice An average with decimals
Three test scores are 71, 86 and 90. Store them in three integer variables. Print their sum, and their average with two decimal places:

```text
Sum: 247
Average: 82.33
```
::hint
`sum / 3` gives 82, because both are integers. Convert the sum to a float first: `sum as f64 / 3.0`. Print with `{:.2}`.
::solution
```rust run
fn main() {
    let a = 71;
    let b = 86;
    let c = 90;
    let sum = a + b + c;
    let average = sum as f64 / 3.0;
    println!("Sum: {sum}");
    println!("Average: {average:.2}");
}
```
```output
Sum: 247
Average: 82.33
```

The conversion must happen *before* the division. `(sum / 3) as f64` would divide the integers first, giving 82, and only then convert, giving 82.0. The lost decimals do not come back.
:::

:::exercise practice Split the bill
A restaurant bill of 100.00 is shared by 3 friends. Following the advice in this chapter, store the bill in cents as an integer (`10000`). Calculate what each person pays and how many cents are left over, and print:

```text
Each person pays 33.33
Left over: 1 cent(s)
```
::hint
`each / 100` gives the whole part of the amount and `each % 100` the cents. The placeholder `{:02}` prints a number with at least two digits, adding a zero in front if needed (so 5 becomes `05`).
::solution
```rust run
fn main() {
    let bill_cents = 10000;
    let people = 3;
    let each = bill_cents / people;
    let left_over = bill_cents % people;
    println!("Each person pays {}.{:02}", each / 100, each % 100);
    println!("Left over: {left_over} cent(s)");
}
```
```output
Each person pays 33.33
Left over: 1 cent(s)
```

With integers, no cent can appear or vanish through rounding: 3 × 3333 + 1 = 10000 exactly. With floats, 100.0 / 3.0 is 33.333333…, and you would have to decide how to round and who pays the missing cent. Real banking software works in whole units for this reason.
:::

:::exercise challenge Type detective
For each expression, write down the value you expect *before* running anything. Then run the program and compare.

```rust
7 / 2
7.0 / 2.0
7 % 2
(7 / 2) as f64
2.9 as i32
-2.9 as i32
'A' as u8
97u8 as char
true as i32
```
::hint
Integer division cuts off decimals. `as i32` on a float also cuts off decimals (it moves towards zero). Characters are stored as numbers inside the computer.
::solution
```rust run
fn main() {
    println!("{}", 7 / 2);
    println!("{}", 7.0 / 2.0);
    println!("{}", 7 % 2);
    println!("{}", (7 / 2) as f64);
    println!("{}", 2.9 as i32);
    println!("{}", -2.9 as i32);
    println!("{}", 'A' as u8);
    println!("{}", 97u8 as char);
    println!("{}", true as i32);
}
```
```output
3
3.5
1
3
2
-2
65
a
1
```

- `(7 / 2) as f64` is 3: the integer division already happened inside the brackets. (A float with no decimal part is printed without `.0`.)
- `2.9 as i32` is 2 and `-2.9 as i32` is −2: the decimals are cut off, never rounded.
- `'A' as u8` is 65: every character has a number in the Unicode standard, and `A` is number 65. Going the other way, 97 is `a`.
- `true as i32` is 1, and `false` would be 0.
:::
