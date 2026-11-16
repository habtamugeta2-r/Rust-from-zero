@id bits-bytes-representation
@part p1
@title Bits, bytes, binary, hex, and data and instruction representation
@short Bits, binary, hex, and encoding
@level beginner
@time 30
@learn Convert numbers between decimal, binary, and hexadecimal | Explain two's complement representation of signed integers and wrap-around | Read the sign, exponent, and mantissa layout of IEEE-754 floats and UTF-8 bytes | Explain little-endian byte ordering and how machine instructions live as bytes in memory

A byte in memory does not label itself as a letter, a negative number or an instruction. It is a bit pattern; software interprets that pattern according to an agreed representation. The same bits can stand for an integer, part of a floating-point number, UTF-8 text or a machine instruction. This chapter builds the tools for reading those representations.

## Starting point: why binary and hexadecimal exist

A single wire or transistor switch is easiest to build reliably when it distinguishes only two states: low voltage (**0**) and high voltage (**1**). One binary digit is a **[[bit]]**. Grouping **8 bits** together creates a **[[byte]]**, which can take `2^8 = 256` distinct patterns (`00000000` through `11111111`, or `0` through `255` unsigned).

:::analogy A bank of light switches and shorthand tickets
Eight wall switches side by side form one byte: reading out `"off-on-off-off-on-off-on-off"` every time is exhausting. Grouping switches in fours (`0100` and `1010`) gives **hexadecimal** (base 16), where each 4-bit nibble fits cleanly into one character (`0`–`9`, `A`–`F`). That makes `"01001010"` read simply as `0x4A`—two crisp digits instead of eight bits.
:::

| Base | Digits | Example value (decimal 42) | Prefix in Rust |
|---|---|---|---|
| Binary (base 2) | `0`, `1` | `0b0010_1010` | `0b` |
| Decimal (base 10) | `0`–`9` | `42` | none |
| Hexadecimal (base 16) | `0`–`9`, `a`–`f` | `0x2a` | `0x` |

Notice how each hex digit maps cleanly to **exactly four bits**:

| Hex | Binary | Decimal | Hex | Binary | Decimal |
|---|---|---|---|---|---|
| `0` | `0000` | 0 | `8` | `1000` | 8 |
| `1` | `0001` | 1 | `9` | `1001` | 9 |
| `2` | `0010` | 2 | `A` | `1010` | 10 |
| `3` | `0011` | 3 | `B` | `1011` | 11 |
| `4` | `0100` | 4 | `C` | `1100` | 12 |
| `5` | `0101` | 5 | `D` | `1101` | 13 |
| `6` | `0110` | 6 | `E` | `1110` | 14 |
| `7` | `0111` | 7 | `F` | `1111` | 15 |

## Signed integers and two's complement

Unsigned integers (`u8`, `u16`, `u32`, `u64`) count strictly upward from `0`. How does a machine represent **negative** whole numbers using the same 0/1 bits so addition hardware still works?

Virtually every modern CPU uses **[[two's complement]]**. In an 8-bit signed integer (`i8`), the top bit carries weight **−128** instead of **+128**:

```text
Bit position:   b7    b6   b5   b4   b3   b2   b1   b0
Unsigned weight:+128  +64  +32  +16   +8   +4   +2   +1   (u8: 0 .. 255)
Signed weight:  -128  +64  +32  +16   +8   +4   +2   +1   (i8: -128 .. +127)
```

:::plain Two's complement in one sentence
To flip the sign of any integer in **two's complement**, **invert every bit (`0` ↔ `1`) and add `1`**. That clever layout means `-1` is all ones (`1111_1111`), and adding `1` rolls cleanly back to `0000_0000` (`0`) using the exact same hardware adder circuit as unsigned numbers.
:::

Watch that rule work on `+5`:

- `+5` in `i8` is `0000_0101`.
- Invert bits: `1111_1010`.
- Add `1`: `1111_1011` (`-128 + 64 + 32 + 16 + 8 + 2 + 1 = -5`).
- Check what happens when the [[ALU]] adds `+5 + (-5)`: `0000_0101 + 1111_1011 = (1) 0000_0000`! Dropping the ninth carry bit leaves `0`. That is why the ALU uses **one single binary adder circuit** for both `u8` and `i8`.

## Floating-point numbers (IEEE-754) and UTF-8 text

Integers cannot represent `3.14159` or `0.0001`. Rust's `f32` and `f64` store numbers in **IEEE-754 binary floating-point** format—essentially scientific notation in base 2:

```text
f32 (32 bits total):
+------+------------------+-----------------------------------------------+
| sign |  exponent (8 b)  |            fraction / mantissa (23 b)         |
|  1b  |  biased by 127   |    leading 1. implicit for normal numbers     |
+------+------------------+-----------------------------------------------+
```

Because `0.1` in decimal has a repeating binary expansion (`0.0001100110011...₂`), rounding occurs inside the finite mantissa—which is why `0.1_f64 + 0.2_f64 != 0.3_f64` on hardware!

**Text (`UTF-8`)** encodes Unicode characters into 1 to 4 bytes using prefix bits so ASCII (`0xxxxxxx`) remains 1 byte while international scripts fit smoothly:

| Character | Unicode code point | UTF-8 bytes (hex) | Byte count |
|---|---|---|---|
| `'A'` | `U+0041` | `41` | 1 |
| `'é'` | `U+00E9` | `c3 a9` | 2 |
| `'ሀ'` (Ethiopic `ha`) | `U+1200` | `e1 88 80` | 3 |
| `'🦀'` (crab emoji) | `U+1F980` | `f0 9f a6 80` | 4 |

## Endianness: byte order in multi-byte memory

A single byte sits at one memory address. What order do the 4 bytes of a 32-bit integer (`u32`) such as `0x12345678` occupy in RAM? That rule is called **[[endianness]]**:

:::plain Little-endian vs big-endian
Think of writing a date: `15-11-2026` puts the **smallest** unit (the day) first, whereas `2026-11-15` puts the **biggest** unit (the year) first. **Little-endian** CPUs (x86-64 and ARM64) store the *smallest* ("least-significant") byte at the first memory address; **big-endian** network protocols store the *biggest* ("most-significant") byte first on the wire.
:::

- **Little-endian** (used by `x86-64` and almost all Linux/Windows ARM64 systems) puts the **least-significant byte** (`0x78`) at the **lowest address**: `78 56 34 12`.
- **Big-endian** (used by network protocols such as TCP/IP—often called *network byte order*) puts the **most-significant byte** (`0x12`) first: `12 34 56 78`.

```text
Value in CPU register:  0x12345678

Address:          0x100   0x101   0x102   0x103
Little-endian:  [ 0x78  | 0x56  | 0x34  | 0x12  ]  (LSB at lowest address)
Big-endian:     [ 0x12  | 0x34  | 0x56  | 0x78  ]  (MSB at lowest address)
```

:::warn Endianness only orders bytes, not bits inside a byte
Inside each individual byte, bit 7 (`128`) through bit 0 (`1`) keep their usual numeric weights; endianness determines the order of multi-byte chunks across consecutive memory addresses.
:::

## How instructions themselves are represented

Crucially, **machine instructions live in memory as bytes right alongside data**. On x86-64, for example, the two-instruction function `return a + b` compiles down to just four raw bytes in the `.text` code section:

```text
Byte hex:     8d        04        37        c3
Mnemonic:     lea       eax,      [rdi+rsi] ret
Meaning:      [opcode]  [ModR/M]  [SIB]     [return]
```

To a RAM chip, `0x8d 0x04 0x37 0xc3` is four bytes—indistinguishable from a four-byte string or the integer `0xc337048d`. What makes the CPU execute them as instructions is that the **program counter (`RIP`)** points at their address and the **control unit** fetches them into the **instruction register**! (When you read about **buffer overflows** and **[[W^X]] memory protection** in Part 6, you will see why keeping writable data pages non-executable is critical for security.)

## Following the ten-stage lens: inspecting raw byte representations in Rust

Just as in [Chapter 2](#hardware-architecture), you do not need to memorise the Rust syntax yet ([Chapter 4](#setup) and [Part 3](#variables) teach every piece)—focus on how each value turns into raw bits and bytes:

1. **Starting point:** Seeing how a negative number, a float, and [[UTF-8]] text look as raw bytes in memory.
2. **Source code:**
```rust run
fn main() {
    let signed: i32 = -5;
    let unsigned_bits: u32 = signed as u32;
    let float_val: f32 = -5.5;
    let text = "A🦀";

    // {:032b} prints 32 binary digits; {:02x?} prints hexadecimal bytes:
    println!("i32 -5 in binary : {:032b}", unsigned_bits);
    println!("i32 -5 LE bytes  : {:02x?}", signed.to_le_bytes());
    println!("i32 -5 BE bytes  : {:02x?}", signed.to_be_bytes());
    println!("f32 -5.5 bits    : 0x{:08x}", float_val.to_bits());
    println!("UTF-8 {:?} bytes : {:02x?}", text, text.as_bytes());
}
```
```output
i32 -5 in binary : 11111111111111111111111111111011
i32 -5 LE bytes  : [fb, ff, ff, ff]
i32 -5 BE bytes  : [ff, ff, ff, fb]
f32 -5.5 bits    : 0xc0b00000
UTF-8 "A🦀" bytes : [41, f0, 9f, a6, 80]
```
3. **Compiler perspective:** `to_le_bytes()` and `f32::to_bits()` compile to zero-cost bit reinterpretations (`transmute` inside `core`)—on little-endian CPUs, `to_le_bytes()` requires zero runtime swapping.
4. **Compiled representation:** `to_be_bytes()` compiles to a single `bswap` instruction on x86-64 (`rev` on ARM64) when reversing byte order is genuinely needed.
5. **Memory & hardware perspective:** `-5` sits in 4 bytes as `[fb, ff, ff, ff]` on x86-64 (`0xfb = 251 = 11111011₂`), and `"A🦀"` consumes 1 byte (`0x41`) plus 4 bytes (`0xf0 0x9f 0xa6 0x80`).
6. **Practical experiment:** Run the snippet above and modify `signed` to `-1`, `i32::MIN`, or another Unicode character to verify every byte pattern by hand.

:::compare Rust keeps types strict over the same bytes
In C, pointer casts can easily misread float bytes as integers or read past a string's end. Rust gives every pattern a strict type (`i32`, `u32`, `f32`, `&str`), while providing explicit, safe conversion methods (`to_bits`, `from_bits`, `to_le_bytes`, `as_bytes`) whenever you intentionally want to inspect the underlying bits.
:::

:::recap
- Computers store all values and instructions as **bits** grouped into 8-bit **bytes**, usually written in **hexadecimal** (`0x`).
- Signed integers use **two's complement**, letting one binary adder circuit handle both positive and negative numbers.
- Floats use **IEEE-754** sign/exponent/mantissa fields; strings in Rust use **UTF-8** variable-length bytes.
- Little-endian CPUs place the least-significant byte at the lowest address; instructions themselves are simply bytes in memory pointed to by the program counter.
:::

:::quiz Check your understanding
? What is `0x2A` in decimal and binary?
- 32 and `0b0010_0000`
+ 42 and `0b0010_1010`
- 26 and `0b0001_1010`
- 44 and `0b0010_1100`
= `2 * 16 + 10 = 42`, and `2 = 0010`, `A (10) = 1010`, giving `0010_1010`.

? In 8-bit two's complement (`i8`), what value does `1111_1111` (`0xFF`) represent?
- 255
- -127
+ -1
- -128
= `-128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = -1`. Adding `1` wraps cleanly to `0`.

? On a little-endian machine, how are the 4 bytes of `0x01020304_u32` stored from lowest address to highest address?
- `[01, 02, 03, 04]`
- `[02, 01, 04, 03]`
- `[40, 30, 20, 10]`
+ `[04, 03, 02, 01]`
= Little-endian puts the least-significant byte (`0x04`) at the lowest memory address first.

? Why can the CPU tell a sequence of machine instructions apart from ordinary text bytes in memory?
+ The program counter (`PC`) points to instruction bytes for the control unit to fetch and decode, whereas data addresses are read by load instructions
- Instructions use 9-bit bytes while text uses 8-bit bytes
- Instructions are stored exclusively inside the CPU forever and never in RAM
- ASCII text is encrypted in hardware
= In RAM, both instructions and data are 8-bit bytes; role depends on whether the CPU fetches them via the instruction pointer or loads them as data (assisted by OS page execution permissions).
:::

:::exercise guided Decode a float by hand
Print the IEEE-754 sign bit (bit 31), 8-bit biased exponent (bits 30..23), and 23-bit fraction (bits 22..0) of `6.5_f32` using `.to_bits()` and bitwise shifts (`>>`) and masks (`&`).
::hint
In Rust, `let bits = 6.5_f32.to_bits();` gives a `u32`. Extract `sign = bits >> 31`, `exp = (bits >> 23) & 0xff`, and `frac = bits & 0x7f_ffff`. Subtract `127` from `exp` to see the real power of 2!
::solution
```rust run
fn main() {
    let x = 6.5_f32;
    let bits = x.to_bits();
    let sign = bits >> 31;
    let exp_biased = (bits >> 23) & 0xff;
    let frac = bits & 0x7f_ffff;

    println!("bits       = 0x{bits:08x}");
    println!("sign       = {sign}");
    println!("exponent   = {exp_biased} (unbiased: {})", exp_biased as i32 - 127);
    println!("fraction   = 0b{frac:023b}");
}
```
```output
bits       = 0x40d00000
sign       = 0
exponent   = 129 (unbiased: 2)
fraction   = 0b10100000000000000000000
```

`6.5 = 1.101₂ × 2² = (1 + 0.5 + 0.125) × 4 = 6.5`! Every normal `f32` reconstructs cleanly from those three bit fields.
:::

:::exercise practice Two's complement calculator
Write a function `negate_twos_complement(x: u8) -> u8` that computes the 8-bit two's complement negation using only bitwise NOT (`!`) and `.wrapping_add(1)`, and verify it matches `(-(x as i8)) as u8` for `5`, `42`, and `127`.
::hint
Bitwise NOT in Rust is `!x`, and wrapping addition on `u8` is `.wrapping_add(1)`.
::solution
```rust run
fn negate_twos_complement(x: u8) -> u8 {
    (!x).wrapping_add(1)
}

fn main() {
    for n in [5_i8, 42, 127] {
        let manual = negate_twos_complement(n as u8) as i8;
        println!("n = {n:>3} -> manual = {manual:>4}, expected = {:>4}", -n);
    }
}
```
```output
n =   5 -> manual =   -5, expected =   -5
n =  42 -> manual =  -42, expected =  -42
n = 127 -> manual = -127, expected = -127
```

Hardware subtraction (`a - b`) works the exact same way inside the ALU: invert `b`'s bits, feed `carry-in = 1`, and add!
:::

:::exercise challenge Inspect a tiny hex dump
Write a function `hex_dump(bytes: &[u8])` that prints a byte slice in rows of 8 bytes showing the hex byte offset (`0000:`), the hex bytes, and printable ASCII characters (replacing non-printable bytes with `.`). Test it on `"Rust\0\x7fELF"`.
::hint
Use `bytes.chunks(8)` with `.enumerate()`, and check `b.is_ascii_graphic() || b == b' '` to decide whether to print `b as char` or `'.'`.
::solution
```rust run
fn hex_dump(bytes: &[u8]) {
    for (row, chunk) in bytes.chunks(8).enumerate() {
        print!("{:04x}: ", row * 8);
        for b in chunk {
            print!("{b:02x} ");
        }
        for _ in chunk.len()..8 {
            print!("   ");
        }
        print!(" |");
        for &b in chunk {
            let ch = if b.is_ascii_graphic() || b == b' ' { b as char } else { '.' };
            print!("{ch}");
        }
        println!("|");
    }
}

fn main() {
    hex_dump(b"Rust\0\x7fELF!");
}
```
```output
0000: 52 75 73 74 00 7f 45 4c  |Rust..EL|
0008: 46 21                    |F!|
```

That format is almost identical to what `xxd` or `hexdump -C` prints when you inspect real compiled binaries in Part 2.
:::
