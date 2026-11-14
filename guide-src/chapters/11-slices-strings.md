@id slices-strings
@part p2
@title Strings and slices
@short Strings and slices
@level beginner
@time 45
@learn Explain the difference between `String` and `&str` and choose the right one | Build, grow and combine text | Borrow a part of a text or a list with a slice | Work correctly with text in any language of the world | Use the most common text methods

Text is everywhere in programs: names, messages, file contents. It looks simple, and it is one of the trickiest kinds of data. Rust has two main text types, and beginners often ask why. The answer comes straight from ownership: one type **owns** its text, the other **borrows** it.

## Two kinds of text

| | `String` | `&str` (say "string slice") |
|---|---|---|
| Relationship to the text | Owns it | Borrows it: a view of text that lives somewhere else |
| Can it grow or change? | Yes, if `mut` | No |
| Where the characters are | On the heap | Wherever the owner put them |
| What it is made of | Pointer, length, capacity | Pointer, length |
| Typical use | Text you build, keep or return | Text you only read, and function parameters |

:::analogy A notebook and a highlighted passage
A `String` is your own notebook. You can add pages, cross things out, or throw it away. A `&str` is a passage you marked with a highlighter in someone else's book: you can read exactly that passage, but the book is not yours, and the passage is only there as long as the book is.
:::

Text written in double quotes in your code, such as `"hello"`, is called a **string literal**. Its type is `&str`. The characters are stored inside the program file itself, so they are available for as long as the program runs.

```rust run
fn main() {
    let borrowed: &str = "hello";                 // a string literal
    let owned: String = String::from("hello");    // an owned copy on the heap
    let also_owned = "hello".to_string();         // another way to write the same
    println!("{borrowed} {owned} {also_owned}");
}
```
```output
hello hello hello
```

## Building and growing a `String`

```rust run
fn main() {
    let mut text = String::new();        // an empty String
    text.push_str("Rust");               // add text at the end
    text.push('!');                      // add a single char
    println!("{text}");

    let name = "Ferris";
    let age = 9;
    let line = format!("{name} is {age} years old.");
    println!("{line}");

    let first = String::from("tic");
    let second = String::from("tac");
    let joined = first + "-" + &second;  // `first` is moved into the result
    println!("{joined}");
}
```
```output
Rust!
Ferris is 9 years old.
tic-tac
```

- **`push_str`** adds a `&str`, and **`push`** adds one `char`.
- **`format!`** works like `println!` but returns the result as a new `String`. It is the most readable way to combine values into text, and it does not move any of them.
- **`+`** glues text onto a `String`. The left side must be a `String` and is *moved* into the result. Everything added must be a `&str`, so a `String` on the right needs a `&`. After this line `first` cannot be used any more, but `second` can. When this feels confusing, use `format!`.

## Slices: borrowing a part

A **slice** is a reference to a connected part of a sequence. For text you write the range of bytes you want inside square brackets:

:::stepper A string slice in memory
```rust
fn main() {
    let text = String::from("hello world");
    let first = &text[0..5];
    let second = &text[6..];
    println!("{first} / {second}");
}
```
2 | [main] text = ->#1 length 11 !new | #1 = "hello world" !new | `text` owns eleven characters on the heap.
3 | [main] text = ->#1 length 11; first = ->#1 bytes 0 to 5 !ref | #1 = "hello world" | A slice is a reference to a part of the text. It stores where the part starts and how long it is. No characters are copied.
4 | [main] text = ->#1 length 11; first = ->#1 bytes 0 to 5 !ref; second = ->#1 bytes 6 to 11 !ref | #1 = "hello world" | `6..` means "from byte 6 to the end". Both slices look into the same heap data.
5 | [main] text = ->#1 length 11; first = ->#1 bytes 0 to 5 !ref; second = ->#1 bytes 6 to 11 !ref | #1 = "hello world" | The program prints `hello / world`.
6 | - | #1 = "hello world" !freed | At the end `text`, the owner, frees the characters. The slices owned nothing.
:::

| Slice | Means |
|---|---|
| `&text[0..5]` | bytes 0, 1, 2, 3, 4 (the end is not included, as with ranges in loops) |
| `&text[..5]` | the same: a missing start means "from the beginning" |
| `&text[6..]` | from byte 6 to the end |
| `&text[..]` | the whole text |

A slice is a normal shared borrow, so the borrowing rules protect it. This function returns the first word of a text as a slice:

```rust run
fn first_word(text: &str) -> &str {
    for (i, c) in text.char_indices() {
        if c == ' ' {
            return &text[..i];
        }
    }
    text
}

fn main() {
    let sentence = String::from("hello world");
    let word = first_word(&sentence);
    println!("{word}");
}
```
```output
hello
```

`char_indices` gives each character together with the position where it starts. At the first space, the function returns the part before it. If there is no space, the whole text is one word.

Now try to empty the sentence while the slice is still in use:

```rust fail E0502
fn first_word(text: &str) -> &str {
    for (i, c) in text.char_indices() {
        if c == ' ' {
            return &text[..i];
        }
    }
    text
}

fn main() {
    let mut sentence = String::from("hello world");
    let word = first_word(&sentence);
    sentence.clear();
    println!("{word}");
}
```
```error auto
```

`word` is a view into `sentence`. If `clear` were allowed, `word` would point at text that no longer exists. The compiler knows that the returned slice borrows from the argument, and rejects the program. In many languages this would be a bug that shows up later, somewhere else.

## Prefer `&str` for parameters

A function that takes `&str` can be called with a string literal, with a slice, and with a reference to a `String`. Rust turns `&String` into `&str` automatically.

```rust run
fn shout(text: &str) -> String {
    format!("{}!", text.to_uppercase())
}

fn main() {
    let owned = String::from("hello");
    println!("{}", shout("hi"));          // a literal
    println!("{}", shout(&owned));        // a reference to a String
    println!("{}", shout(&owned[1..3]));  // a part of a String
}
```
```output
HI!
HELLO!
EL!
```

:::key Which text type where?
- **Function parameter that only reads text:** `&str`.
- **Text that a struct or a variable should own, or that you build yourself:** `String`.
- **Function that creates new text:** return `String`.
- From `&str` to `String`: `.to_string()` or `String::from(...)`. From `String` to `&str`: put `&` in front.
:::

## Text is more than English letters

Computers store text as numbers. The worldwide standard **Unicode** gives every character of every writing system a number, and **UTF-8** is the usual way to store those numbers as bytes. In UTF-8, characters take a different number of bytes:

| Character | Bytes in UTF-8 |
|---|---|
| `a`, `Z`, `7`, `?` (English letters, digits, basic signs) | 1 |
| `é`, `ñ`, `ж` (most European and Middle Eastern letters) | 2 |
| `ሰ`, `中`, `あ` (Ethiopic, Chinese, Japanese and many others) | 3 |
| `🦀`, `😀` (emoji and rare signs) | 4 |

A Rust `String` is always valid UTF-8. This has consequences that surprise people:

```rust run
fn main() {
    let english = "hello";
    let amharic = "ሰላም";
    let crab = "🦀";

    println!("{} bytes, {} characters", english.len(), english.chars().count());
    println!("{} bytes, {} characters", amharic.len(), amharic.chars().count());
    println!("{} bytes, {} characters", crab.len(), crab.chars().count());
}
```
```output
5 bytes, 5 characters
9 bytes, 3 characters
4 bytes, 1 characters
```

**`.len()` counts bytes, not characters.** To count characters, use `.chars().count()`.

For the same reason, Rust does not let you pick a character by number:

```rust fail E0277
fn main() {
    let word = "ሰላም";
    let first = word[0];
}
```
```error auto lines=9
```

What should `word[0]` be? The first byte is only a third of the first letter. Finding the first *character* means reading the text from the start, which gets slower the longer the text is. Rust refuses to hide that. You say what you mean instead:

```rust run
fn main() {
    let word = "ሰላም";

    for c in word.chars() {
        print!("{c} ");
    }
    println!();

    println!("{:?}", word.chars().nth(1));      // the character at position 1, if there is one
    println!("{:?}", word.chars().next());      // the first character, if there is one
    println!("{:?}", word.bytes().next());      // the first byte

    let reversed: String = word.chars().rev().collect();
    println!("{reversed}");
}
```
```output
ሰ ላ ም
Some('ላ')
Some('ሰ')
Some(225)
ምላሰ
```

`.chars()` walks through the text character by character, and `.bytes()` byte by byte. `nth(1)` answers `Some('ላ')` because a text might be too short to have a character there, in which case the answer would be `None`. `.collect()` gathers the characters into a new `String`. Both ideas return in later chapters.

Slices of text use byte positions, and a slice must not cut a character in half. If it does, the program panics:

```rust panic
fn main() {
    let word = "ሰላም";
    let part = &word[0..1];
    println!("{part}");
}
```
```output auto panic
```

:::warn Be careful with byte ranges
Slicing with fixed numbers such as `&text[0..3]` is only safe when you know what the text contains. In real programs, get positions from methods such as `find` or `char_indices`, which always return valid positions, or use methods that work with whole characters, such as `chars`, `split` and `trim`.
:::

:::compare Text in other languages
- **C:** a string is a row of bytes that ends with a zero byte. It does not know its own length. Forgetting the final zero, or writing past the end, causes the buffer overflows described in [chapter 8](#memory).
- **Java and JavaScript:** strings are stored as 16-bit units. `"🦀".length` is 2 in JavaScript, although it is one character, and taking "the first character" can give half an emoji.
- **Python 3:** indexing by character works, at the price of a storage format that can use up to 4 bytes for every character.
- **Go:** strings are byte sequences like in Rust, and indexing gives a byte without warning.
- **Rust:** the text is compact UTF-8, always valid, and you must say whether you mean bytes or characters.
:::

:::details What looks like one character may be several
Some things that look like one character on screen are built from several `char`s. The letter `é` can be stored as one `char`, or as `e` followed by a separate accent mark. A flag emoji is two `char`s. A "character as a human sees it" is called a *grapheme cluster*. The standard library does not split text into those. When you need it, for example to cut a text for display, use the crate `unicode-segmentation`.
:::

## A toolbox of text methods

```rust run
fn main() {
    let text = "  Rust is fast, and Rust is safe.  ";
    let clean = text.trim();

    println!("{}", clean.len());
    println!("{}", clean.to_uppercase());
    println!("{}", clean.contains("fast"));
    println!("{}", clean.starts_with("Rust"));
    println!("{:?}", clean.find("is"));
    println!("{}", clean.replace("Rust", "Ferris"));

    for word in clean.split_whitespace() {
        print!("[{word}] ");
    }
    println!();

    for part in "red,green,blue".split(',') {
        print!("{part} ");
    }
    println!();

    println!("{}", "ab".repeat(3));
    println!("{}", "apple" < "banana");
    println!("{}", "Rust" == "rust");
}
```
```output auto
```

| Method | What it gives you |
|---|---|
| `.len()` / `.is_empty()` | length in bytes / whether the text is empty |
| `.trim()`, `.trim_start()`, `.trim_end()` | the text without spaces and line ends around it |
| `.to_uppercase()`, `.to_lowercase()` | a new `String` in upper or lower case |
| `.contains(x)`, `.starts_with(x)`, `.ends_with(x)` | `true` or `false` |
| `.find(x)` | the byte position of the first match, as `Some(position)`, or `None` |
| `.replace(a, b)` | a new `String` with every `a` replaced by `b` |
| `.split(x)`, `.split_whitespace()`, `.lines()` | the parts of the text, one after another |
| `.chars()`, `.bytes()`, `.char_indices()` | the characters, the bytes, or characters with their positions |
| `.parse::<Type>()` | the text converted to a number or another type, as `Ok` or `Err` |
| `.repeat(n)` | the text `n` times in a row |
| `==`, `<`, `>` | comparison, letter by letter (upper and lower case are different) |

Most of these work on `&str`, and because a `&String` turns into a `&str` automatically, they work on `String` too. Methods that produce changed text, such as `to_uppercase` and `replace`, return a new `String` and leave the original untouched.

## Slices of arrays and lists

Slices are not only for text. A slice of an array or a `Vec` has the type `&[T]`, where `T` is the type of the elements: `&[i32]` is "a borrowed row of `i32` values".

```rust run
fn sum(values: &[i32]) -> i32 {
    let mut total = 0;
    for v in values {
        total += v;
    }
    total
}

fn main() {
    let array = [10, 20, 30, 40, 50];
    let list = vec![1, 2, 3];

    println!("{}", sum(&array));         // the whole array
    println!("{}", sum(&array[1..4]));   // only 20, 30, 40
    println!("{}", sum(&list));          // a Vec works too

    let middle = &array[1..4];
    println!("{:?} has {} elements, the first is {:?}", middle, middle.len(), middle.first());
}
```
```output
150
90
6
[20, 30, 40] has 3 elements, the first is Some(20)
```

A function that takes `&[i32]` works with arrays of any length, with vectors, and with parts of both. It is to lists what `&str` is to text. A **mutable slice**, `&mut [T]`, lets a function change the elements in place:

```rust run
fn main() {
    let mut scores = [70, 95, 82, 61];
    let first_three = &mut scores[..3];
    first_three[0] = 100;
    first_three.sort();
    println!("{:?}", scores);
}
```
```output
[82, 95, 100, 61]
```

## Formatting text precisely

`println!` and `format!` can control how a value is shown. The instructions go after a colon inside the brackets.

```rust run
fn main() {
    let name = "Ada";
    let price = 3.14159;
    let n = 42;

    println!("[{name:>8}]");      // right-aligned in 8 columns
    println!("[{name:<8}]");      // left-aligned
    println!("[{name:^8}]");      // centred
    println!("[{name:*^8}]");     // centred, filled with *
    println!("[{price:.2}]");     // two decimal places
    println!("[{price:8.2}]");    // 8 columns wide, two decimals
    println!("[{n:05}]");         // at least 5 digits, filled with zeros
    println!("[{n:+}]");          // always show the sign
    println!("[{n:b}] [{n:x}]");  // binary and hexadecimal
    println!("{0} and {0} and {1}", "this", "that");  // by position
}
```
```output
[     Ada]
[Ada     ]
[  Ada   ]
[**Ada***]
[3.14]
[    3.14]
[00042]
[+42]
[101010] [2a]
this and this and that
```

The full list is in the [reference appendix](#reference).

:::recap
- `String` owns text on the heap and can grow. `&str` is a borrowed view of text.
- String literals are `&str`. `.to_string()` makes an owned `String`, and `&` turns a `String` into a `&str`.
- Use `&str` for parameters and `String` for text you own or return.
- A slice (`&text[a..b]`, `&array[a..b]`) borrows a part without copying. The borrow checker keeps it valid.
- Text is UTF-8: `.len()` counts bytes, characters can take 1 to 4 bytes, and you cannot index by number. Use `.chars()`.
- `format!` builds a `String` the way `println!` prints one.
:::

:::quiz Check your understanding
? What is the type of `"hello"` written directly in the code?
- `String`
+ `&str`
- `char`
- `[char; 5]`
= A string literal is a string slice, `&str`. Its characters are stored in the program itself. To get an owned `String`, call `.to_string()` or `String::from`.

? What does `"ሰላም".len()` return, and why?
- 3, because there are three characters
+ 9, because `len` counts bytes and each of these characters takes 3 bytes in UTF-8
- 6, because each character takes 2 bytes
- It does not compile
= `.len()` is the number of bytes. For the number of characters, use `.chars().count()`.

? Which signature is the most flexible for a function that only reads a text?
- `fn show(text: String)`
- `fn show(text: &String)`
+ `fn show(text: &str)`
- `fn show(text: &mut String)`
= `&str` accepts string literals, slices, and references to `String` values. `&String` works only with a `String`, and `String` would take ownership.

? Why does Rust not allow `text[0]` on a string?
- Strings are stored on the heap
- Strings are immutable
+ Characters have different sizes in UTF-8, so byte 0 may be only a part of a character, and Rust will not guess what you mean
- It is allowed, but only for `String`
= Indexing would have to return either a byte, which is often not a character, or do a slow search for the right character. Rust makes you choose with `.bytes()` or `.chars()`.

? After `let c = a + &b;` where `a` and `b` are `String`s, which variables can still be used?
- `a`, `b` and `c`
- Only `c`
+ `b` and `c`
- `a` and `c`
= `+` moves the left operand `a` into the result and only borrows `b`. To keep everything, write `format!("{a}{b}")`.
:::

:::exercise guided Count the vowels
Write a function `count_vowels(text: &str) -> usize` that counts the letters a, e, i, o and u in a text, in upper or lower case. For `"Rust is Awesome"` the answer is 6.
::hint
Loop over `text.to_lowercase().chars()`. A `match` with the pattern `'a' | 'e' | 'i' | 'o' | 'u'` recognises a vowel.
::solution
```rust run
fn count_vowels(text: &str) -> usize {
    let mut count = 0;
    for c in text.to_lowercase().chars() {
        match c {
            'a' | 'e' | 'i' | 'o' | 'u' => count += 1,
            _ => {}
        }
    }
    count
}

fn main() {
    println!("{}", count_vowels("Rust is Awesome"));
}
```
```output
6
```

Converting to lower case first means only five characters need checking. The arm `_ => {}` says "for anything else, do nothing": the empty block `{}` is how you write "no action" in a `match`.
:::

:::exercise practice Reverse a text
Write a function `reverse(text: &str) -> String` that returns the text backwards, and test it with `"stressed"` and with `"ሰላም"`. Use a loop and `push`.
::hint
`text.chars().rev()` gives the characters from last to first. Start with an empty `String` and push each character.
::solution
```rust run
fn reverse(text: &str) -> String {
    let mut result = String::new();
    for c in text.chars().rev() {
        result.push(c);
    }
    result
}

fn main() {
    println!("{}", reverse("stressed"));
    println!("{}", reverse("ሰላም"));
}
```
```output
desserts
ምላሰ
```

Because the loop goes through `char`s and not bytes, it works for every writing system. Reversing the *bytes* of the Amharic word would produce invalid text. The short form you saw earlier, `text.chars().rev().collect()`, does the same thing in one line.
:::

:::exercise practice The longest word
Write `longest_word(text: &str) -> &str`, which returns the longest word of a sentence. For `"the quick brown fox"` it returns `quick` (the first one, if several are equally long).
::hint
Keep a variable `let mut longest = "";`. For each word from `split_whitespace()`, compare `word.chars().count()` with the count of `longest`.
::solution
```rust run
fn longest_word(text: &str) -> &str {
    let mut longest = "";
    for word in text.split_whitespace() {
        if word.chars().count() > longest.chars().count() {
            longest = word;
        }
    }
    longest
}

fn main() {
    println!("{}", longest_word("the quick brown fox"));
}
```
```output
quick
```

The function returns a slice of the original sentence. No text is copied: `split_whitespace` hands out slices into `text`, and one of them is returned. Using `>` instead of `>=` keeps the first of several equally long words.
:::

:::exercise challenge Title case
Write `title_case(text: &str) -> String` that makes the first letter of every word a capital: `"the rust programming language"` becomes `"The Rust Programming Language"`. Words in the result are separated by single spaces.
::hint
Go through the words with `split_whitespace()`. For each word, go through its characters with `.chars().enumerate()` to know which one is the first. `c.to_uppercase()` can produce more than one character (the German `ß` becomes `SS`), so turn it into text with `.to_string()` and add it with `push_str`.
::solution
```rust run
fn title_case(text: &str) -> String {
    let mut result = String::new();
    for word in text.split_whitespace() {
        if !result.is_empty() {
            result.push(' ');
        }
        for (i, c) in word.chars().enumerate() {
            if i == 0 {
                result.push_str(&c.to_uppercase().to_string());
            } else {
                result.push(c);
            }
        }
    }
    result
}

fn main() {
    println!("{}", title_case("the rust programming language"));
}
```
```output
The Rust Programming Language
```

The outer loop handles words and puts a space before every word except the first. The inner loop handles characters, treating position 0 specially. The detail about `to_uppercase` shows how much care Rust's standard library takes with text: in some languages one letter turns into two when capitalised, and Rust's API does not pretend otherwise.
:::
