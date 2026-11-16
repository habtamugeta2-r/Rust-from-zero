@id project-todo
@part p3
@kind project
@title Project: a to-do list for the terminal
@short Project: to-do list
@level beginner
@time 90
@learn Design the data of a program with structs and enums before writing logic | Keep a list of structs in a `Vec` and change it through methods | Turn a line of text into a command with `match` | Separate "understanding the input" from "doing the work"

This project turns the types and control-flow tools from the earlier chapters into a small terminal to-do list. You will model a task with a struct, store tasks in a `Vec`, represent commands with an enum, then match each command to the operation it requests. The list lives in memory for this project, so it resets when the program exits.

A session will look like this:

```text
To-do list. Type help to see the commands.
add buy milk
Added task 1.
add call Sara
Added task 2.
list
[ ]  1  buy milk
[ ]  2  call Sara
done 1
Task 1 is done.
remove 2
Removed task 2.
list
[x]  1  buy milk
dance
Unknown command 'dance'. Type help.
quit
Goodbye!
```

Create the project with `cargo new todo`, open `src/main.rs`, and build it step by step. Run the program after every step.

:::plain One data type, one function per command
This project's shape repeats in every command-line tool you will ever write. The `Todo` items live in one `Vec`, the command line becomes an `enum` of subcommands through clap, and a single `run(command, &mut items) -> String` function does the work and returns what to print. `main` reads the file, calls `run`, prints the result, and writes the file back. Keeping the logic free of `stdout` and of the file system is what makes it testable: the tests call `run` directly and never touch a terminal.
:::

## Step 0: plan the data first

In the guessing game you planned the *steps*. For a bigger program, experienced Rust programmers start with a different question: **what data does the program work with?** Once the types are right, much of the code writes itself, and the compiler can check a lot more.

Ask three questions:

1. **What things exist?** Tasks. A task has a number (so the user can refer to it), a title, and a state: done or not done. That is a struct.
2. **What holds them?** A list of tasks that grows and shrinks: a `Vec<Task>`. The list also has to remember which number the next task gets.
3. **What can the user ask for?** One of a fixed set of commands: add, list, done, remove, help, quit. Some carry data (the title, or a task number). "One of several possibilities, each with its own data" is an enum.

## Step 1: the task and the list

```rust check
#[derive(Debug)]
struct Task {
    id: u32,
    title: String,
    done: bool,
}

struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    fn new() -> Self {
        Self { tasks: Vec::new(), next_id: 1 }
    }

    fn add(&mut self, title: String) -> u32 {
        let id = self.next_id;
        self.tasks.push(Task { id, title, done: false });
        self.next_id += 1;
        id
    }
}
# fn main() { let mut l = TodoList::new(); l.add(String::new()); println!("{:?} {}", l.tasks, l.next_id); let t = &l.tasks[0]; let _ = (t.id, &t.title, t.done); }
```

Three decisions are worth a comment:

- **`add` takes a `String`, not a `&str`.** The task will own its title, so the list needs an owned string in the end. By asking for a `String`, the function lets the caller hand over one it already has, with no copy.
- **`add` returns the new id**, so the caller can tell the user which number the task got.
- **Why an id, and not the position in the list?** Positions change when a task is removed: after removing the first task, the second one would become "task 1". An id that is given once and never reused always means the same task.

Try it with a temporary `main`:

```rust wrap
# #[derive(Debug)]
# struct Task { id: u32, title: String, done: bool }
# struct TodoList { tasks: Vec<Task>, next_id: u32 }
# impl TodoList {
#     fn new() -> Self { Self { tasks: Vec::new(), next_id: 1 } }
#     fn add(&mut self, title: String) -> u32 {
#         let id = self.next_id;
#         self.tasks.push(Task { id, title, done: false });
#         self.next_id += 1;
#         id
#     }
# }
let mut list = TodoList::new();
list.add(String::from("buy milk"));
list.add(String::from("call Sara"));
println!("{:#?}", list.tasks);
# let t = &list.tasks[0]; let _ = (t.id, &t.title, t.done);
```
```output
[
    Task {
        id: 1,
        title: "buy milk",
        done: false,
    },
    Task {
        id: 2,
        title: "call Sara",
        done: false,
    },
]
```

`{:#?}` earns its place here: with one derive you can see the complete state of your program at any moment.

## Step 2: the rest of the list's behaviour

Add three more methods inside the same `impl TodoList` block:

```rust check
# struct Task { id: u32, title: String, done: bool }
# struct TodoList { tasks: Vec<Task>, next_id: u32 }
impl TodoList {
    fn mark_done(&mut self, id: u32) -> bool {
        for task in &mut self.tasks {
            if task.id == id {
                task.done = true;
                return true;
            }
        }
        false
    }

    fn remove(&mut self, id: u32) -> bool {
        let before = self.tasks.len();
        self.tasks.retain(|task| task.id != id);
        self.tasks.len() < before
    }

    fn print(&self) {
        if self.tasks.is_empty() {
            println!("Nothing to do. Add a task with: add <what to do>");
            return;
        }
        for task in &self.tasks {
            let mark = if task.done { "x" } else { " " };
            println!("[{mark}] {:>2}  {}", task.id, task.title);
        }
    }
}
# fn main() { let mut l = TodoList { tasks: vec![], next_id: 1 }; l.mark_done(1); l.remove(1); l.print(); let _ = l.next_id; }
```

- `mark_done` loops over `&mut self.tasks`, so that it can change the task it finds. It returns `true` if a task with that id exists. The caller needs to know, in order to print the right message.
- `remove` uses `retain`, which keeps only the tasks for which the condition is true: all tasks whose id is *not* the one to delete. Comparing the length before and after tells whether something was removed.
- `print` only reads, so it takes `&self`. The format `{:>2}` prints the id right-aligned in two columns, so that the titles line up.

Each method's first parameter tells you whether it changes the list. That is useful documentation, and the compiler checks it.

## Step 3: the commands

```rust check
enum Command {
    Add(String),
    List,
    Done(u32),
    Remove(u32),
    Help,
    Quit,
}
# fn main() { let _ = [Command::Add(String::new()), Command::List, Command::Done(1), Command::Remove(1), Command::Help, Command::Quit]; }
```

This small enum is the heart of the design. The user types *text*, which can be anything. A `Command` can only be one of six well-formed requests. If the program manages to build a `Command`, the input was valid: `Done` always has a number, and `Add` always has a title. The rest of the program never has to check the input again.

:::key Make invalid states impossible to represent
This is a guiding idea of Rust design. Check untidy input **once**, at the edge of the program, and turn it into a precise type. Everything behind that edge works with values that cannot be wrong. People call it "parse, don't validate".
:::

## Step 4: from text to command

Now the function that sits at that edge. It can fail, so it returns a `Result`: `Ok(command)` or `Err(message for the user)`.

```rust check
# enum Command { Add(String), List, Done(u32), Remove(u32), Help, Quit }
fn parse(line: &str) -> Result<Command, String> {
    let line = line.trim();
    let (word, rest) = match line.split_once(' ') {
        Some((word, rest)) => (word, rest.trim()),
        None => (line, ""),
    };

    match (word, rest) {
        ("add", "") => Err(String::from("Usage: add <what to do>")),
        ("add", title) => Ok(Command::Add(title.to_string())),
        ("list", _) => Ok(Command::List),
        ("done", text) => match text.parse() {
            Ok(id) => Ok(Command::Done(id)),
            Err(_) => Err(String::from("Usage: done <number>")),
        },
        ("remove", text) => match text.parse() {
            Ok(id) => Ok(Command::Remove(id)),
            Err(_) => Err(String::from("Usage: remove <number>")),
        },
        ("help", _) => Ok(Command::Help),
        ("quit", _) => Ok(Command::Quit),
        (other, _) => Err(format!("Unknown command '{other}'. Type help.")),
    }
}
# fn main() { let _ = parse("x"); let _ = [Command::Add(String::new()), Command::List, Command::Done(1), Command::Remove(1), Command::Help, Command::Quit]; }
```

Go through it slowly:

1. `split_once(' ')` cuts the line at the first space and gives `Some((before, after))`, or `None` if there is no space. The `match` turns both cases into a pair: the command word and the rest of the line.
2. The second `match` looks at **both parts at once**, as a tuple. `("add", "")` is "the word add with nothing after it", an error. `("add", title)` is "the word add with anything else after it". The order matters: the more specific arm comes first.
3. For `done` and `remove`, the rest must be a number. `text.parse()` returns a `Result`, and an inner `match` turns it into a command or an error message. Rust works out that the number must be a `u32`, because it goes into `Command::Done(u32)`.
4. The last arm catches every other word and puts it into the error message.

Notice what the function does **not** do. It does not print anything, and it does not touch the list. It only translates. That makes it easy to understand and, as you will see in [chapter 27](#testing), easy to test.

## Step 5: the main loop

```rust check
# use std::io;
# struct Task { id: u32, title: String, done: bool }
# struct TodoList { tasks: Vec<Task>, next_id: u32 }
# impl TodoList {
#     fn new() -> Self { Self { tasks: Vec::new(), next_id: 1 } }
#     fn add(&mut self, title: String) -> u32 { let id = self.next_id; self.tasks.push(Task { id, title, done: false }); self.next_id += 1; id }
#     fn mark_done(&mut self, id: u32) -> bool { for t in &mut self.tasks { if t.id == id { t.done = true; return true; } } false }
#     fn remove(&mut self, id: u32) -> bool { let b = self.tasks.len(); self.tasks.retain(|t| t.id != id); self.tasks.len() < b }
#     fn print(&self) { for t in &self.tasks { println!("{} {} {}", t.done, t.id, t.title); } }
# }
# enum Command { Add(String), List, Done(u32), Remove(u32), Help, Quit }
# fn parse(_line: &str) -> Result<Command, String> { let _ = [Command::Add(String::new()), Command::List, Command::Done(1), Command::Remove(1), Command::Help]; Ok(Command::Quit) }
fn print_help() {
    println!("add <what to do>   add a task");
    println!("list               show all tasks");
    println!("done <number>      mark a task as done");
    println!("remove <number>    delete a task");
    println!("quit               leave the program");
}

fn main() {
    let mut list = TodoList::new();
    println!("To-do list. Type help to see the commands.");

    loop {
        let mut input = String::new();
        let bytes = io::stdin()
            .read_line(&mut input)
            .expect("could not read the input");
        if bytes == 0 {
            break; // the input has ended
        }
        if input.trim().is_empty() {
            continue;
        }

        match parse(&input) {
            Ok(Command::Add(title)) => {
                let id = list.add(title);
                println!("Added task {id}.");
            }
            Ok(Command::List) => list.print(),
            Ok(Command::Done(id)) => {
                if list.mark_done(id) {
                    println!("Task {id} is done.");
                } else {
                    println!("There is no task {id}.");
                }
            }
            Ok(Command::Remove(id)) => {
                if list.remove(id) {
                    println!("Removed task {id}.");
                } else {
                    println!("There is no task {id}.");
                }
            }
            Ok(Command::Help) => print_help(),
            Ok(Command::Quit) => break,
            Err(message) => println!("{message}"),
        }
    }
    println!("Goodbye!");
}
```

Add `use std::io;` as the first line of the file.

- `read_line` returns the number of bytes it read. Zero means the input has ended (for example, the user pressed {{Ctrl}}+{{D}}, or {{Ctrl}}+{{Z}} on Windows), so the loop stops.
- The `match` uses nested patterns: `Ok(Command::Add(title))` checks that parsing worked, that the command is `Add`, and takes out the title, all at once.
- `list.add(title)` moves the title from the command into the list. The text typed by the user is copied exactly once, in `parse`.
- If you add a seventh command to the enum later, this `match` will not compile until you handle it.

## The complete program

```rust check noplay
use std::io;

#[derive(Debug)]
struct Task {
    id: u32,
    title: String,
    done: bool,
}

struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    fn new() -> Self {
        Self { tasks: Vec::new(), next_id: 1 }
    }

    fn add(&mut self, title: String) -> u32 {
        let id = self.next_id;
        self.tasks.push(Task { id, title, done: false });
        self.next_id += 1;
        id
    }

    fn mark_done(&mut self, id: u32) -> bool {
        for task in &mut self.tasks {
            if task.id == id {
                task.done = true;
                return true;
            }
        }
        false
    }

    fn remove(&mut self, id: u32) -> bool {
        let before = self.tasks.len();
        self.tasks.retain(|task| task.id != id);
        self.tasks.len() < before
    }

    fn print(&self) {
        if self.tasks.is_empty() {
            println!("Nothing to do. Add a task with: add <what to do>");
            return;
        }
        for task in &self.tasks {
            let mark = if task.done { "x" } else { " " };
            println!("[{mark}] {:>2}  {}", task.id, task.title);
        }
    }
}

enum Command {
    Add(String),
    List,
    Done(u32),
    Remove(u32),
    Help,
    Quit,
}

fn parse(line: &str) -> Result<Command, String> {
    let line = line.trim();
    let (word, rest) = match line.split_once(' ') {
        Some((word, rest)) => (word, rest.trim()),
        None => (line, ""),
    };

    match (word, rest) {
        ("add", "") => Err(String::from("Usage: add <what to do>")),
        ("add", title) => Ok(Command::Add(title.to_string())),
        ("list", _) => Ok(Command::List),
        ("done", text) => match text.parse() {
            Ok(id) => Ok(Command::Done(id)),
            Err(_) => Err(String::from("Usage: done <number>")),
        },
        ("remove", text) => match text.parse() {
            Ok(id) => Ok(Command::Remove(id)),
            Err(_) => Err(String::from("Usage: remove <number>")),
        },
        ("help", _) => Ok(Command::Help),
        ("quit", _) => Ok(Command::Quit),
        (other, _) => Err(format!("Unknown command '{other}'. Type help.")),
    }
}

fn print_help() {
    println!("add <what to do>   add a task");
    println!("list               show all tasks");
    println!("done <number>      mark a task as done");
    println!("remove <number>    delete a task");
    println!("quit               leave the program");
}

fn main() {
    let mut list = TodoList::new();
    println!("To-do list. Type help to see the commands.");

    loop {
        let mut input = String::new();
        let bytes = io::stdin()
            .read_line(&mut input)
            .expect("could not read the input");
        if bytes == 0 {
            break; // the input has ended
        }
        if input.trim().is_empty() {
            continue;
        }

        match parse(&input) {
            Ok(Command::Add(title)) => {
                let id = list.add(title);
                println!("Added task {id}.");
            }
            Ok(Command::List) => list.print(),
            Ok(Command::Done(id)) => {
                if list.mark_done(id) {
                    println!("Task {id} is done.");
                } else {
                    println!("There is no task {id}.");
                }
            }
            Ok(Command::Remove(id)) => {
                if list.remove(id) {
                    println!("Removed task {id}.");
                } else {
                    println!("There is no task {id}.");
                }
            }
            Ok(Command::Help) => print_help(),
            Ok(Command::Quit) => break,
            Err(message) => println!("{message}"),
        }
    }
    println!("Goodbye!");
}
```

:::tip Keep the `Debug` derive
The finished program no longer prints a task with `{:?}`. Keep the derive anyway. The moment something goes wrong, a quick `dbg!(&list.tasks);` shows you what is inside.
:::

The program has three clearly separated layers, and each could be changed without touching the others:

| Layer | Code | Knows about |
|---|---|---|
| Data and rules | `Task`, `TodoList` and its methods | tasks. Nothing about text commands or the keyboard |
| Translation | `Command`, `parse` | the command language. Nothing about how tasks are stored |
| Conversation | `main`, `print_help` | reading lines and printing answers |

The tasks disappear when the program ends. Saving them to a file is the natural next step, and you will be able to do it after [chapter 23](#errors), which covers files and errors.

## Make it better

:::exercise practice Undo a tick
Add a command `undo <number>` that marks a finished task as not done.
::hint
You need four small changes: a new variant `Undo(u32)`, a new arm in `parse`, a new method on `TodoList` (very similar to `mark_done`), and a new arm in the `match` in `main`. The compiler will remind you of the last one.
::solution
The new parts:

```rust check
# struct Task { id: u32, done: bool }
# struct TodoList { tasks: Vec<Task> }
# enum Command { Undo(u32) }
impl TodoList {
    fn set_done(&mut self, id: u32, done: bool) -> bool {
        for task in &mut self.tasks {
            if task.id == id {
                task.done = done;
                return true;
            }
        }
        false
    }
}

// in the enum:      Undo(u32),
// in `parse`:
fn parse_undo(text: &str) -> Result<Command, String> {
    match text.parse() {
        Ok(id) => Ok(Command::Undo(id)),
        Err(_) => Err(String::from("Usage: undo <number>")),
    }
}
# fn main() { let mut l = TodoList { tasks: vec![Task { id: 1, done: true }] }; l.set_done(1, false); if let Ok(Command::Undo(n)) = parse_undo("1") { let _ = n; } }
```

In `parse`, the new arm is `("undo", text) => parse_undo(text),` and in `main` it is:

```rust
Ok(Command::Undo(id)) => {
    if list.set_done(id, false) {
        println!("Task {id} is open again.");
    } else {
        println!("There is no task {id}.");
    }
}
```

Instead of a copy of `mark_done`, the solution has one method `set_done(id, done)` that covers both directions, and `mark_done(id)` now becomes a call to `self.set_done(id, true)`. The three number commands also share the same parsing shape, so a small helper function for it is a good idea. Removing repetition like this is called **refactoring**: improving the structure of code without changing what it does.
:::

:::exercise practice A summary line
After the list, print a summary such as `2 of 5 done`. If all tasks are done, print `All done!` instead.
::hint
Count in the loop that prints the tasks, with a `mut` counter, or write a separate method `count_done(&self) -> usize`.
::solution
```rust check
# struct Task { done: bool }
# struct TodoList { tasks: Vec<Task> }
impl TodoList {
    fn count_done(&self) -> usize {
        let mut count = 0;
        for task in &self.tasks {
            if task.done {
                count += 1;
            }
        }
        count
    }

    fn print_summary(&self) {
        let done = self.count_done();
        let total = self.tasks.len();
        if total > 0 && done == total {
            println!("All done!");
        } else {
            println!("{done} of {total} done");
        }
    }
}
# fn main() { let l = TodoList { tasks: vec![Task { done: true }] }; l.print_summary(); }
```

A separate `count_done` method keeps `print` short and can be reused. The check `total > 0` avoids announcing "All done!" for an empty list. With iterators ([chapter 30](#iterators)) the counting becomes one line: `self.tasks.iter().filter(|t| t.done).count()`.
:::

:::exercise challenge Priorities
Give each task a priority: low, normal or high. `add` creates tasks with normal priority. A new command `priority <number> <low|normal|high>` changes it. `list` shows high-priority tasks first, then normal, then low.
::hint
Make an enum `Priority` and derive `Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord`. With `Ord` derived, variants compare in the order they are written, so write `High` first. Then sort before printing with `self.tasks.sort_by_key(|task| task.priority);`. The sort keeps tasks with equal priority in their existing order. `print` must then take `&mut self`, or you sort a list of references instead.
::solution
The central pieces:

```rust run
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Priority {
    High,
    Normal,
    Low,
}

#[derive(Debug)]
struct Task {
    id: u32,
    title: String,
    priority: Priority,
}

fn parse_priority(text: &str) -> Option<Priority> {
    match text {
        "high" => Some(Priority::High),
        "normal" => Some(Priority::Normal),
        "low" => Some(Priority::Low),
        _ => None,
    }
}

fn main() {
    let mut tasks = vec![
        Task { id: 1, title: String::from("water plants"), priority: Priority::Low },
        Task { id: 2, title: String::from("pay rent"), priority: Priority::High },
        Task { id: 3, title: String::from("buy milk"), priority: Priority::Normal },
        Task { id: 4, title: String::from("call doctor"), priority: Priority::High },
    ];

    if let Some(p) = parse_priority("high") {
        tasks[2].priority = p;
    }

    let mut sorted: Vec<&Task> = tasks.iter().collect();
    sorted.sort_by_key(|task| task.priority);
    for task in sorted {
        println!("{:<6} {:>2}  {}", format!("{:?}", task.priority), task.id, task.title);
    }
}
```
```output
High    2  pay rent
High    3  buy milk
High    4  call doctor
Low     1  water plants
```

The priority is an enum, not a number or a string, so an invalid priority cannot exist inside the program. `parse_priority` is again the single place where text becomes a precise type. Deriving `PartialOrd` and `Ord` makes the variants comparable in the order they are listed, which is all that `sort_by_key` needs. The solution sorts a separate vector of *references* to the tasks, so the list itself keeps its order and printing can stay a `&self` method.

For the command, `parse` has to split the rest of the line once more: `rest.split_once(' ')` gives the number and the priority word.
:::

## What you have learned

:::recap
- Start with the data: which things exist, what holds them, and what requests are possible.
- A struct with methods keeps data and the rules for changing it in one place.
- An enum describes all valid commands. Turning text into that enum once, at the edge, frees the rest of the program from checking input.
- `match` on a tuple looks at several values at once. Nested patterns take apart `Result` and enum in one step.
- Functions that only translate or only calculate, and do no input or output, are easy to reuse and test.
:::

:::quiz Check your understanding
? The program turns the typed line into a `Command` enum once, at the edge. What does that buy the rest of the program?
- The enum is stored on the heap instead of the stack
+ Every later function receives a value that is already known to be a valid command
- The program can skip checking the text entirely
- The compiler generates the matching code for you
= Parsing at the edge means the rest of the program never handles raw text. Each function takes a `Command` value, so an invalid command is rejected in one place, and the rest of the code can rely on the type.

? Why does the command parser use `match` on a tuple such as `(Command, String)`?
- Tuples are faster to match than structs
- It makes the argument optional
- Rust requires tuples in `match` arms
+ It lets one match look at the command and its argument together, including nested patterns for `Result`
= A tuple pattern matches several values in one arm, so `match (command, argument)` can bind both at once. Nested patterns take a `Result` and an enum apart in the same arm, which keeps the parser short and total.

? The task list lives inside a struct with methods rather than in a plain `Vec` passed around. Why?
- Methods run faster than free functions
+ A struct with methods keeps the data and the rules for changing it in one place
- A `Vec` cannot be stored inside a struct
- It lets the program skip the borrow checker
= Hiding the `Vec` behind a struct means only the methods can change it, so the rules about adding, completing and removing tasks stay in one file. The rest of the program cannot bypass them.

? The project separates the function that understands the input from the function that does the work. What is the benefit?
- The input function is the only one that can print, so output is easy to redirect
- The work functions no longer need error handling
- The input function runs faster
+ The work functions take data and return data, so they are easy to test and reuse
= Pure functions that only translate or calculate can be tested without a terminal, and reused for a different display. The only impure parts—reading, writing, saving—stay at the edges.
:::


:::checklist
- I built the program step by step and ran it after each step.
- I can explain why `Task` has an id and why the list owns its tasks.
- I can explain what `parse` returns and why it prints nothing.
- I added the `undo` command.
- I added the summary line.
- I changed something of my own (a `clear` command, a different display, a priority).
:::

You have finished the data-modelling section. You can now model real things with your own types and store them in collections. Next up: growing programs cleanly by splitting code into modules, handling errors properly, writing generic and trait-based code, and testing it.
