@id games-embedded
@part p10
@title Games, small devices and data
@short Games, devices, data
@level intermediate
@time 100
@learn Explain the game loop and why movement is multiplied by the frame time | Write a small game with macroquad | Describe entities, components and systems, and run a Bevy app | Say what `no_std` means and what `core` still offers | Run a program for a microcontroller in an emulator and read its layers: PAC, HAL, `embedded-hal`, drivers | Test device logic on your own machine with a fake pin | Calculate with tables of numbers in ndarray and summarise data with Polars | Explain how a program learns a line from data

Three more fields where Rust is used, and each of them could fill a book of its own. This chapter gives you a first working program in each field, the two or three ideas that everything else builds on, and a map of the crates.

:::note How the programs of this chapter were tested
The games were built and played on Linux with real key presses. The program for a microcontroller ran in an emulator. The program for the Raspberry Pi Pico was compiled for that chip, but not loaded onto a real board. The other examples that show an output were run by the checker of this guide, like the examples of the earlier chapters.
:::

## Games

:::analogy A flip book
A flip book is a stack of drawings, each a little different from the one before. Flip through it quickly and the figure moves. A game does the same thing, but it makes each drawing at the moment it is needed: it looks at what the player is doing, moves everything a tiny step, draws the picture, and starts again. Sixty times a second.
:::

One round of this is a **frame**, and the endless repetition is the **game loop**:

1. **Input:** which keys are down, where is the mouse?
2. **Update:** move things, detect collisions, count points.
3. **Draw:** paint the new picture.

### A complete small game with macroquad

The library **macroquad** gives you exactly this loop and a handful of drawing functions, and nothing to configure. The game below has a ball that bounces off the walls, and a paddle that the player moves with the arrow keys. Every hit with the paddle is a point. When the ball falls past the paddle, the game starts over.

```toml file=Cargo.toml
[dependencies]
macroquad = "0.4.16"
```

```rust file=src/main.rs
use macroquad::prelude::*;

const RADIUS: f32 = 12.0;
const PADDLE_WIDTH: f32 = 120.0;

#[macroquad::main("Keep it up")]
async fn main() {
    let mut ball = vec2(200.0, 100.0);
    let mut speed = vec2(180.0, 220.0); // pixels per second
    let mut paddle_x = 300.0;
    let mut score = 0;

    loop {
        let seconds = get_frame_time(); // the time since the last frame
        let paddle_y = screen_height() - 40.0;

        // 1. Read the input
        if is_key_down(KeyCode::Left) {
            paddle_x -= 400.0 * seconds;
        }
        if is_key_down(KeyCode::Right) {
            paddle_x += 400.0 * seconds;
        }
        paddle_x = paddle_x.clamp(0.0, screen_width() - PADDLE_WIDTH);

        // 2. Update the world
        ball += speed * seconds;
        if ball.x < RADIUS || ball.x > screen_width() - RADIUS {
            speed.x = -speed.x;
        }
        if ball.y < RADIUS {
            speed.y = -speed.y;
        }
        let above_paddle = ball.x >= paddle_x && ball.x <= paddle_x + PADDLE_WIDTH;
        if speed.y > 0.0 && above_paddle && ball.y + RADIUS >= paddle_y && ball.y < paddle_y {
            speed.y = -speed.y;
            score += 1;
        }
        if ball.y > screen_height() {
            ball = vec2(200.0, 100.0);
            score = 0;
        }

        // 3. Draw everything
        clear_background(DARKBLUE);
        draw_circle(ball.x, ball.y, RADIUS, YELLOW);
        draw_rectangle(paddle_x, paddle_y, PADDLE_WIDTH, 16.0, WHITE);
        draw_text(&format!("Score: {score}"), 20.0, 40.0, 32.0, WHITE);

        next_frame().await;
    }
}
```

`cargo run` opens a blue window with a yellow ball, a white paddle, and the score.

- `#[macroquad::main("Keep it up")]` opens the window with this title and then runs your function. The function is `async` for a simple reason: `next_frame().await` is the place where it pauses, the finished picture goes to the screen, and the library collects new input. You need no async runtime for this.
- The body of `loop` is one frame, and the three steps are easy to see.
- The variables before the loop are the whole state of the game.

The most important detail is `* seconds`. Frames do not take equally long. A fast machine draws more of them per second than a slow one. If the ball moved a fixed distance *per frame*, the game would run faster on a faster machine. So speeds are given in pixels *per second*, and each frame moves things by speed × the time that has passed since the last frame. This time is called the **delta time**.

:::tip Start small
macroquad compiles in well under a minute and needs about 30 crates. It is a good place to learn how games work. The usual next steps are pictures with `load_texture`, sounds, and a `struct` for each kind of thing in the game.
:::

### Bevy: entities, components, systems

A larger game has hundreds of kinds of things: players, enemies, bullets, doors, sounds, particles. Keeping each in its own variable and its own block of the loop stops working. **Bevy**, the best-known game engine written in Rust, organises a game in a way called **ECS**:

- An **entity** is a thing in the game. By itself it is only an identity number.
- A **component** is a piece of data attached to an entity: a position, a velocity, a health value. An entity is defined by the components it carries.
- A **system** is a function that runs every frame and works on *all entities that have certain components*.

:::analogy A table with optional columns
Think of a big table. Every row is an entity, and every column is a kind of component. A cell may be empty: a tree has a position but no velocity. A system is a rule such as "for every row that has both a position and a velocity, add the velocity to the position". The rule does not care what else the row contains, or what the thing "is".
:::

Here is that rule as a program. It runs three frames without opening a window:

```toml file=Cargo.toml
[dependencies]
bevy = "0.20.1"
```

```rust file=src/bin/ecs.rs
use bevy::prelude::*;

#[derive(Component)]
struct Label(String);

#[derive(Component)]
struct Position {
    x: f32,
    y: f32,
}

#[derive(Component)]
struct Velocity {
    x: f32,
    y: f32,
}

/// Runs once at the start: creates the entities.
fn setup(mut commands: Commands) {
    commands.spawn((
        Label("rocket".into()),
        Position { x: 0.0, y: 0.0 },
        Velocity { x: 1.0, y: 2.0 },
    ));
    commands.spawn((
        Label("bird".into()),
        Position { x: 10.0, y: 5.0 },
        Velocity { x: -0.5, y: 0.0 },
    ));
    commands.spawn((Label("tree".into()), Position { x: 3.0, y: 0.0 }));
}

/// Runs every frame: moves everything that has a position AND a velocity.
fn movement(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut position, velocity) in &mut query {
        position.x += velocity.x;
        position.y += velocity.y;
    }
}

/// Runs every frame: prints everything that has a label and a position.
fn report(query: Query<(&Label, &Position)>) {
    for (label, position) in &query {
        println!(
            "{:<6} at ({:>4.1}, {:>4.1})",
            label.0, position.x, position.y
        );
    }
    println!("--");
}

fn main() {
    let mut app = App::new();
    app.add_systems(Startup, setup)
        .add_systems(Update, (movement, report).chain());

    // Three frames, without a window
    for _ in 0..3 {
        app.update();
    }
}
```
```output
tree   at ( 3.0,  0.0)
rocket at ( 1.0,  2.0)
bird   at ( 9.5,  5.0)
--
tree   at ( 3.0,  0.0)
rocket at ( 2.0,  4.0)
bird   at ( 9.0,  5.0)
--
tree   at ( 3.0,  0.0)
rocket at ( 3.0,  6.0)
bird   at ( 8.5,  5.0)
--
```

- A component is an ordinary struct with `#[derive(Component)]`.
- `commands.spawn(…)` creates an entity from a tuple of components.
- A system is an ordinary function. Its parameters say what it needs, and Bevy passes it in. You saw the same trick with the extractors of Axum in [chapter 46](#web).
- `Query<(&mut Position, &Velocity)>` means: every entity that has both components, with the position writable. The tree has no `Velocity`, so `movement` never sees it. `report` asks only for a label and a position, and gets all three.
- `add_systems(Startup, …)` registers systems that run once. Those under `Update` run every frame. `.chain()` fixes their order: first move, then report.
- The tree is printed first although it was created last. Bevy stores entities with the same set of components together, and a query walks through these groups. Never rely on the order.

Two things make this design more than a matter of taste. It **composes**: to make the tree fall over, you add a `Velocity` to it, and the existing system moves it. No class has to be rewritten. And it is **fast**: the components of one kind lie side by side in memory, as in the "struct of arrays" layout of [chapter 37](#memory-layout). Bevy also reads from the parameters which systems touch the same data. Systems that do not get in each other's way run on several cores at the same time. These are the borrowing rules, applied to whole functions: many readers or one writer.

### A window and the keyboard

A real Bevy game adds `DefaultPlugins`, which brings the window, the renderer, input and sound. This program shows a square that follows the arrow keys:

```rust file=src/bin/window.rs
use bevy::prelude::*;

/// A marker: the entity that the keys move.
#[derive(Component)]
struct Player;

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands.spawn((
        Player,
        Sprite::from_color(Color::srgb(0.9, 0.4, 0.2), Vec2::splat(60.0)),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));
}

fn move_player(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut player: Single<&mut Transform, With<Player>>,
) {
    let mut direction = Vec2::ZERO;
    if keys.pressed(KeyCode::ArrowLeft) {
        direction.x -= 1.0;
    }
    if keys.pressed(KeyCode::ArrowRight) {
        direction.x += 1.0;
    }
    if keys.pressed(KeyCode::ArrowUp) {
        direction.y += 1.0;
    }
    if keys.pressed(KeyCode::ArrowDown) {
        direction.y -= 1.0;
    }

    // 200 pixels per second, whatever the frame rate is
    let step = direction * 200.0 * time.delta_secs();
    player.translation += step.extend(0.0);
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update, move_player)
        .run();
}
```

- `Camera2d` is the eye that looks at the 2D world. Without a camera, nothing is drawn.
- `Sprite` is a coloured rectangle or a picture, and `Transform` is its position, rotation and size. Both are components that Bevy provides, and its own systems draw every entity that has them.
- `Player` is a component without data, a **marker**. `With<Player>` picks the entity without reading anything from it.
- `Res<…>` asks for a **resource**: a value that exists once for the whole game, such as the clock (`Time`) or the state of the keyboard.
- `Single<…>` is a query that expects exactly one match.
- `time.delta_secs()` is the delta time. The speed is 200 pixels per second, however many frames the computer manages to draw.

The first build of a Bevy program compiles about 400 crates and takes many minutes. Later builds are much faster. On Linux, Bevy needs the development packages for sound and input devices (ALSA and udev). The setup page of the Bevy documentation lists them for each distribution.

| Crate | What it is |
|---|---|
| `macroquad` | a small library for 2D games: a loop and drawing functions |
| `ggez` | another small 2D library, in the style of the LÖVE framework |
| `bevy` | a complete engine built on ECS, for 2D and 3D |
| `fyrox` | a 3D engine that comes with a scene editor |
| `godot` | lets you write the scripts of the Godot engine in Rust |
| `wgpu` | talks to the graphics card. Most of the others build on it |
| `rapier2d`, `rapier3d` | physics: gravity, collisions, joints |

:::compare Game engines elsewhere
Unity (C#), Unreal (C++) and Godot (its own language, C# or C++) are complete studios with a visual editor, where levels are built with the mouse and scripts are attached to objects. In Bevy, the game is described in code. ECS is not a Rust invention. Large studios use it in C++ for its speed. But it suits Rust well, because data that lives in tables and is borrowed by systems never needs the webs of pointers between objects that the borrow checker dislikes.
:::

## Small devices

A **microcontroller** is a complete computer on one small chip: a processor, some memory, and pins that can switch things on and measure things. It sits in washing machines, keyboards, cars and toys, costs about as much as a cup of coffee, and has perhaps 64 kilobytes of memory where your laptop has billions of bytes. Programming such chips is called **embedded** programming.

There is no operating system on such a chip. Your program is the only program. It starts when the power comes on, and it must never end. Nothing protects it: no system stops a program that writes outside its memory. This is called running on **bare metal**, and it is where Rust's guarantees are worth the most. Rust also fits for a second reason. It has no garbage collector and no runtime, so a whole program can fit in a few kilobytes.

### `no_std`: Rust without an operating system

The standard library assumes an operating system: files, threads, a heap, a clock. On a chip none of this exists, so embedded programs start with the attribute `#![no_std]` and use a smaller library instead:

| Library | Needs | Contains |
|---|---|---|
| `core` | nothing | numbers, `Option`, `Result`, slices, `str`, iterators, closures, traits, formatting, atomics |
| `alloc` | a heap that you set up | `Box`, `Vec`, `String`, `Rc`, `Arc`, `BTreeMap` |
| `std` | an operating system | all of the above, and files, network, threads, `HashMap`, `println!` |

Nearly everything you learned about the *language* is in `core`. `std` re-exports it, which is why `std::option::Option` and `core::option::Option` are the same type.

### A program for a chip, run in an emulator

You do not need hardware for a first try. The program **QEMU** imitates whole computers, among them a board with an ARM Cortex-M3 chip. Install it from your package manager or from its web site. The part needed here is called `qemu-system-arm`. The compiler needs the target for this processor family, which has no operating system in its name:

```sh
rustup target add thumbv7m-none-eabi
```

The project has four small files besides `Cargo.toml`:

```toml file=Cargo.toml
[dependencies]
cortex-m = { version = "0.7.10", features = ["critical-section-single-core"] }
cortex-m-rt = "0.7.7"
cortex-m-semihosting = "0.6.0"
panic-semihosting = { version = "0.7.0", features = ["exit"] }
```

```toml file=.cargo/config.toml
[build]
target = "thumbv7m-none-eabi"

[target.thumbv7m-none-eabi]
# `cargo run` starts the program in the emulator QEMU
runner = "qemu-system-arm -cpu cortex-m3 -machine lm3s6965evb -nographic -semihosting-config enable=on,target=native -kernel"
rustflags = ["-C", "link-arg=-Tlink.x"]
```

```text file=memory.x
/* The memory of the LM3S6965 chip: where it starts and how much there is */
MEMORY
{
  FLASH : ORIGIN = 0x00000000, LENGTH = 256K
  RAM   : ORIGIN = 0x20000000, LENGTH = 64K
}
```

```rust file=build.rs
use std::path::PathBuf;
use std::{env, fs};

fn main() {
    // Put `memory.x` where the linker looks for it
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    fs::copy("memory.x", out.join("memory.x")).unwrap();
    println!("cargo::rustc-link-search={}", out.display());
    println!("cargo::rerun-if-changed=memory.x");
}
```

```rust file=src/main.rs
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use cortex_m_semihosting::{debug, hprintln};
use panic_semihosting as _; // on a panic: print the message, then stop

#[entry]
fn main() -> ! {
    hprintln!("Hello from a chip with 64 KB of memory!");

    let readings = [21u32, 23, 22, 28, 25];
    let total: u32 = readings.iter().sum();
    hprintln!(
        "average of {} readings: {}",
        readings.len(),
        total / readings.len() as u32
    );

    // An index that arrives from outside and is too large
    let index = core::hint::black_box(7);
    hprintln!("reading {}: {}", index, readings[index]);

    debug::exit(debug::EXIT_SUCCESS); // stops the emulator
    loop {}
}
```

```sh
cargo run
```
```output
Hello from a chip with 64 KB of memory!
average of 5 readings: 23
panicked at src/main.rs:18:40:
index out of bounds: the len is 5 but the index is 7
```

What is new:

- `#![no_main]` and `#[entry]`: there is no operating system that could call `main`. The crate `cortex-m-rt` contains the start-up code of the chip, and `#[entry]` tells it which function to jump to.
- `-> !`: the function never returns. There is nothing to return to.
- `memory.x` tells the linker where the chip keeps its program (`FLASH`, which survives without power) and its working memory (`RAM`). Every chip has its own numbers.
- `hprintln!` prints through a channel to the developer's computer, called semihosting. A chip has no screen. On real hardware the text travels through the debug cable.
- `use panic_semihosting as _;` selects a **panic handler**. Without an operating system, somebody has to say what a panic does, and a `no_std` program does not compile without one. This crate prints the message and stops. A product would rather restart the device.
- `.cargo/config.toml` sets the target for the project and makes `cargo run` start the emulator.

Now look at the last two lines of the output. The index 7 is outside the array, and the program *stopped with a clear message*, on a chip, without an operating system. The same mistake in C would read whatever happens to lie behind the array and carry on with a wrong number. All checks of Rust work on bare metal, because they are part of the compiled program and need no help from outside.

The release build of this program occupies 5,996 bytes of the chip's 256 kilobytes.

### The layers of embedded Rust

Nobody writes to the registers of a chip by hand for long. The crates form layers:

| Layer | What it gives you | Examples |
|---|---|---|
| **PAC**, "peripheral access crate" | every register of one chip by name, generated from the maker's description | `rp-pac`, `stm32-metapac` |
| **HAL**, "hardware abstraction layer" | safe types for the pins, timers and serial ports of one chip family | `embassy-rp`, `stm32f4xx-hal`, `esp-hal` |
| **`embedded-hal`** | traits that all HALs implement: `OutputPin`, `InputPin`, `I2c`, `SpiBus`, `DelayNs` | |
| **drivers** | code for a sensor, a display or a radio, written against the traits | hundreds on crates.io |

The third layer is the clever one. A driver that asks for "anything that implements `OutputPin`" works on every chip that has a HAL. The same idea also lets you test device logic at your desk. This controller for a fan knows nothing about any chip:

```rust ext run
use std::convert::Infallible;

use embedded_hal::digital::{ErrorType, OutputPin};

/// Switches a fan on when it gets too warm. Works with an output pin of any chip.
struct FanControl<P> {
    fan: P,
    limit: i32,
    running: bool,
}

impl<P: OutputPin> FanControl<P> {
    fn new(fan: P, limit: i32) -> Self {
        FanControl {
            fan,
            limit,
            running: false,
        }
    }

    /// Call this with every new temperature reading.
    fn update(&mut self, temperature: i32) -> Result<(), P::Error> {
        if !self.running && temperature > self.limit {
            self.fan.set_high()?;
            self.running = true;
        } else if self.running && temperature < self.limit - 2 {
            // Two degrees of distance, so that the fan does not flicker around the limit
            self.fan.set_low()?;
            self.running = false;
        }
        Ok(())
    }
}

/// A pin for tests. It only remembers what was done to it.
#[derive(Default)]
struct FakePin {
    history: Vec<bool>,
}

impl ErrorType for FakePin {
    type Error = Infallible;
}

impl OutputPin for FakePin {
    fn set_high(&mut self) -> Result<(), Self::Error> {
        self.history.push(true);
        Ok(())
    }

    fn set_low(&mut self) -> Result<(), Self::Error> {
        self.history.push(false);
        Ok(())
    }
}

fn main() {
    let mut control = FanControl::new(FakePin::default(), 30);

    for temperature in [25, 29, 31, 33, 30, 29, 27, 26, 31] {
        control.update(temperature).unwrap();
        println!(
            "{temperature} degrees: fan {}",
            if control.running { "on" } else { "off" }
        );
    }
    println!("the pin was switched: {:?}", control.fan.history);
}
```
```output
25 degrees: fan off
29 degrees: fan off
31 degrees: fan on
33 degrees: fan on
30 degrees: fan on
29 degrees: fan on
27 degrees: fan off
26 degrees: fan off
31 degrees: fan on
the pin was switched: [true, false, true]
```

On a device, `FanControl::new` would receive a real pin from the HAL. In the test it receives `FakePin`, and the logic can be checked in milliseconds, without a soldering iron. This is the dependency injection of [chapter 48](#project-api), with a pin in the role of the clock.

In a HAL, every pin is a *value*, and you can only get it once. Two parts of a program cannot drive the same pin by accident, because one of them does not own it. The type of a pin also records whether it is set up as an input or an output, so reading an output pin is a compile error. Ownership and the typestate pattern of [chapter 29](#type-system) turn wiring mistakes into compiler messages.

### Async on a chip: Embassy

A device often does several things at once: blink a light, watch a button, read a sensor every second. Without an operating system there are no threads. The classic answer is a hand-written state machine driven by interrupts. Rust has a better one. `async` functions *are* state machines that the compiler writes ([chapter 32](#async)), and they need no heap. **Embassy** is an async runtime for microcontrollers, with HALs for many chip families. This program for the Raspberry Pi Pico blinks two lights at different speeds:

```toml file=Cargo.toml
[dependencies]
cortex-m-rt = "0.7.7"
embassy-executor = { version = "0.10.0", features = ["platform-cortex-m", "executor-thread"] }
embassy-rp = { version = "0.10.0", features = ["rp2040", "time-driver", "critical-section-impl"] }
embassy-time = "0.5.1"
panic-halt = "1.0.0"
```

```rust file=src/main.rs
#![no_std]
#![no_main]

use embassy_executor::Spawner;
use embassy_rp::gpio::{Level, Output};
use embassy_time::Timer;
use panic_halt as _;

/// A task: blinks one light for ever, at its own pace.
#[embassy_executor::task(pool_size = 2)]
async fn blink(mut led: Output<'static>, millis: u64) {
    loop {
        led.toggle();
        Timer::after_millis(millis).await;
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let peripherals = embassy_rp::init(Default::default());

    // The light on the board, and a second one wired to pin 15
    let board_led = Output::new(peripherals.PIN_25, Level::Low);
    let extra_led = Output::new(peripherals.PIN_15, Level::Low);

    spawner.spawn(blink(board_led, 500).unwrap());
    spawner.spawn(blink(extra_led, 130).unwrap());
}
```

- `embassy_rp::init` returns all peripherals of the chip as one struct of values, each of which can be moved out once.
- Each `spawner.spawn(…)` starts a task. `pool_size = 2` reserves room for two tasks of this kind at compile time, because there is no heap to take it from.
- `Timer::after_millis(…).await` does not spin in a loop. The task sleeps, and when all tasks sleep, the processor itself sleeps and saves power until a timer wakes it.

Compiled for the Pico (target `thumbv6m-none-eabi`), the whole program, with the runtime, two tasks and the timer driver, occupies 13,224 bytes of flash memory and 516 bytes of RAM. It was not loaded onto a board for this guide. The usual tool for that step is `probe-rs`, which writes a program into the chip through a debug probe and shows its output.

### Collections and messages without a heap

Two crates replace things that are missing without `std`. **`heapless`** offers collections with a fixed capacity, which is part of their type. They live wherever the variable lives, and a full collection gives the value back instead of growing:

```rust ext run
use core::fmt::Write;

use heapless::{String, Vec};

fn main() {
    // Room for exactly 4 readings, inside the variable itself. No heap is involved
    let mut readings: Vec<u16, 4> = Vec::new();
    for value in [512, 530, 498, 505, 520] {
        if let Err(rejected) = readings.push(value) {
            println!("buffer full, {rejected} was not stored");
        }
    }
    println!("{readings:?} (capacity {})", readings.capacity());

    // A text of at most 16 bytes
    let mut line: String<16> = String::new();
    write!(line, "T={} H={}", 23, 61).unwrap();
    println!("{line} ({} of {} bytes used)", line.len(), line.capacity());

    let too_long = write!(line, " and a lot more text");
    println!("writing more: {too_long:?}");
}
```
```output
buffer full, 520 was not stored
[512, 530, 498, 505] (capacity 4)
T=23 H=61 (9 of 16 bytes used)
writing more: Err(Error)
```

**`postcard`** is a Serde format ([chapter 43](#serde)) for small devices. It works without a heap and produces very few bytes, which matters when a message travels over a slow radio link:

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Reading {
    sensor: u8,
    temperature: i16, // tenths of a degree
    humidity: u8,
    ok: bool,
}

fn main() {
    let reading = Reading {
        sensor: 3,
        temperature: -125,
        humidity: 61,
        ok: true,
    };

    // Serialise into a fixed buffer on the stack
    let mut buffer = [0u8; 16];
    let bytes = postcard::to_slice(&reading, &mut buffer).unwrap();
    println!("postcard: {:>2} bytes  {:02x?}", bytes.len(), bytes);

    let json = serde_json::to_string(&reading).unwrap();
    println!("JSON:     {:>2} bytes  {json}", json.len());

    let back: Reading = postcard::from_bytes(bytes).unwrap();
    assert_eq!(back, reading);
    println!("read back: {back:?}");
}
```
```output
postcard:  5 bytes  [03, f9, 01, 3d, 01]
JSON:     55 bytes  {"sensor":3,"temperature":-125,"humidity":61,"ok":true}
read back: Reading { sensor: 3, temperature: -125, humidity: 61, ok: true }
```

The five bytes contain no field names and no punctuation, only the values in the order of the struct. Both sides must therefore use the same struct definition, which is easy when both are written in Rust and share a crate.

:::compare Embedded programming elsewhere
C and C++ run on almost every chip ever made, and the makers' own tools are written for them. They give the same control as Rust and none of its checks. MicroPython and the Arduino environment are friendlier for a first blinking light, at the price of speed, memory, or safety. Rust is younger here, and not every chip has a good HAL yet. Where it has, you get the speed and size of C with ownership, `Result`, async and Cargo.
:::

## Data and machine learning

### Tables of numbers: ndarray

Science and statistics work with whole tables of numbers at once. The crate **`ndarray`** provides arrays with any number of dimensions and arithmetic on all their elements, in the style of NumPy from the Python world:

```rust ext run
use ndarray::{Axis, array, s};

fn main() {
    // Three students (rows) and four tests (columns)
    let scores = array![
        [72.0, 85.0, 90.0, 66.0],
        [88.0, 64.0, 71.0, 80.0],
        [91.0, 79.0, 95.0, 97.0],
    ];
    println!("shape: {:?}", scores.dim());

    // Arithmetic on the whole table, without a loop
    let fractions = &scores / 100.0;
    println!("first row as fractions: {}", fractions.row(0));

    // Along an axis: Axis(0) runs down the rows, Axis(1) across the columns
    let per_student = scores.mean_axis(Axis(1)).unwrap();
    let per_test = scores.mean_axis(Axis(0)).unwrap();
    println!("mean per student: {per_student:.1}");
    println!("mean per test:    {per_test:.1}");

    // A slice is a view into the same data: the last two tests of the first two students
    let part = scores.slice(s![0..2, 2..]);
    println!("part:\n{part}");

    // Matrix product: a weight for each test gives a final mark
    let weights = array![0.2, 0.2, 0.3, 0.3];
    let final_marks = scores.dot(&weights);
    println!("final marks: {final_marks:.1}");
}
```
```output
shape: (3, 4)
first row as fractions: [0.72, 0.85, 0.9, 0.66]
mean per student: [78.2, 75.8, 90.5]
mean per test:    [83.7, 76.0, 85.3, 81.0]
part:
[[90, 66],
 [71, 80]]
final marks: [78.2, 75.7, 91.6]
```

- An operator between an array and a number, or between two arrays of the same shape, works element by element.
- An **axis** is a direction through the array. "The mean along axis 1" walks across the columns and leaves one number per row.
- `s![0..2, 2..]` describes a slice with one range per dimension. Like a slice of a `Vec`, it is a view, and nothing is copied.
- `dot` is the matrix product. Here it multiplies every row with the weights and adds up.

For small vectors and matrices of fixed size, as games, robots and graphics need them, the crate `nalgebra` is the usual choice.

### Tables of records: Polars

Business data looks different: rows of records with named columns of mixed types. A table of this kind is called a **data frame**. **Polars** is a data frame library written in Rust. It is best known through its Python version, and it is used from Rust in the same way. The next program computes the first table of the sales report from [chapter 26](#project-report), from a file `sales.csv` with the valid rows of that chapter:

```toml file=Cargo.toml
[dependencies]
polars = { version = "0.55.2", default-features = false, features = ["lazy", "csv", "fmt"] }
```

```rust file=src/main.rs
use polars::prelude::*;

fn main() -> PolarsResult<()> {
    let report = LazyCsvReader::new("sales.csv".into())
        .with_has_header(true)
        .finish()?
        .with_column((col("quantity") * col("unit_price")).alias("revenue"))
        .group_by([col("category")])
        .agg([
            col("revenue").sum(),
            col("quantity").sum().alias("items"),
            len().alias("sales"),
        ])
        .sort(
            ["revenue"],
            SortMultipleOptions::default().with_order_descending(true),
        )
        .collect()?;

    println!("{report}");
    Ok(())
}
```
```output
shape: (3, 4)
┌─────────────┬─────────┬───────┬───────┐
│ category    ┆ revenue ┆ items ┆ sales │
│ ---         ┆ ---     ┆ ---   ┆ ---   │
│ str         ┆ f64     ┆ i64   ┆ u32   │
╞═════════════╪═════════╪═══════╪═══════╡
│ Electronics ┆ 350.2   ┆ 16    ┆ 4     │
│ Food        ┆ 198.5   ┆ 29    ┆ 5     │
│ Office      ┆ 161.98  ┆ 37    ┆ 3     │
└─────────────┴─────────┴───────┴───────┘
```

- The program first *describes* the work: read, add a column, group, summarise, sort. Nothing happens until `collect()`. Polars then plans the whole job, reads only the columns that are needed, and uses all processor cores. This is the laziness of iterators ([chapter 25](#iterators)) on a larger scale.
- `col("quantity") * col("unit_price")` is not a multiplication of two numbers. It builds a description of a calculation for whole columns.
- The types of the columns are found by looking at the file.

In chapter 26 this table took a struct, a parser and a `HashMap`. That was the right exercise. For real data work, a data frame library is the right tool: it handles millions of rows, missing values, joins between tables and many file formats. Be prepared for the cost: Polars is one of the largest crates there is, and its first build takes a long time.

### How a program learns

**Machine learning** means that a program finds the numbers of a formula by itself, from examples. The smallest example fits on one screen. Given a few pairs of "hours studied" and "mark", find the line `mark = slope × hours + offset` that fits them best:

```rust run
fn main() {
    // Hours of study, and the marks that followed
    let hours = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
    let marks = [56.0, 59.0, 66.0, 69.0, 76.0, 79.0, 86.0, 89.0];
    let count = hours.len() as f64;

    // The model: mark = slope * hours + offset. It starts with a bad guess
    let (mut slope, mut offset) = (0.0, 0.0);
    let learning_rate = 0.02;

    for step in 0..=1000 {
        // How wrong is the model, and which way should each number move?
        let (mut loss, mut slope_gradient, mut offset_gradient) = (0.0, 0.0, 0.0);
        for (&x, &y) in hours.iter().zip(&marks) {
            let error = slope * x + offset - y;
            loss += error * error / count;
            slope_gradient += 2.0 * error * x / count;
            offset_gradient += 2.0 * error / count;
        }

        if [0, 1, 10, 100, 1000].contains(&step) {
            println!("step {step:>4}: mark = {slope:>5.2} * hours + {offset:>5.2}   loss {loss:>8.2}");
        }

        // Move both numbers a small step against the gradient
        slope -= learning_rate * slope_gradient;
        offset -= learning_rate * offset_gradient;
    }

    println!("prediction for 10 hours: {:.1}", slope * 10.0 + offset);
}
```
```output auto
```

The loop is the heart of nearly all machine learning:

- The **model** is a formula with adjustable numbers, the **parameters**. Here there are two. A large language model has billions.
- The **loss** is one number that says how wrong the model is on the examples: here the average squared error.
- The **gradient** says, for each parameter, how the loss changes when that parameter grows a little. The formulas for it come from calculus.
- Each step moves every parameter a little in the direction that lowers the loss. The size of the step is the **learning rate**. This procedure is called **gradient descent**.

Run it and watch the loss fall. After a thousand steps the program has found a slope near 5 and an offset near 50, although nobody told it these numbers.

A machine learning library does the same with more comfort. It stores the numbers in arrays with many dimensions, called **tensors**, computes the gradients automatically for any formula, and runs the arithmetic on a graphics card.

| Crate | What it is for |
|---|---|
| `ndarray`, `nalgebra` | arrays and linear algebra |
| `polars` | data frames |
| `arrow`, `parquet` | the standard formats for tables in memory and on disk |
| `datafusion` | an engine that runs SQL queries over such tables |
| `linfa` | classic methods: regression, clustering, decision trees |
| `burn` | a deep learning framework written in Rust, with training, for processors, graphics cards and the browser |
| `candle` | a small framework for running neural networks, from the company Hugging Face |
| `ort`, `tch` | bindings to the ONNX Runtime and to the engine of PyTorch |
| `tokenizers` | splits text into the pieces that language models read |

Choosing between them, in three lines each:

- **`candle`** — a small, readable framework from Hugging Face for *running* models, with Metal and CUDA backends. Choose it to serve an inference endpoint or run a model on a device; the weights of most published models load directly.
- **`burn`** — a full framework with training, a backend abstraction (CPU, GPU, browser through WebAssembly) and its own tensor library. Choose it when you are training as well as running, and want one codebase for several targets.
- **`tch` and `ort`** — bindings to LibTorch (PyTorch's engine) and the ONNX Runtime. Choose them when you must run an existing model exactly as its authors trained it, and accept shipping a large native library alongside your binary.
- **`linfa`** — the classic algorithms: regression, clustering, decision trees, with an API modelled on scikit-learn. Choose it for tabular prediction where a small, explainable model beats a neural network — which is most of the time.
- **`polars`, `datafusion`, `duckdb`** — three ways to the same goal: query tables without loading them into a database. Polars is the data-frame library, DataFusion is an engine you embed in a program, DuckDB is a SQL database that reads Parquet and CSV files directly.
- **`arrow` and `parquet`** — Arrow is the in-memory column format that Polars, DataFusion, pandas and Spark all speak; Parquet is its compressed form on disk. Together they are why a Rust data pipeline can hand its output to a Python notebook without a conversion step.

:::compare Rust and Python in data science
Python is the language in which data scientists think and try things out, and that will not change soon. But much of what makes Python fast today is Rust underneath: Polars, the `tokenizers` library, the validation core of Pydantic, the tools `ruff` and `uv`. They are Python modules built with PyO3, like the one in [chapter 36](#ffi) that was 27 times faster than its Python version. Reach for Rust when a data job must run fast and reliably day after day, when a trained model has to answer requests with little memory, when it has to run in a browser or on a device, or when a Python library needs a fast core.
:::

:::recap
- A game repeats input, update and draw for every frame. Speeds are multiplied by the delta time, so that the game runs equally fast on every machine.
- macroquad offers a loop and drawing functions. Bevy organises a game as entities, components and systems, and runs systems in parallel when their data allows it.
- A microcontroller has no operating system. `#![no_std]` programs use `core`, choose a panic handler, and describe the memory of the chip to the linker.
- Rust's checks work on bare metal: an index out of bounds stops the program instead of reading foreign memory.
- PAC, HAL, the `embedded-hal` traits and drivers are the layers of embedded Rust. Logic written against the traits is tested on a normal computer with fake pins.
- Embassy runs async tasks on a chip, without threads and without a heap. `heapless` and `postcard` provide collections and messages of fixed, small size.
- `ndarray` calculates with whole arrays, and Polars with tables of records, lazily and on all cores.
- Machine learning adjusts the parameters of a model step by step to lower a loss. Gradient descent is the basic procedure.
:::

:::quiz Check your understanding
? A game moves a ball with `ball.x += 5.0;` once per frame. What is wrong with that?
- Nothing, as long as the window has a fixed size
- The ball leaves the screen
+ The ball moves faster on a machine that draws more frames per second
- Floating-point numbers cannot be added in a loop
= The distance should depend on the time that has passed, not on the number of frames: `ball.x += speed * delta_time`.

? In the Bevy example, why does the system `movement` never touch the tree?
- The tree was spawned after the other entities
- Systems run only for the first two entities
+ The query asks for a `Position` and a `Velocity`, and the tree has no `Velocity`
- The tree is marked as immovable
= A query matches the entities that have all the requested components. What an entity "is" follows from the components it carries.

? Which of these is available in a `#![no_std]` program without any further setup?
- `Vec<T>`
- `std::fs::File`
+ `Option<T>`, iterators and slices
- `println!`
= They are part of `core`, which needs nothing from the outside. `Vec` needs a heap (`alloc`), and files and `println!` need an operating system (`std`).

? What is the point of the traits in `embedded-hal`?
- They make programs for chips smaller
+ A driver or a piece of logic written against them works with every chip's HAL, and with a fake in tests
- They replace the standard library
- They are required by the Rust compiler for `no_std`
= `FanControl<P: OutputPin>` runs on any chip, and on your desk with `FakePin`. This is ordinary generic programming with traits.

? In the line-fitting program, what does one step of gradient descent do?
- It tries random values for the slope and keeps the best
- It adds one more example to the data
+ It changes each parameter a little in the direction that reduces the loss
- It sorts the examples by their error
= The gradient tells for each parameter which way the loss falls. Many small steps in that direction lead to parameters that fit the data.
:::

:::exercise guided Gravity for some
Take the Bevy example with labels, positions and velocities. Add a marker component `Falling`. A new system `gravity` reduces the vertical velocity of every falling entity by 10 per frame. Another system removes entities that have dropped below the height 0, and says so. Create a falling stone and a rising balloon, both at height 100, and run five frames.
::hint
`Query<&mut Velocity, With<Falling>>` selects by the marker without reading it. To remove an entity, a query can ask for its identity with the special type `Entity`, and `commands.entity(entity).despawn()` deletes it. Chain the four systems in an order that makes sense: gravity, movement, removal, report.
::solution
```rust file=src/bin/gravity.rs
use bevy::prelude::*;

#[derive(Component)]
struct Label(String);

#[derive(Component)]
struct Position {
    x: f32,
    y: f32,
}

#[derive(Component)]
struct Velocity {
    x: f32,
    y: f32,
}

/// A marker without data: gravity pulls on entities that have it.
#[derive(Component)]
struct Falling;

fn setup(mut commands: Commands) {
    commands.spawn((
        Label("stone".into()),
        Position { x: 0.0, y: 100.0 },
        Velocity { x: 2.0, y: 0.0 },
        Falling,
    ));
    commands.spawn((
        Label("balloon".into()),
        Position { x: 5.0, y: 100.0 },
        Velocity { x: 0.0, y: 1.0 },
    ));
}

/// Changes the velocity, but only of falling entities.
fn gravity(mut query: Query<&mut Velocity, With<Falling>>) {
    for mut velocity in &mut query {
        velocity.y -= 10.0;
    }
}

fn movement(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut position, velocity) in &mut query {
        position.x += velocity.x;
        position.y += velocity.y;
    }
}

/// Removes what has fallen below the ground.
fn remove_fallen(mut commands: Commands, query: Query<(Entity, &Label, &Position)>) {
    for (entity, label, position) in &query {
        if position.y < 0.0 {
            println!("{} hit the ground", label.0);
            commands.entity(entity).despawn();
        }
    }
}

fn report(query: Query<(&Label, &Position)>) {
    for (label, position) in &query {
        println!(
            "{:<8} at ({:>4.1}, {:>5.1})",
            label.0, position.x, position.y
        );
    }
    println!("--");
}

fn main() {
    let mut app = App::new();
    app.add_systems(Startup, setup)
        .add_systems(Update, (gravity, movement, remove_fallen, report).chain());

    for _ in 0..5 {
        app.update();
    }
}
```
```output
balloon  at ( 5.0, 101.0)
stone    at ( 2.0,  90.0)
--
balloon  at ( 5.0, 102.0)
stone    at ( 4.0,  70.0)
--
balloon  at ( 5.0, 103.0)
stone    at ( 6.0,  40.0)
--
balloon  at ( 5.0, 104.0)
stone    at ( 8.0,   0.0)
--
stone hit the ground
balloon  at ( 5.0, 105.0)
--
```

`gravity` changes only velocities, and `movement` is the unchanged system of the chapter: it moves the stone faster each frame without knowing why. The balloon has no `Falling` marker and keeps rising. Commands such as `despawn` are collected and carried out between systems, so the stone is already gone when `report` runs in the same frame.
:::

:::exercise practice A long press
Write a type `LongPress<P>` for a push button on any chip. Its method `check` is meant to be called at a regular pace. It returns `true` once when the button has been held down for a given number of checks in a row. A pressed button connects its pin to ground, so "pressed" means that the pin is low. Test the type on your machine with a fake pin that plays back a list of states.
::hint
The trait for reading is `embedded_hal::digital::InputPin`, with the methods `is_high` and `is_low`. Both take `&mut self` and return a `Result`. Count consecutive low readings, and reset the count on a high one. Returning `true` only when the count *equals* the limit reports each long press once.
::solution
```rust ext run
use std::convert::Infallible;

use embedded_hal::digital::{ErrorType, InputPin};

/// Reports a long press: the button was held down for `needed` checks in a row.
struct LongPress<P> {
    button: P,
    needed: u32,
    held: u32,
}

impl<P: InputPin> LongPress<P> {
    fn new(button: P, needed: u32) -> Self {
        LongPress {
            button,
            needed,
            held: 0,
        }
    }

    /// Call this at a regular pace. Returns `true` once for every long press.
    fn check(&mut self) -> Result<bool, P::Error> {
        if self.button.is_low()? {
            self.held += 1;
            Ok(self.held == self.needed)
        } else {
            self.held = 0;
            Ok(false)
        }
    }
}

/// A fake button that plays back a prepared list of states. `true` means pressed.
struct FakeButton {
    states: std::vec::IntoIter<bool>,
}

impl ErrorType for FakeButton {
    type Error = Infallible;
}

impl InputPin for FakeButton {
    fn is_high(&mut self) -> Result<bool, Self::Error> {
        self.is_low().map(|low| !low)
    }

    fn is_low(&mut self) -> Result<bool, Self::Error> {
        // A pressed button connects the pin to ground: low
        Ok(self.states.next().unwrap_or(false))
    }
}

fn main() {
    let pressed = [true, true, false, true, true, true, true, true, false, true];
    let button = FakeButton {
        states: pressed.to_vec().into_iter(),
    };
    let mut long_press = LongPress::new(button, 3);

    for (tick, _) in pressed.iter().enumerate() {
        if long_press.check().unwrap() {
            println!("long press at check {tick}");
        }
    }
}
```
```output
long press at check 5
```

The button is released at check 2, so the first two readings do not count. Checks 3, 4 and 5 are low, and the third of them reports the long press. Checks 6 and 7 are still low, but the count has passed 3 and nothing more is reported. The same `LongPress` compiles for a real chip, where a timer would call `check` every few milliseconds.
:::

:::exercise challenge Standard scores
Take the table of test scores from the ndarray example. Write a function that scales every column so that its mean is 0 and its standard deviation is 1. This makes tests of different difficulty comparable. Write a second function that returns, for every test, the row number of the best student.
::hint
`table.mean_axis(Axis(0))` and `table.std_axis(Axis(0), 0.0)` give one number per column. When you subtract a one-dimensional array from a two-dimensional one, ndarray applies it to every row, which is called **broadcasting**. `table.columns()` iterates over the columns.
::solution
```rust ext run
use ndarray::{Array1, Array2, Axis, array};

/// Scales every column to mean 0 and standard deviation 1.
fn standardise(table: &Array2<f64>) -> Array2<f64> {
    let mean = table.mean_axis(Axis(0)).unwrap();
    let deviation = table.std_axis(Axis(0), 0.0);
    (table - &mean) / &deviation
}

/// The row with the largest value, for every column.
fn best_row_per_column(table: &Array2<f64>) -> Array1<usize> {
    table
        .columns()
        .into_iter()
        .map(|column| {
            let mut best = 0;
            for (row, &value) in column.iter().enumerate() {
                if value > column[best] {
                    best = row;
                }
            }
            best
        })
        .collect()
}

fn main() {
    let scores = array![
        [72.0, 85.0, 90.0, 66.0],
        [88.0, 64.0, 71.0, 80.0],
        [91.0, 79.0, 95.0, 97.0],
    ];

    let standard = standardise(&scores);
    println!("{standard:.2}");
    let means = standard.mean_axis(Axis(0)).unwrap();
    assert!(means.iter().all(|mean| mean.abs() < 1e-9));
    println!("every column now has the mean 0");
    println!("best student per test: {}", best_row_per_column(&scores));
}
```
```output
[[-1.40, 1.02, 0.45, -1.18],
 [0.52, -1.36, -1.39, -0.08],
 [0.88, 0.34, 0.93, 1.26]]
every column now has the mean 0
best student per test: [2, 0, 2, 2]
```

`(table - &mean) / &deviation` contains no loop. The row of four means is subtracted from each of the three rows, and the result is divided in the same way. In the output, a positive number is a result above the average of that test. The first student's 85 in the second test is one standard deviation above its mean, a stronger result than the 90 in the third test, where everybody did well.
:::
