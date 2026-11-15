@id compilation-pipeline
@part p2
@title Compiler stages: lexing, parsing, AST, HIR, MIR, and LLVM IR
@short The compilation pipeline
@level beginner
@time 45
@learn Compare high-level languages, low-level languages, compilers, and interpreters | Trace source code through lexing, parsing, AST, name resolution, HIR, MIR, and LLVM IR | Explain why Rust performs type checking on HIR and borrow checking on MIR | Inspect real intermediate representations emitted by `rustc`

Turning `let sum = a + b;` into a running program involves several stages, much like translating a document before printing it: each stage changes the representation and makes particular checks or transformations possible. Rust's compiler, `rustc`, does not translate source text directly into the final instructions in one step. This chapter follows the main intermediate forms and explains what each contributes.

:::note A gentle tour before Part III
In Part II (Chapters 5–7), we open the hood of `rustc` so you can see how source text turns into a runnable program. Whenever a compiler stage mentions a Rust concept you have not met yet—such as *traits*, *generics*, or the *borrow checker*—do not worry about memorising it now: [Part III](#variables) teaches every single one from zero starting in [Chapter 8](#variables).
:::

## Starting point: languages, compilation, and interpretation

Human minds think in names, functions, structures, and safety rules. CPU hardware executes raw numeric opcodes on fixed-width registers. The gap between those two worlds gives rise to **high-level languages** (abstracting away registers and memory wiring), **low-level languages** (assembly and hardware-close languages like C), and **machine code** (the raw binary bytes the CPU control unit decodes).

:::analogy Translating blueprints at an architecture firm
Think of building a bridge:
1. A client writes plain wishes (*"connect two riverbanks for trucks"*).
2. A structural engineer drafts a blueprint and checks that the steel beams will not collapse (**front-end parsing, type checking, and borrow checking**).
3. A fabrication specialist simplifies the blueprint into standard cut-lists and stress steps (**MIR & LLVM IR optimisation**).
4. A steel mill cuts the exact girders and bolts (**back-end code generation and linking**).
Nothing touches physical steel until the math on paper proves sound.
:::

Languages cross this gap through three main execution strategies:

| Strategy | When translation happens | Strengths | Tradeoffs | Examples |
|---|---|---|---|---|
| **Ahead-of-Time (AOT) Compilation** | Before distribution via `rustc` / `clang` | Peak runtime speed, zero VM overhead, deep static checks | Slower build step; output binary targets one OS/CPU | Rust, C, C++, Go |
| **Interpretation** | Line/AST node by node while running | Instant start, portable scripts, dynamic typing | Interpreter dispatch overhead per step | Python (CPython), Bash |
| **JIT (Just-In-Time) Compilation** | Bytecode interpreted first, hot loops compiled at runtime | Cross-platform bytecode, profile-guided runtime opts | Warm-up latency, higher memory footprint, GC pauses | Java (HotSpot), JavaScript (V8) |

## The complete `rustc` pipeline

Here is the actual pipeline inside `rustc` from `.rs` source text to an executable binary:

```text
  src/main.rs (UTF-8 text)
       │
       ▼  1. Lexical Analysis (Lexer)
  Token Stream  [Keyword(fn), Ident("add"), LParen, ...]
       │
       ▼  2. Parsing + Macro Expansion
  AST (Abstract Syntax Tree)
       │
       ▼  3. Name Resolution & Lowering
  HIR (High-level Intermediate Representation)  ──▶ Type Checking & Trait Solving
       │
       ▼  4. Lowering to Control-Flow Graph
  MIR (Mid-level Intermediate Representation)   ──▶ Borrow Checking & Drop Elaboration
       │
       ▼  5. Translation to Backend IR (Codegen)
  LLVM IR (SSA virtual-register form)           ──▶ Target-Independent & Loop Optimisations
       │
       ▼  6. Backend (LLVM) + Linker (next two chapters)
  Assembly (.s) ─▶ Object File (.o) ─▶ ELF Executable Binary
```

Let us follow one small concrete Rust program across every compiler stage.

:::plain What is an Intermediate Representation (IR)?
An **Intermediate Representation (IR)** is a simplified internal language that the compiler uses between your `.rs` file and final machine code. Instead of trying to check types, prove memory safety, and optimise CPU registers all at once on messy human text, `rustc` steps down through three purpose-built IRs: **[[HIR]]** (for types and traits), **[[MIR]]** (for ownership and the [[borrow checker]]), and **[[LLVM IR]]** (for speed optimisations).
:::

## Source code: the sample program we will trace

```rust run
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let total = add(10, 32);
    println!("total = {total}");
}
```
```output
total = 42
```

Notice we also keep a clear mental eye on our upcoming guide-wide journey program:

```rust run
fn main() {
    let name = String::from("Habtamu");
    println!("{}", name);
}
```
```output
Habtamu
```

Even those three lines travel through every single compiler stage below before touching RAM or the screen.

## Stage 1: Lexical analysis (tokenisation)

First, the **lexer** reads the source file as raw UTF-8 characters (`f`, `n`, ` `, `a`, `d`, `d`, `(` ...), strips comments and insignificant whitespace, and groups characters into discrete words called **tokens**.

For `fn add(a: i32, b: i32) -> i32 { a + b }`, the token stream looks conceptually like:

```text
Keyword(fn)  Ident("add")  Punct('(')  Ident("a")  Punct(':')  Ident("i32")
Punct(',')   Ident("b")    Punct(':')  Ident("i32") Punct(')')  ThinArrow("->")
Ident("i32") Brace('{')    Ident("a")  Plus('+')    Ident("b")  Brace('}')
```

Notice that the lexer knows nothing about grammar or types yet: if you swap `fn` and `add` around (`add fn`), the lexer happily emits tokens, and the next stage catches the grammar error.

## Stage 2: Parsing and the Abstract Syntax Tree (AST)

The **parser** checks grammar rules and arranges flat tokens into a nested hierarchy called an **Abstract Syntax Tree** (**[[AST]]**). In Rust, macro invocations such as `println!(...)` are also expanded right here at the AST level before later analysis begins:

```text
ItemFn("add")
 ├── params: [Param("a", Ty("i32")), Param("b", Ty("i32"))]
 ├── return_ty: Ty("i32")
 └── body: Block
      └── ExprBinary(Op::Add)
           ├── lhs: ExprPath("a")
           └── rhs: ExprPath("b")
```

Notice why it is called *abstract*: parentheses and punctuation needed only to disambiguate text vanish, leaving pure tree structure. Macro expansion converts `println!("total = {total}")` into calls into `std::io::_print` and `core::fmt::Arguments` at this stage too.

## Stage 3: Name resolution, HIR, and semantic analysis

Once macros finish expanding, `rustc` resolves every identifier to its exact definition (handling scopes, `use` imports, and shadowing) and lowers the AST into **HIR** (**High-level Intermediate Representation**).

HIR strips syntactic sugar (for example, turning `for x in iter` into a `loop` calling `Iterator::next`, and desugaring `if let` into `match`), while retaining source spans and high-level constructs needed for **semantic analysis**:

- **Type inference and type checking:** Proving that `a` and `b` in `a + b` have matching types implementing `std::ops::Add`, and checking every branch returns the promised type.
- **Trait resolution:** Selecting which exact `impl Add for i32` or `impl Display for String` satisfies a generic bound.
- **Exhaustiveness checking:** Ensuring every `match` covers all variants.

## Stage 4: MIR and the borrow checker

Why does `rustc` invent **MIR** (**Mid-level Intermediate Representation**) instead of going straight from HIR to LLVM?

Because HIR still looks like nested trees (`if`, `while`, expressions), whereas **ownership**, **moves**, **borrowing**, and **automatic `Drop` calls** depend strictly on *every possible control-flow path* through time! MIR turns every function into a flat **control-flow graph** (**CFG**) of **basic blocks** (`bb0`, `bb1`, ...) connected by explicit jumps (`goto`, `switchInt`, `return`) and explicit `StorageLive` / `StorageDead` / `drop` statements:

```mir
fn add(_1: i32, _2: i32) -> i32 {
    debug a => _1;
    debug b => _2;
    let mut _0: i32;

    bb0: {
        _0 = Add(copy _1, copy _2);
        return;
    }
}
```

Notice five details in that real [[MIR]] structure:

- Every local variable and temporary gets an internal numbered slot (`_0` for the return value, `_1`, `_2` for parameters).
- Every block runs straight-line statements from top to bottom with zero hidden nested expressions.
- In debug builds (`opt-level=0`), MIR emits explicit overflow checks (`CheckedAdd` + `assert(!overflow)`) so integer wrap-around panics instead of silently wrapping.
- **MIR borrow checking** (including Non-Lexical Lifetimes) walks these basic blocks to prove that no reference outlives its owner, no value is used after being moved, and no mutable reference aliases another active reference.
- **Drop elaboration** inserts exact `drop(_slot)` edges on both normal returns and panic unwind paths (`unwind -> bb_cleanup`).

## Stage 5: LLVM IR and optimisation passes

Once MIR proves your Rust code is type-safe and memory-safe, `rustc` translates MIR (for each concrete type via [[monomorphisation]]) into **[[LLVM IR]]**—a strongly typed, target-independent virtual assembly language in **Static Single Assignment (SSA)** form (where every virtual register `%0`, `%1` is assigned exactly once):

```llvm
define noundef i32 @add(i32 noundef %a, i32 noundef %b) unnamed_addr {
start:
  %0 = add nsw i32 %b, %a
  ret i32 %0
}
```

Here, LLVM runs dozens of architecture-independent and target-tuned optimisation passes when compiling with `--release` (`-C opt-level=3`):

- **[[Inlining|inlining]]:** Replaces `add(10, 32)` inside `main` with its body.
- **Constant folding & propagation:** Turns `10 + 32` directly into the constant `42` at compile time.
- **Dead code elimination:** Deletes branches and computations whose values are never observed.
- **Loop unrolling & auto-vectorisation:** Rewrites scalar loops into multi-lane [[SIMD]] instructions.
- **Aliasing optimisations (`noalias`):** Because Rust's borrow checker guaranteed `&mut T` cannot alias any other live reference, LLVM can freely keep variables in registers across calls—an optimisation C compilers rarely dare unless programmers manually annotate `restrict`.

:::compare Why `rustc` compiles slower than C or Go, yet runs so fast
`rustc` runs rich semantic analysis and MIR borrow checking up front *and* hands unrolled, richly annotated (`noalias`, `nonnull`, `dereferenceable`) IR to LLVM's deep optimisation pipeline. You pay extra time once during `cargo build --release` in exchange for zero garbage-collector pauses and machine code optimised aggressively without sacrificing memory safety.
:::

## Practical experiment: emit MIR and LLVM IR with `rustc`

You can ask `rustc` itself to dump any intermediate representation directly to files on Linux:

```sh
$ rustc --emit=mir -C opt-level=0 example.rs       # generates example.mir
$ rustc --emit=llvm-ir -C opt-level=3 example.rs   # generates example.ll
$ cargo rustc -- --emit=llvm-ir                    # inside a Cargo crate
```

Compare `-C opt-level=0` vs `-C opt-level=3` on `example.ll`: in debug mode (`opt-level=0`), `main` keeps separate calls and overflow checks (`llvm.sadd.with.overflow.i32`); in release mode (`opt-level=3`), `add(10, 32)` folds cleanly into `42` before reaching assembly!

:::recap
- Computers run numeric machine code; compilers translate human-readable source code across structured stages so errors are caught early and optimisations are sound.
- `rustc` runs **lexing** (tokens) → **parsing & macro expansion** (AST) → **name resolution & type checking** (HIR) → **borrow checking & drop elaboration** (MIR) → **optimisations** (LLVM IR).
- MIR uses flat basic blocks so the borrow checker can prove aliasing and lifetime invariants on every execution path.
- Rust's strict aliasing rules feed strong guarantees (`noalias`) into LLVM, enabling faster optimised machine code.
:::

:::quiz Check your understanding
? Which compiler stage converts raw UTF-8 text into keywords, identifiers, and punctuation tokens?
+ Lexical analysis (lexer)
- MIR lowering
- LLVM optimisation
- Static linking
= The lexer scans characters into discrete tokens before the parser builds a syntax tree.

? At which intermediate representation does `rustc` execute the borrow checker?
- Directly on raw UTF-8 characters
- On the AST before macro expansion
+ On MIR (Mid-level Intermediate Representation)
- Inside the linker after ELF creation
= MIR flattens nested syntax into basic blocks and explicit control-flow edges, allowing the borrow checker and drop elaborator to verify every possible execution path.

? Why does `rustc --release` fold `add(10, 32)` directly into `42`?
- Because the CPU hardware executes arithmetic inside RAM before launching the binary
+ Because LLVM performs inlining and constant folding on LLVM IR when optimisations are enabled
- Because the lexer evaluates arithmetic expressions while reading tokens
- Because Rust forbids function calls on literals
= LLVM inlines small functions and folds compile-time-known constants during its optimisation passes.

? Why can LLVM apply stronger `noalias` optimisations to Rust `&mut T` references than to typical C pointers?
- Because Rust disables CPU caches
+ Because the Rust borrow checker already proved at compile time that no other active pointer aliases `&mut T`
- Because C has no integer addition instruction
- Because Rust programs always run in an interpreter
= Rust's aliasing rules give LLVM mathematical permission to keep values in CPU registers without reloading memory after unrelated writes.
:::

:::exercise guided Trace tokens and AST nodes
Write out the token stream and a simplified AST tree for the Rust statement `let y = x * 2 + 1;`.
::hint
Remember operator precedence: multiplication (`*`) binds tighter than addition (`+`), so `x * 2` forms the left subtree under `+`.
::solution
**Tokens:** `Keyword(let)`, `Ident("y")`, `Eq('=')`, `Ident("x")`, `Star('*')`, `IntLit(2)`, `Plus('+')`, `IntLit(1)`, `Semi(';')`.

**Simplified AST:**
```text
StmtLocal("y")
 └── init: ExprBinary(Add)
      ├── lhs: ExprBinary(Mul)
      │    ├── lhs: ExprPath("x")
      │    └── rhs: Lit(2)
      └── rhs: Lit(1)
```
The AST captures precedence (`(x * 2) + 1`) cleanly without needing parentheses.
:::

:::exercise practice Inspect debug vs optimised behaviour in Rust
Using `wrapping_add` vs regular `+`, write a small program that computes `(10_i32 + 32)` and `(u8::MAX).wrapping_add(1)` and observe how Rust distinguishes normal checked arithmetic (which emits overflow checks in debug MIR) from explicit wrapping arithmetic.
::hint
In Rust, `u8::MAX.wrapping_add(1)` intentionally wraps to `0` in both debug and release builds without triggering a debug overflow panic.
::solution
```rust run
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let total = add(10, 32);
    let wrapped = u8::MAX.wrapping_add(1);
    println!("total = {total}, wrapped = {wrapped}");
}
```
```output
total = 42, wrapped = 0
```

In debug MIR, `a + b` inserts a `CheckedAdd` assertion so overflow panics loudly; `wrapping_add` tells MIR and LLVM to emit a raw wrap-around integer add with zero overflow check in every build profile.
:::

:::exercise challenge Explain why borrow checking happens after macro expansion and HIR
Suppose a macro expands into a block that borrows a variable mutably twice. Why must borrow checking run *after* macro expansion, HIR type checking, and MIR lowering rather than on raw tokens?
::hint
Think about what you know before macros expand and before types (`Copy` vs non-`Copy`!) are known.
::solution
1. **Before macro expansion:** The raw source contains only macro invocations (`println!(...)`, `vec![...]`), not the actual Rust bindings and borrows inside the generated code.
2. **Before HIR type checking:** The compiler does not yet know whether a variable's type implements `Copy` (`i32`) or moves (`String`), nor which methods borrow `&self` vs `&mut self` vs move `self`.
3. **Only on MIR:** All control-flow branches, implicit drops, moves, and lifetimes sit as explicit paths, letting the borrow checker check every branch cleanly.
:::
