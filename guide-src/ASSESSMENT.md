# Repository assessment and expansion plan

Measured on this checkout (branch `arena/b1cbcfe0-rust-from-zero`, base
`f08f074`) on 2026-11-16. Every count below was produced by a command in this
session, not recalled.

## 1. What exists today

`Rust from Zero` is not a prototype. It is a mature content application:

| Layer | What is there |
| --- | --- |
| Content | 88 Markdown files in `guide-src/chapters/` (83 tracked chapters, 5 appendices, 9 multi-file projects), 375,787 words of source Markdown, 1,329 code blocks, 274 exercises, 379 quiz questions, 253 glossary terms |
| Site | Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Shiki highlighting, 96 statically generated pages |
| Parser | `src/lib/guide-parser.ts` turns the bespoke chapter format into typed blocks: callouts, quizzes, exercises, steppers, checklists, glossary pills, cross-links, captured output |
| Quality gates | `npm run verify:content` (parser + content lint), `npm test` (77 tests), `npm run typecheck`, `npm run build`, `guide-src/tools/audit.py --strict`, and a compile gate that runs every flagged Rust example |
| CI | one workflow with a `guide` job on every push and an `examples` job on pull requests and weekly |

The published promise is unusually strong and it holds on this checkout:

- every `run`/`check`/`test` Rust example is compiled by
  `guide-src/tools/check.py`;
- compiler messages and program output are captured from real runs into
  `guide-src/captured/`, never typed by hand;
- chapter numbers are derived, so `[chapter 99](#errors)` is renumbered
  automatically;
- British spelling, reading-time arithmetic, link reachability, duplicate ids,
  glossary integrity and README statistics are all lint rules, not conventions.

## 2. Structural assessment

### Strengths worth preserving

1. **A genuine through-line.** Parts 1–2 start at transistors and end at ELF
   segments, then Parts 3–5 teach the language, Parts 6–10 explain memory, OS,
   I/O and CPU internals, and Parts 11–15 apply all of it. That sequence is the
   reason the guide is more than a syntax reference.
2. **Chapter rhythm.** Plain-language idea → analogy → table → runnable example
   → machine-level view → exercises → quiz → recap. It is consistent across
   all 83 chapters.
3. **The format is an API.** Callouts, quizzes and exercises are typed blocks
   the UI understands, not Markdown decoration. New content must use them.
4. **Verification culture.** The two rules in `NEXT-VERSION-PROMPT.md` — real
   output, measured numbers — are enforced by tooling. Any expansion has to
   respect them.

### Where the current organisation falls short against the requested brief

| Requested chapter | Existing coverage | Verdict |
| --- | --- | --- |
| 1. Core language | `variables`, `types`, `functions`, `control-flow`, `ownership`, `borrowing`, `lifetimes`, `structs`, `enums`, `patterns`, `traits`, `generics`, `closures`, `iterators`, `errors`, `modules`, `collections`, `smart-pointers`, `advanced-traits`, `type-system`, `macros`, `idioms` | **Deep, but spread over 25 chapters.** A reader cannot see the whole language in one place, and several late-2021+ features are thin or absent: const generics in depth, GATs, native `async fn` in traits, `PhantomData`/DST/never-type treatment as one story, `pub(in path)`, `AsRef`/`AsMut` conversion ladders. |
| 2. Async and concurrency | `threads`, `shared-state`, `async`, `concurrency-async-internals`, `project-chat`, `async-ecosystem` | **Strong on Tokio and runtime internals.** Missing: `Pin`/self-reference as a teachable unit, wakers by hand, async channels as a family (`mpsc`/`broadcast`/`watch`/`oneshot`), streams/sinks, async traits, atomics and memory ordering in an async context, work-stealing detail, deadlock patterns. |
| 3. Systems programming | `unsafe`, `ffi`, `memory-layout`, `rust-stdlib-internals`, allocators, virtual memory, loading, syscalls, signals, epoll/io_uring, SIMD, performance | **Excellent and rare.** Missing: custom `GlobalAlloc` end-to-end, `cxx`, `bindgen`/`cbindgen`, process piping as a recipe, `memmap2`, `asm!`, panic/OOM handlers, `build.rs` + linker scripts, cross-compilation, GDB/LLDB workflow, core dumps. |
| 4. Backend | `web` (Axum), `databases` (SQLx/Diesel/SeaORM), `project-api`, `observability`, `serde`, `async-ecosystem` | **One framework, one happy path.** Missing: Actix-web, Rocket, Warp, GraphQL, gRPC/tonic, authN/authZ, Redis, queues, caching, uploads, WebSockets/SSE, background jobs, OpenAPI, versioning, rate limiting, pagination, graceful shutdown, migrations as a workflow. |
| 5. Blockchain | none (deliberately excluded in `53-next.md`) | **Absent.** This is the single largest gap against the brief. Solana/Anchor, Substrate, CosmWasm, NEAR, ethers/alloy, crypto primitives, token standards, DeFi, bridges, MEV and DAO patterns have no home. |
| 6. Security | scattered (unsafe chapter, TLS trace, dependency hygiene in `quality-tools`) | **No dedicated treatment.** Missing: input validation, SQLi/XSS/CSRF in Rust services, AES-GCM/ChaCha20-Poly1305, RSA/ECC/X25519, Argon2, `zeroize`, rustls configuration, constant-time code, fuzzing, Kani/Prusti, `cargo-audit`/`deny`/`vet`, SBOM, secure deserialisation. |
| 7. AI and ML | `apps` survey (data science, `polars`, `candle` mentions) | **Survey only.** Missing: `ndarray`/`nalgebra`, `burn`, `tch`, `linfa`, ONNX Runtime, `tokenizers`, `image`/OpenCV, vector search, LLM clients, `wgpu`/`cudarc`, autodiff, training loops. |
| 8. Embedded and IoT | `games-embedded` (single survey chapter) | **One chapter for 23 topics.** Missing: `no_std` mechanics, `embedded-hal` v0.2 vs v1.0, Embassy, RTIC, DMA, low power, OTA/A-B updates, USB, CAN, MQTT/CoAP/LoRa, BLE, `probe-rs`. |
| 9. DevOps and tooling | `cargo`, `quality-tools`, `testing`, `testing-strategies`, `performance`, `cli` | **Good foundations.** Missing: workspaces at scale, profiles and `[patch]`, proc-macro development, TUI, property testing, mocking, coverage, dylint, mdBook, Docker/Nix, release automation, binary-size work, `cross`/`zigbuild`, publishing, monorepos, hooks. |
| 10. Networking | `network-layers-ethernet-ip`, `tcp-udp-sockets-kernel`, `dns-http-tls-trace`, `web`, `project-chat` | **Strong on how the stack works.** Missing: `reqwest`/`ureq`/`hyper` clients, QUIC/`quinn`, `tungstenite`, MQTT/AMQP/NATS/ZeroMQ, libp2p, Raft/CRDT/gossip, discovery, circuit breakers/`tower`, proxies, `nom`. |
| 11. Game development | `games-embedded` (Bevy survey) | **A tour, not a curriculum.** Missing: ECS in depth, Fyrox, macroquad/ggez, wgpu/vulkano, WGSL/naga, Rapier/Avian, audio, input, assets, animation, netcode, procedural generation, profiling. |
| 12. WebAssembly | `apps` (wasm-bindgen/Yew survey), `capstone` | **Survey only.** Missing: wasm-pack workflow, `web-sys`, Leptos, Dioxus, Sycamore, WASI preview 1/2, component model/WIT, Wasmtime/Wasmer, workers, Cloudflare Workers, plugin patterns, edge runtimes. |
| 13. Advanced patterns | `advanced-traits`, `type-system`, `macros`, `idioms`, `performance` | **Concepts exist, patterns do not.** Missing: HRTBs/variance, full derive macro walkthrough, attribute macros/DSLs, plugin architectures, DI, EDA, CQRS/event sourcing, DDD, hexagonal architecture, profiling tooling comparisons. |

### Cross-cutting problems

1. **Discovery.** 88 flat chapters with 15 parts is a reference library. A
   reader who asks "how do I become a Rust backend engineer?" has a route
   filter, not a chapter sequence with a beginning and an end for that domain.
2. **Domain islands.** Blockchain, security, ML and embedded are either absent
   or one survey chapter, so the guide cannot honestly claim "every major
   domain".
3. **Stale boundary statement.** `53-next.md` and the README say blockchain is
   deliberately out of scope. That statement becomes false the moment this
   expansion lands, so it must change.
4. **No exercise scaffolding for domain work.** Domain chapters need projects
   (a REST API, a Solana program, an Embassy blink, a Wasm component), not only
   snippets.

## 3. What this change does

Rewriting 88 chapters into 13 would destroy 375,000 words of verified material,
break 524 in-prose chapter references and invalidate every exercise. The
expansion therefore adds a **second, domain-complete spine** instead of
replacing the first:

- **`D1`–`D13`, one chapter per requested chapter**, in a new part called
  *The Definitive Curriculum*. Each new chapter teaches every requested topic
  at working depth, with code, pitfalls, exercises and a quiz, and links to the
  existing deep-dive chapters where the internals live.
- **Numbering is `D1`–`D13` on purpose.** Existing chapters keep `01`–`83`
  (appendices `A`–`E`), because shifting them would silently falsify 524
  in-prose references such as "chapter 18". The parallel prefix is honest: two
  tracks, two numbering schemes, no dead links.
- **The old guide becomes the deep-dive library.** Nothing is deleted. The
  radar, roadmap, README and `53-next.md` are updated to describe the two
  tracks and to point domain readers at the new sequence.
- **Gaps are filled where the old guide was silent.** Blockchain, security,
  AI/ML, embedded/IoT, backend breadth, networking breadth, games, Wasm and
  meta-programming all get content for the first time.

### Deliberate limits, stated plainly

- The new chapters use **unflagged illustrative Rust blocks** for
  ecosystem APIs (`actix-web`, `anchor-lang`, `candle`, `embassy`, `bevy`,
  `leptos`). They are not compiled by `check.py`, because compiling thirteen
  domain toolchains (Solana, CUDA, embedded targets, Wasm) is a separate
  infrastructure project. Standard-library examples in `D1`/`D2`/`D3` are
  written to compile as-is and can be promoted to `run` blocks when a
  toolchain is available. This limit is recorded rather than hidden.
- One chapter per domain cannot replace a 400-page book on Solana or on
  training transformers. The chapters aim at **working literacy**: enough to
  read real code, choose the right crate, build a small project and know where
  the depth lies.
- Every requested bullet is present as a heading or an explicit sub-heading,
  even where the treatment is two paragraphs and one snippet.

## 4. Verification plan

After the content lands, the same gates that already exist must stay green:

```sh
npm run verify:content    # parser, lint, link graph, glossary, stats agreement
npm test                  # 77 unit tests, including the numbering rules
npm run typecheck
npm run build             # 96+ static pages
python3 guide-src/tools/audit.py --strict   # headers, exercises, quiz counts
npm run stats             # source of the README table
```

`D1`–`D13` must each pass audit's structural rules: full header, at least
three exercises with one hint and one solution each, at least four quiz
questions, an analogy, a comparison box and a recap.

## 5. Outcome

All thirteen chapters were written and the gates were run against the final
tree on 2026-11-16.

| Measure | Before | After |
| --- | ---: | ---: |
| Chapters parsed | 88 | 101 |
| Tracked chapters | 83 | 96 |
| Code blocks | 1,329 | 1,688 |
| Rust fences | 1,007 | 1,298 |
| Exercises | 274 | 313 |
| Quiz questions | 379 | 444 |
| Search entries | 17,768 | 20,687 |
| Inbound cross-links | 1,137 | 1,259 |
| Words of prose | 224,482 | 267,156 |

The thirteen new chapters total about 75,300 words. Every `D` chapter carries a
full header, 16–30 numbered sections, an analogy, a comparison box, three
exercises with hint and worked solution, a five-question quiz with explanations,
and a recap. `audit.py --strict` reports zero structural remarks;
`verify:content` reports a clean lint; all 77 tests, `tsc --noEmit` and the
production build pass. The `definitive` route and the `D1`…`D13` numbering
render in the built pages, including the roadmap overview section.

Two limits remain as stated above: ecosystem examples are illustrative and
unflagged, and one chapter per domain is working literacy rather than a
replacement for a dedicated book.
