@id game-development
@part def
@title Game Development
@short Game development
@level intermediate
@time 90
@learn Build a Bevy game with components, systems, resources, plugins and states | Choose between Bevy, Fyrox, ggez, macroquad and miniquad | Understand ECS architecture, 2D/3D rendering and shader pipelines | Integrate physics, collision detection, audio, input and assets | Design netcode, procedural generation, UI and performance budgets

Rust's game ecosystem is young but usable. Bevy is the flagship ECS engine;
Fyrox offers a more traditional scene editor; macroquad, ggez and miniquad are
lightweight frameworks for 2D; wgpu, vulkano and ash expose the GPU directly.
This chapter is a tour of the architecture and the practical pieces you need to
ship a small game. The library's [games and embedded
survey](#games-embedded) is a shorter introduction; chapter D3 covers the systems
foundations, and chapter D12 covers Wasm builds for the browser.

:::analogy A theatre company, not a script
A traditional game engine is a script: objects update in the order you wrote.
An ECS is a theatre company: actors (entities) are identified by badges,
costumes (components) describe what they are, and directors (systems) call
whoever has the right costume onto the stage. The directors can run in parallel
because they follow the badges, not a fixed script. That is why an ECS scales to
thousands of entities and many CPU cores.
:::

:::compare ECS and the object-oriented scene graph
An ECS stores components in dense arrays and iterates systems over queries: cache-friendly, parallel and composable, but less intuitive for strict hierarchies and per-object encapsulation. A classic scene graph with inheritance and virtual updates is familiar and direct, but pointer-chasing and per-object dispatch cost performance at scale. Bevy and Fyrox represent the two ends; hybrid designs exist.
:::


## 11.1 Bevy: ECS, systems, components, resources, plugins and schedules

Bevy is an ECS-first engine with a plugin architecture. An **entity** is an id;
a **component** is plain data attached to an entity; a **system** is a function
that queries components and runs in a **schedule**; a **resource** is global
singleton data; a **plugin** groups systems and resources into a reusable unit.

```rust
use bevy::prelude::*;

#[derive(Component)]
struct Player {
    speed: f32,
}

#[derive(Component)]
struct Health(i32);

#[derive(Resource)]
struct Score(u32);

fn spawn_player(mut commands: Commands) {
    commands.spawn((
        Player { speed: 200.0 },
        Health(100),
        Transform::from_xyz(0.0, 0.0, 0.0),
        Sprite::from_color(Color::srgb(0.2, 0.8, 0.4), Vec2::new(32.0, 32.0)),
    ));
}

fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut query: Query<(&Player, &mut Transform)>,
) {
    for (player, mut transform) in &mut query {
        let mut direction = Vec3::ZERO;
        if keyboard.pressed(KeyCode::KeyW) { direction.y += 1.0; }
        if keyboard.pressed(KeyCode::KeyS) { direction.y -= 1.0; }
        if keyboard.pressed(KeyCode::KeyA) { direction.x -= 1.0; }
        if keyboard.pressed(KeyCode::KeyD) { direction.x += 1.0; }
        transform.translation += direction.normalize_or_zero() * player.speed * time.delta_secs();
    }
}

fn damage(mut query: Query<&mut Health>, mut score: ResMut<Score>) {
    for mut health in &mut query {
        health.0 -= 1;
        score.0 += 1;
    }
}

struct GamePlugin;

impl Plugin for GamePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Score>()
            .add_systems(Startup, spawn_player)
            .add_systems(Update, (move_player, damage));
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(GamePlugin)
        .run();
}
```

`Commands` defers structural changes (spawn, despawn, insert) to a sync point.
`Query<(&Player, &mut Transform)>` gives parallel-safe access: Bevy's scheduler
runs systems in parallel when their component access does not conflict.
`Res`/`ResMut` are global resources. `Time::delta_secs` makes movement
frame-rate independent. Plugins keep a game modular: `AudioPlugin`,
`PhysicsPlugin`, `UiPlugin`, each owning its systems and resources.

Schedules: `Startup`, `PreUpdate`, `Update`, `PostUpdate`, `Last`, plus
`FixedUpdate` for deterministic physics. `States` and `SubStates` gate systems
with run conditions:

```rust
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Menu,
    Playing,
    Paused,
}

// app.init_state::<GameState>()
//    .add_systems(Update, pause.run_if(in_state(GameState::Playing)));
```

## 11.2 Fyrox: 3D scenes, UI and animations

Fyrox is a full engine with a scene editor, 3D and 2D rendering, physics
(`rapier`), animation, sound and a UI system. It uses `Rc<RefCell<...>>`-style
scene handles rather than an ECS, which is closer to Unity/Godot.

```rust
use fyrox::{
    core::{pool::Handle, visitor::prelude::*},
    engine::Engine,
    event_loop::EventLoop,
    plugin::{Plugin, PluginConstructor, PluginContext},
    scene::{Scene, SceneLoader},
};

struct Game;

impl Plugin for Game {
    fn update(&mut self, context: &mut PluginContext<'_>) {
        // Read input, mutate scene nodes through handles, step the game.
        let _ = context.dt;
    }
}

struct GameConstructor;

impl PluginConstructor for GameConstructor {
    fn create_instance(&self, _scene_path: Option<&str>, _context: PluginContext<'_>) -> Box<dyn Plugin> {
        Box::new(Game)
    }
}

fn main() {
    let event_loop = EventLoop::new().unwrap();
    let mut engine = Engine::new();
    let mut scene = Scene::new();
    let _handle: Handle<Scene> = scene.graph.add(Scene::new());
    engine.add_plugin(GameConstructor);
    let _ = (engine, scene, SceneLoader::new(Default::default(), Default::default()));
    event_loop.run_app(&mut engine).unwrap();
}
```

Fyrox's editor is its differentiator: scenes, prefabs and materials are edited
visually and saved as RON. Choose Fyrox for a 3D game with a small team that
wants an editor and a Unity-like scene model; choose Bevy for ECS composition and
a code-first workflow.

## 11.3 Lightweight frameworks: ggez, macroquad and miniquad

- **macroquad** is a batteries-included 2D framework with immediate-mode
  drawing and async/await frame loops. It targets desktop, WebAssembly, Android
  and iOS.
- **ggez** wraps `wgpu` (recent versions) with a Love2D-style API: graphics,
  audio, input and filesystem.
- **miniquad** is the minimal windowing/GPU layer that macroquad builds on; use
  it for custom rendering with very little abstraction.

```rust
use macroquad::prelude::*;

#[macroquad::main("Demo")]
async fn main() {
    let mut position = vec2(screen_width() / 2.0, screen_height() / 2.0);
    loop {
        clear_background(BLACK);
        if is_key_down(KeyCode::Right) { position.x += 4.0; }
        if is_key_down(KeyCode::Left) { position.x -= 4.0; }
        draw_circle(position.x, position.y, 20.0, YELLOW);
        draw_text("arrow keys to move", 20.0, 30.0, 24.0, WHITE);
        next_frame().await;
    }
}
```

Macroquad is the fastest route to a game jam prototype. Its immediate-mode
drawing is easy, but you manage your own entity list and update loop. ggez offers
a more structured game loop and a `Drawable` trait. miniquad is for when you want
control over the render pipeline without a full engine.

## 11.4 ECS architecture deep dive

An ECS stores components in **archetypes** keyed by the set of component types
an entity has. A query iterates matching archetypes, which gives cache-friendly
contiguous arrays and fast joins. Structural changes (adding/removing
components) move an entity between archetypes, so they are batched at sync
points.

```text
Entity 7: {Position, Velocity, Sprite}
Entity 8: {Position, Velocity}
Entity 9: {Position, Health}

Query<(&Position, &Velocity)> -> archetypes {Pos,Vel,Sprite} and {Pos,Vel}
```

Advantages: composition without inheritance, parallel systems, cache locality,
and queries that cost time proportional to matching entities. Costs: indirect
data access, archetype churn when components change often, and a learning curve.
Systems should do one job and declare their access precisely; a system that
takes `&mut World` blocks parallelism. Events, commands and change detection
(`Changed<T>`, `Added<T>`) keep updates efficient.

## 11.5 2D rendering, sprite sheets and tile maps

A 2D renderer batches sprites into one draw call per texture/atlas. Sprite
sheets pack frames into a texture; a tile map indexes a tileset. In Bevy, use
`TextureAtlasLayout`, `Sprite`, `Camera2d` and a tilemap crate such as
`bevy_ecs_tilemap`.

```rust
use bevy::prelude::*;

#[derive(Component)]
struct Animation {
    first: usize,
    last: usize,
    timer: Timer,
}

fn animate(
    time: Res<Time>,
    mut query: Query<(&mut Animation, &mut Sprite)>,
    atlas: Res<TextureAtlasLayout>,
) {
    for (mut animation, mut sprite) in &mut query {
        if animation.timer.tick(time.delta()).just_finished() {
            let index = animation
                .first
                .max(sprite.texture_atlas.as_ref().map(|a| a.index).unwrap_or(0) + 1);
            let index = if index > animation.last { animation.first } else { index };
            // sprite.texture_atlas = Some(TextureAtlas { layout: layout_handle, index });
            let _ = (index, &atlas);
        }
    }
}

fn main() {
    let _ = animate;
}
```

Keep sprite dimensions power-of-two where possible, use texture atlases to
avoid state changes, and set filtering (`Nearest` for pixel art). Y-sorting
determines draw order for overlapping sprites; a camera with a fixed resolution
plus a scaling policy handles different screens. A tilemap with chunks and
culling avoids drawing the whole world.

## 11.6 3D rendering with wgpu, vulkano and ash

`wgpu` is the portable choice (Vulkan, Metal, DX12, WebGPU). `vulkano` is a
safe-ish Vulkan wrapper; `ash` is raw Vulkan. A 3D frame is: update uniforms,
cull, sort, draw meshes with a pipeline, then post-process.

```rust
// wgpu pipeline shape: shader modules, bind group layouts, pipeline layout,
// vertex buffers, depth stencil, render pass.
use wgpu::util::DeviceExt;

async fn create_buffer(device: &wgpu::Device, vertices: &[[f32; 3]]) -> wgpu::Buffer {
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vertices"),
        contents: bytemuck::cast_slice(vertices),
        usage: wgpu::BufferUsages::VERTEX,
    })
}

fn main() {
    let _ = create_buffer;
}
```

The hard parts are not the first triangle; they are the render graph, shadow
maps, instancing, material systems, and GPU/CPU synchronisation. Use `bevy`'s
renderer or `rend3` for a higher-level path, and write raw `wgpu` when you need
a custom pipeline. Measure with a GPU profiler (RenderDoc, Nsight, Xcode GPU
Capture), not by guessing.

## 11.7 Shader programming: WGSL, GLSL, SPIR-V and naga

`naga` translates shader languages (WGSL, GLSL, SPIR-V) and validates them;
`wgpu` consumes WGSL and SPIR-V. A shader is a program per vertex or fragment
(or compute workgroup).

```wgsl
struct Camera {
    view_proj: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> camera: Camera;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(input.position, 1.0);
    out.uv = input.uv;
    return out;
}

@group(1) @binding(0)
var texture: texture_2d<f32>;
@group(1) @binding(1)
var sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(texture, sampler, input.uv);
}
```

Shaders run in parallel and have no access to Rust data except through
uniforms, storage buffers and textures. Bind group layouts must match the
shader's declarations. Hot reloading shaders in development saves minutes per
iteration (`notify` plus `wgpu` recreation). SPIR-V is the portable binary
intermediate; WGSL is WebGPU's source language and is validated by naga.

## 11.8 Physics engines: Rapier and Avian

`rapier2d`/`rapier3d` are mature physics engines (rigid bodies, colliders,
joints, character controllers, queries). `avian` is an ECS-native physics
plugin for Bevy. Use a physics engine for dynamics; write your own only for a
specific mechanic.

```rust
use rapier3d::prelude::*;

fn simulate() {
    let mut bodies = RigidBodySet::new();
    let mut colliders = ColliderSet::new();
    let mut gravity = vector![0.0, -9.81, 0.0];

    let body = bodies.insert(RigidBodyBuilder::dynamic().translation(vector![0.0, 5.0, 0.0]));
    colliders.insert_with_parent(ColliderBuilder::ball(0.5).restitution(0.7), body, &mut bodies);

    let floor = bodies.insert(RigidBodyBuilder::fixed());
    colliders.insert_with_parent(ColliderBuilder::cuboid(10.0, 0.1, 10.0), floor, &mut bodies);

    let mut pipeline = PhysicsPipeline::new();
    let mut integration = IntegrationParameters::default();
    let mut islands = IslandManager::new();
    let mut broad_phase = BroadPhase::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut impulse_joints = ImpulseJointSet::new();
    let mut multibody_joints = MultibodyJointSet::new();
    let mut ccd = CCDSolver::new();

    pipeline.step(
        &gravity,
        &integration,
        &mut islands,
        &mut broad_phase,
        &mut narrow_phase,
        &mut bodies,
        &mut colliders,
        &mut impulse_joints,
        &mut multibody_joints,
        &mut ccd,
        &(),
        &(),
    );
    let _ = &mut gravity;
}

fn main() {
    simulate();
}
```

Fixed timesteps matter: physics is deterministic only at a fixed `dt`, so
accumulate real time and step a fixed number of times. Interpolate rendering
between steps for smoothness. Use collision groups and sensors to avoid
unnecessary contact generation, and never move a body by writing its transform
directly unless it is kinematic.

## 11.9 Collision detection: AABB, SAT, broad phase and narrow phase

Collision detection is two phases: a cheap **broad phase** rejects pairs
(AABB trees, spatial hashing, sweep-and-prune), and an exact **narrow phase**
tests the remaining pairs (SAT for convex polygons, GJK/EPA, sphere/capsule
tests).

```rust
#[derive(Debug, Clone, Copy)]
struct Aabb {
    min: [f32; 2],
    max: [f32; 2],
}

impl Aabb {
    fn intersects(&self, other: &Aabb) -> bool {
        self.min[0] <= other.max[0]
            && self.max[0] >= other.min[0]
            && self.min[1] <= other.max[1]
            && self.max[1] >= other.min[1]
    }

    fn contains_point(&self, point: [f32; 2]) -> bool {
        point[0] >= self.min[0] && point[0] <= self.max[0]
            && point[1] >= self.min[1] && point[1] <= self.max[1]
    }
}

fn main() {
    let a = Aabb { min: [0.0, 0.0], max: [2.0, 2.0] };
    let b = Aabb { min: [1.0, 1.0], max: [3.0, 3.0] };
    println!("{} {}", a.intersects(&b), a.contains_point([1.0, 1.0]));
}
```

The **separating axis theorem** says two convex shapes do not overlap if there
is an axis on which their projections are disjoint; for polygons, test the edge
normals of both. AABB is fast and conservative; use it for broad-phase and
simple games, and a full engine when rotation and complex shapes matter.

## 11.10 Audio: rodio, kira and cpal

`rodio` is a high-level playback library (sources, sinks, decoders). `kira` is
designed for games: mixing, effects, tweening, spatial audio and precise
scheduling. `cpal` is the low-level audio I/O layer.

```rust
use kira::manager::{AudioManager, AudioManagerSettings, backend::DefaultBackend};
use kira::sound::static_sound::{StaticSoundData, StaticSoundSettings};

fn play(path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = AudioManager::<DefaultBackend>::new(AudioManagerSettings::default())?;
    let sound = StaticSoundData::from_file(path)?.with_settings(StaticSoundSettings::new().volume(-6.0));
    manager.play(sound)?;
    Ok(())
}

fn main() {
    let _ = play;
}
```

```rust
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;

fn play_rodio(path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (_stream, handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&handle)?;
    let file = File::open(path)?;
    sink.append(Decoder::new(file)?);
    sink.sleep_until_end();
    Ok(())
}

fn main() {
    let _ = play_rodio;
}
```

Keep audio on its own thread or use the library's mixer; decoding a large file
on the game thread causes hitches. Preload short effects, stream music, and
crossfade between tracks. `kira` supports spatial audio and parameter tweening,
which is what a game needs; `rodio` is fine for simple tools.

## 11.11 Input handling

Use an input abstraction that maps physical keys to actions, so rebinding and
gamepads work. `gilrs` handles gamepads across platforms; Bevy has `ButtonInput`
and gamepad resources; macroquad has `is_key_down`.

```rust
use gilrs::{Button, Event, Gilrs};

fn poll() -> Result<(), Box<dyn std::error::Error>> {
    let mut gilrs = Gilrs::new()?;
    while let Some(Event { id, event, time, .. }) = gilrs.next_event() {
        match event {
            gilrs::EventType::ButtonPressed(Button::South, _) => {
                println!("gamepad {:?} pressed south at {:?}", id, time);
            }
            gilrs::EventType::AxisChanged(gilrs::Axis::LeftStickX, value, _) => {
                println!("left stick x = {value}");
            }
            _ => {}
        }
    }
    Ok(())
}

fn main() {
    let _ = poll;
}
```

Rules: poll once per frame, keep edge-triggered and held states separate, apply
dead zones to analogue sticks, and normalise diagonal movement. Handle focus
loss (release all keys), rebind at the action layer, and show the glyphs of the
active controller. Never hard-code WASD into game logic; bind it in settings.

## 11.12 Asset loading and management

Assets are large, asynchronous and versioned. Load them in the background, cache
by handle, and free what is no longer referenced. Bevy's `AssetServer` returns
handles and tracks dependencies; `assets_manager` is a standalone alternative.

```rust
use bevy::prelude::*;

#[derive(Asset, TypePath)]
struct Level {
    name: String,
    tiles: Vec<u32>,
}

#[derive(Resource)]
struct LevelHandle(Handle<Level>);

fn load_level(mut commands: Commands, server: Res<AssetServer>) {
    let handle: Handle<Level> = server.load("levels/one.level");
    commands.insert_resource(LevelHandle(handle));
}

fn use_level(handle: Res<LevelHandle>, levels: Res<Assets<Level>>) {
    if let Some(level) = levels.get(&handle.0) {
        println!("{} tiles", level.tiles.len());
    } else {
        // Still loading: show a progress state.
    }
}

fn main() {
    let _ = (load_level, use_level);
}
```

Use asset metadata (`.meta`) to configure import settings; compress textures,
stream music, and pack small files into atlases or archives. Hot reloading is a
development feature, not a shipping one: guard it behind a debug flag. A failed
load should show an error screen, not panic.

## 11.13 Scene graphs and transforms

A scene graph is a tree of transforms: a child's world transform is its local
transform composed with its parent's. Bevy encodes this with `Parent`/`Children`
and `Transform`/`GlobalTransform`; the transform propagation system runs before
rendering.

```rust
use bevy::prelude::*;

fn spawn_solar_system(mut commands: Commands) {
    let sun = commands.spawn(Transform::from_xyz(0.0, 0.0, 0.0)).id();
    let earth = commands
        .spawn((Transform::from_xyz(100.0, 0.0, 0.0),))
        .insert(ChildOf(sun))
        .id();
    commands.spawn((Transform::from_xyz(10.0, 0.0, 0.0),)).insert(ChildOf(earth));
}

fn rotate(mut query: Query<&mut Transform, With<Children>>, time: Res<Time>) {
    for mut transform in &mut query {
        transform.rotate_y(0.5 * time.delta_secs());
    }
}

fn main() {
    let _ = (spawn_solar_system, rotate);
}
```

Keep local transforms authoritative and let the engine compute world
transforms. Avoid deep hierarchies for physics bodies; a long chain of parents
adds matrix multiplications and coupling. Use `GlobalTransform` only for
rendering and spatial queries.

## 11.14 Animation systems: skeletal, sprite and tweening

- **Sprite animation**: cycle texture-atlas indices on a timer (section 11.5).
- **Skeletal animation**: skinned meshes with joint matrices; load glTF
  animations and blend between clips.
- **Tweening**: interpolate a value over time with easing; `bevy_tweening` and
  `kira`'s tweens provide the pattern.

```rust
#[derive(Clone, Copy, Debug)]
struct Tween {
    from: f32,
    to: f32,
    duration: f32,
    elapsed: f32,
}

impl Tween {
    fn update(&mut self, dt: f32) -> f32 {
        self.elapsed = (self.elapsed + dt).min(self.duration);
        let t = if self.duration > 0.0 { self.elapsed / self.duration } else { 1.0 };
        let eased = t * t * (3.0 - 2.0 * t); // smoothstep
        self.from + (self.to - self.from) * eased
    }
}

fn main() {
    let mut tween = Tween { from: 0.0, to: 100.0, duration: 1.0, elapsed: 0.0 };
    println!("{:.2}", tween.update(0.5));
}
```

Animation state machines (idle/walk/run/attack) with crossfades are more
important than the number of clips. Use root motion or in-place animation plus
code-driven movement consistently. glTF is the portable asset format; validate
that the skeleton and clips survive export.

## 11.15 Level editors and tile map editors

Options: build an in-game editor, use a general editor (LDtk, Tiled) and import
its JSON, or use the engine's editor (Fyrox). For Bevy, `bevy_ecs_ldtk` and
`bevy_ecs_tiled` import levels; `bevy_editor_pls` adds runtime inspection.

A level format should be data, not code: tile ids, entity spawns, properties and
a version. Keep the editor's source file and a runtime-optimised export. Use
`serde` with `deny_unknown_fields` for authoring formats, but tolerate unknown
fields in player-saved data for forward compatibility. Hot reload the level
while editing; a fast iteration loop is worth more than a custom tool.

## 11.16 Multiplayer networking for games

Two broad models: **client-server authoritative** (the server owns state; clients
send inputs and receive snapshots) and **peer-to-peer with rollback** (each peer
predicts and re-simulates). Rust crates: `bevy_replicon`, `lightyear`,
`renet`, `naia` and `laminar` (UDP reliability layer).

Client-server loop: input → server simulation → snapshot → client interpolation.
Send inputs with sequence numbers, acknowledge them, and reconcile the local
prediction. Use delta compression, interest management and a snapshot rate tied
to the game genre. For fighting games, **rollback netcode** predicts remote
inputs, re-simulates on arrival and blends the correction; it needs a
deterministic simulation with fixed timesteps.

```text
client: input(seq=42) -> predict locally -> render
server: apply input 42 -> snapshot(ack=42)
client: reconcile(authoritative state) -> resimulate unacked inputs
```

Determinism is hard: floating point, hash iteration order and physics engines
can differ across platforms. Use fixed-point or a deterministic physics engine
if rollback is the design. Test with artificial latency, jitter and packet loss
(Clumsy, `tc netem`), not only on localhost.

## 11.17 Game state machines and app states

A game is a set of modes: loading, menu, playing, paused, game over, cutscene.
Model them as an enum and gate systems by state. Sub-states handle overlays
(pause menu over gameplay).

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Loading,
    Menu,
    Playing,
    Paused,
    GameOver,
}

struct Game {
    state: State,
    score: u32,
}

impl Game {
    fn update(&mut self, dt: f32) {
        match self.state {
            State::Loading => {
                // If assets are ready, transition to Menu.
                let _ = dt;
                self.state = State::Menu;
            }
            State::Playing => {
                self.score += 1;
            }
            State::Paused | State::Menu | State::GameOver => {}
        }
    }

    fn toggle_pause(&mut self) {
        self.state = match self.state {
            State::Playing => State::Paused,
            State::Paused => State::Playing,
            other => other,
        };
    }
}

fn main() {
    let mut game = Game { state: State::Playing, score: 0 };
    game.update(0.016);
    game.toggle_pause();
    println!("{:?} {}", game.state, game.score);
}
```

Transitions should be explicit and centralised; a system that silently changes
state is a bug factory. Enter/exit hooks load and unload resources, reset input,
and pause audio. The same pattern applies to UI screens and network
connections.

## 11.18 Procedural generation: noise, dungeons and terrain

Procedural generation is deterministic randomness: a seed plus a hash function.
`noise` provides Perlin, simplex, Worley and fBm; `fastnoise-lite` is a fast
alternative.

```rust
use noise::{NoiseFn, Perlin};

fn heightmap(width: usize, height: usize, seed: u32) -> Vec<f32> {
    let perlin = Perlin::new(seed);
    let mut values = Vec::with_capacity(width * height);
    for y in 0..height {
        for x in 0..width {
            let scale = 0.05;
            let base = perlin.get([x as f64 * scale, y as f64 * scale]);
            let detail = perlin.get([x as f64 * scale * 4.0, y as f64 * scale * 4.0]) * 0.25;
            values.push((base + detail) as f32 * 0.5 + 0.5);
        }
    }
    values
}

fn main() {
    let map = heightmap(8, 8, 42);
    println!("{} {:.3}", map.len(), map[0]);
}
```

Dungeon generation: rooms plus corridors (BSP or random placement), a graph of
rooms, then a critical path with loops. Validate connectivity; an unreachable
exit is a broken level. Use a seeded RNG (`rand_chacha`) and record the seed, so
a bug is reproducible. Cellular automata and wave function collapse generate
caves and tile sets; both need constraint checks.

## 11.19 In-game UI: egui, iced and Bevy UI

- **Bevy UI**: ECS-driven nodes, flexbox-like layout, text and interaction.
- **egui**: immediate-mode GUI, excellent for debug tools and editors; integrates
  with Bevy via `bevy_egui`.
- **iced**: retained Elm-style GUI for desktop apps; usable for launchers and
  menus outside the game loop.

```rust
use bevy::prelude::*;

fn setup_ui(mut commands: Commands) {
    commands.spawn((
        Node {
            width: Val::Percent(100.0),
            height: Val::Px(48.0),
            justify_content: JustifyContent::SpaceBetween,
            padding: UiRect::all(Val::Px(8.0)),
            ..default()
        },
        BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.6)),
    ))
    .with_children(|parent| {
        parent.spawn((Text::new("Score: 0"), TextFont::from_font_size(24.0)));
    });
}

fn main() {
    let _ = (setup_ui, Val::Px(1.0));
}
```

UI must scale with resolution and input method (mouse, keyboard, gamepad,
touch). Keep the game simulation independent of UI state; a pause menu should
not stop the network or the audio mixer. For debug overlays, `egui` is faster to
build than a custom widget tree.

## 11.20 Performance optimisation

- **Profile first**: `tracy`/`puffin` for frame timing, `perf` for CPU,
  RenderDoc/Nsight for GPU.
- **Object pooling**: reuse bullets, particles and audio sources; allocation is
  a frame-time spike.
- **Spatial partitioning**: a grid or quadtree for collisions and queries, not
  an `O(n²)` loop.
- **Frustum and occlusion culling**: do not submit invisible geometry.
- **Batching and instancing**: one draw call per material/mesh where possible.
- **Fixed timestep** for simulation, interpolation for rendering.
- **Data-oriented layout**: contiguous arrays, avoid pointer chasing, keep hot
  components small.

```rust
use std::collections::HashMap;

#[derive(Default)]
struct SpatialGrid {
    cells: HashMap<(i32, i32), Vec<usize>>,
    size: f32,
}

impl SpatialGrid {
    fn key(&self, x: f32, y: f32) -> (i32, i32) {
        ((x / self.size).floor() as i32, (y / self.size).floor() as i32)
    }

    fn insert(&mut self, index: usize, x: f32, y: f32) {
        self.cells.entry(self.key(x, y)).or_default().push(index);
    }

    fn nearby(&self, x: f32, y: f32) -> Vec<usize> {
        let (cx, cy) = self.key(x, y);
        let mut found = Vec::new();
        for dy in -1..=1 {
            for dx in -1..=1 {
                if let Some(cell) = self.cells.get(&(cx + dx, cy + dy)) {
                    found.extend(cell);
                }
            }
        }
        found
    }
}

fn main() {
    let mut grid = SpatialGrid { cells: HashMap::new(), size: 32.0 };
    grid.insert(0, 10.0, 10.0);
    println!("{:?}", grid.nearby(12.0, 12.0));
}
```

Measure the frame budget (16.6 ms at 60 fps, 6.9 ms at 144 fps). Optimise the
largest cost, not the most interesting one. A game that runs at 60 fps with a
simple renderer beats one with shadows that stutters.

## Exercises

:::exercise guided A Bevy moving square with score
Build a Bevy app with a player square moved by WASD at a fixed speed, a `Score`
resource that increments every second, and a `GameState` enum that pauses
movement and shows a different background. Use `FixedUpdate` for movement and
`Update` for input handling. Run it with `cargo run`.
::hint
Use `ButtonInput<KeyCode>`, `Time<Fixed>` in `FixedUpdate`, and `States` with
`run_if(in_state(...))`. Insert the state with `init_state::<GameState>()`.
For the score, use a `Timer` resource with `TimerMode::Repeating`.
::solution
```rust
use bevy::prelude::*;

#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Playing,
    Paused,
}

#[derive(Component)]
struct Player;

#[derive(Resource, Default)]
struct Score(u32);

#[derive(Resource)]
struct ScoreTimer(Timer);

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands.spawn((
        Player,
        Sprite::from_color(Color::srgb(0.2, 0.9, 0.4), Vec2::splat(24.0)),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));
    commands.insert_resource(Score::default());
    commands.insert_resource(ScoreTimer(Timer::from_seconds(1.0, TimerMode::Repeating)));
}

fn movement(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time<Fixed>>,
    mut query: Query<&mut Transform, With<Player>>,
) {
    let mut direction = Vec2::ZERO;
    if keyboard.pressed(KeyCode::KeyW) { direction.y += 1.0; }
    if keyboard.pressed(KeyCode::KeyS) { direction.y -= 1.0; }
    if keyboard.pressed(KeyCode::KeyA) { direction.x -= 1.0; }
    if keyboard.pressed(KeyCode::KeyD) { direction.x += 1.0; }
    for mut transform in &mut query {
        transform.translation += direction.normalize_or_zero().extend(0.0) * 200.0 * time.delta_secs();
    }
}

fn score(time: Res<Time>, mut timer: ResMut<ScoreTimer>, mut score: ResMut<Score>) {
    if timer.0.tick(time.delta()).just_finished() {
        score.0 += 1;
    }
}

fn toggle(keyboard: Res<ButtonInput<KeyCode>>, state: Res<State<GameState>>, mut next: ResMut<NextState<GameState>>) {
    if keyboard.just_pressed(KeyCode::Escape) {
        next.set(match state.get() {
            GameState::Playing => GameState::Paused,
            GameState::Paused => GameState::Playing,
        });
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_state::<GameState>()
        .insert_resource(Time::<Fixed>::from_hz(60.0))
        .add_systems(Startup, setup)
        .add_systems(Update, (toggle, score))
        .add_systems(FixedUpdate, movement.run_if(in_state(GameState::Playing)))
        .run();
}
```
:::

:::exercise practice Spatial hashing for collisions
Implement a spatial hash that inserts circles, queries neighbours within a
radius, and compares the number of pair checks against the brute-force
`O(n²)` approach for 2,000 circles. Verify that both find the same pairs.
::hint
Key cells by floor(position / cell_size). For a query, scan the cells covering
the radius. Compare pairs by id and deduplicate with a `HashSet`. Use a fixed
seed and deterministic positions for a reproducible test.
::solution
```rust
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy)]
struct Circle {
    x: f32,
    y: f32,
    radius: f32,
}

struct Grid {
    cells: HashMap<(i32, i32), Vec<usize>>,
    size: f32,
}

impl Grid {
    fn new(size: f32) -> Self {
        Self { cells: HashMap::new(), size }
    }

    fn key(&self, x: f32, y: f32) -> (i32, i32) {
        ((x / self.size).floor() as i32, (y / self.size).floor() as i32)
    }

    fn insert(&mut self, index: usize, circle: Circle) {
        self.cells.entry(self.key(circle.x, circle.y)).or_default().push(index);
    }

    fn candidate_pairs(&self, circles: &[Circle]) -> HashSet<(usize, usize)> {
        let mut pairs = HashSet::new();
        for (index, circle) in circles.iter().enumerate() {
            let (cx, cy) = self.key(circle.x, circle.y);
            let reach = (circle.radius / self.size).ceil() as i32;
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    if let Some(cell) = self.cells.get(&(cx + dx, cy + dy)) {
                        for &other in cell {
                            if other > index {
                                pairs.insert((index, other));
                            }
                        }
                    }
                }
            }
        }
        pairs
    }
}

fn main() {
    let mut rng = ChaCha8Rng::seed_from_u64(7);
    let circles: Vec<Circle> = (0..2_000)
        .map(|_| Circle { x: rng.random_range(0.0..1000.0), y: rng.random_range(0.0..1000.0), radius: 6.0 })
        .collect();

    let mut grid = Grid::new(16.0);
    for (index, circle) in circles.iter().enumerate() {
        grid.insert(index, *circle);
    }

    let hashed = grid.candidate_pairs(&circles).len();
    let brute = circles.len() * (circles.len() - 1) / 2;
    println!("hashed {hashed} brute {brute}");
}
```
:::

:::exercise challenge A deterministic rollback simulation
Implement a tiny two-player tag game on a fixed 60 Hz timestep with integer
positions, input commands and a snapshot buffer of the last 120 frames.
Implement rollback: predict the remote input, save a snapshot, and when the real
input arrives, restore and re-simulate. Test with a scripted 200 ms latency.
::hint
Store `(frame, player_positions, last_acked_input)` in a ring buffer. The
simulation must be a pure function of `(state, inputs)` with integer maths. On a
late remote input, restore the snapshot for that frame, apply the corrected
input and replay every subsequent local input.
::solution
```rust
#[derive(Clone, Copy, Debug, PartialEq)]
struct State {
    p1: i32,
    p2: i32,
}

#[derive(Clone, Copy)]
enum Input {
    Left,
    Right,
    Stay,
}

fn simulate(mut state: State, local: Input, remote: Input) -> State {
    let step = |input: Input| match input {
        Input::Left => -1,
        Input::Right => 1,
        Input::Stay => 0,
    };
    state.p1 += step(local);
    state.p2 += step(remote);
    state
}

fn main() {
    let mut state = State { p1: 0, p2: 0 };
    let mut snapshots = Vec::new();
    let local = [Input::Right, Input::Right, Input::Left, Input::Stay];
    let remote = [Input::Left, Input::Stay, Input::Right, Input::Right];

    for frame in 0..local.len() {
        snapshots.push(state);
        state = simulate(state, local[frame], remote[frame]);
    }

    // Roll back to frame 2 with a corrected remote input and replay.
    let corrected = [Input::Left, Input::Right, Input::Left, Input::Stay];
    let mut replayed = snapshots[2];
    for frame in 2..local.len() {
        replayed = simulate(replayed, local[frame], corrected[frame]);
    }

    println!("{state:?} {replayed:?}");
    assert_eq!(replayed, State { p1: 1, p2: 0 });
}
```

Integer positions make the simulation deterministic across machines. A real
rollback loop keeps a local input queue, acknowledges remote inputs and blends
visual corrections; the simulation itself must never depend on wall-clock time.
:::

## Quiz

:::quiz Game development check
? What is an entity in an ECS?
- A struct that inherits from a base class
+ An identifier to which components are attached
- A system that updates the world
- A texture atlas
= Entities are ids, components are data, systems are behaviour. There is no inheritance hierarchy; composition is the model.

? Why does a fixed timestep matter for physics and netcode?
- It makes rendering faster
+ It makes simulation deterministic and stable across frame rates
- It removes the need for interpolation
- It reduces memory use
= A fixed `dt` gives reproducible results and stable constraint solving. Render interpolation hides the discrete steps.

? What does rollback netcode do when a remote input arrives late?
- Ignores it
+ Restores the snapshot for that frame, applies the corrected input and re-simulates subsequent frames
- Restarts the match
- Sends the state to the server
= Rollback predicts, then corrects history and replays local inputs. It requires a deterministic simulation.

? Which is the first step of performance optimisation?
- Rewrite the renderer in Vulkan
+ Profile to find the largest cost
- Add more threads
- Reduce the texture resolution
= Measurement precedes optimisation. Frame profilers (Tracy, puffin) and GPU captures show where the time actually goes.

? Why use a spatial partition for collisions?
- It makes collision response more accurate
+ It reduces candidate pairs from `O(n²)` to near-linear for typical distributions
- It removes the need for a broad phase
- It stores meshes
= A grid, quadtree or BVH narrows the pairs that need exact tests; the narrow phase still decides the actual collision.
:::

:::recap
- Bevy is ECS-first: entities are ids, components are data, systems query them, resources are global, plugins group features.
- Fyrox offers a scene editor and Unity-like model; macroquad/ggez/miniquad are lightweight 2D frameworks.
- ECS archetypes give cache-friendly queries and parallel systems at the cost of indirection.
- 2D uses atlases and batching; 3D uses wgpu/vulkano/ash with a render graph and shaders.
- WGSL is the portable shader language; naga validates and translates.
- Rapier and Avian provide physics; fixed timesteps keep simulation stable.
- AABB broad phase plus SAT/GJK narrow phase is the collision pipeline.
- Kira suits game audio; rodio suits simple playback; keep decoding off the game thread.
- Input belongs behind an action layer with dead zones and rebinding.
- Assets load asynchronously and are referenced by handles; hot reload is a dev feature.
- Scene graphs compose transforms; animation needs state machines and crossfades.
- Netcode is client-server with prediction/reconciliation, or rollback with deterministic simulation.
- Procedural generation is deterministic randomness; validate connectivity.
- UI should scale and stay independent of simulation; profile before optimising.
:::
