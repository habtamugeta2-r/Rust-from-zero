# Contributing to Rust from Zero

Thank you for helping. This guide has one unusual rule that shapes everything
else: **every Rust example is compiled and run, and the output printed in the
guide is the output that program really produced.** Compiler messages are real
diagnostics, on real line numbers. A change that breaks that promise is worse
than no change.

## Get set up

```sh
npm install                       # installs Next.js, Shiki, Tailwind & TypeScript
npm run verify:content            # checks every chapter, link & captured output
npm run typecheck && npm run build
python3 guide-src/tools/audit.py --strict   # must report "0 structural remark(s)"
```

To run the local Next.js site with live reload while editing chapters:

```sh
npm run dev
```

To check the examples you also need a Rust toolchain (stable, plus `clippy` and
`rustfmt`):

```sh
guide-src/tools/setup-env.sh      # installs it under /opt/rs
python3 guide-src/tools/check.py                    # everything
python3 guide-src/tools/check.py serde web          # chapters matching a word
python3 guide-src/tools/check.py --ext              # crate examples, via cargo
python3 guide-src/tools/check.py --projects         # multi-file & Wasm/no_std projects
```

`guide-src/PLAN.md` is the reference for the chapter format: header fields, the
`:::analogy`/`:::warn`/`:::quiz`/`:::exercise` boxes, code-fence flags, and the
captured-output mechanism.

## What to edit, and what never to delete

- Edit `guide-src/chapters/*.md` for guide prose and examples, or `src/` for the
  Next.js application and parser.
- Delete nothing from `guide-src/captured/`: those files hold the real outputs
  that the `output auto` blocks are filled from.

## Style

1. **British spelling** in prose: *serialise*, *colour*, *organise*,
   *behaviour*. US spelling is correct inside crate names, API names and HTTP
   status names (`Color`, `Authorization`, `Unauthorized`).
2. **Explain every term at first use**, in one sentence, ideally with an analogy
   before the definition. Assume a reader who has never programmed.
3. **Keep the chapter skeleton:** header fields (`@id`, `@part`, `@title`,
   `@short`, `@level`, `@time`, `@learn`), then the idea in plain words, an
   analogy, a small example, exercises (with a hint and an explained solution
   for each), a quiz of at least four questions, and a recap.
4. **Be honest about limits.** If a topic is only named and not taught, say so,
   and point somewhere useful. Do not let a crate appear once in a table with no
   advice about when to choose it. `53-next.md` holds the written coverage
   policy: taught, named with advice, or declared out of scope with a reason.
5. **Prose, not marketing.** No "simply", no "just", no claims that cannot be
   checked. Numbers that appear in the guide (example counts, versions) come
   from the tools, not from memory.

## Adding an example

1. Choose the check kind that proves what you claim: `run`, `wrap`, `check`,
   `test`, `fail`, `panic`, `warns`, `ext` (needs crates), `nocmp`, `release`.
2. Run `python3 guide-src/tools/check.py <chapter>` and let it capture the real
   output.
3. Do not hand-type output. Put an ```` ```output auto ```` or
   ```` ```error auto ```` block after the example; the Next.js parser fills it
   from `guide-src/captured/`.
4. If the example needs a crate, add the crate and version to
   `guide-src/tools/ext-main-Cargo.toml`, and check it with `--ext`.

## Before you open a pull request

- [ ] `npm run verify:content`, `npm run typecheck`, and `npm run build` pass cleanly.
- [ ] `python3 guide-src/tools/audit.py --strict` reports **0 structural remarks**.
- [ ] `python3 guide-src/tools/check.py` passes for every chapter you touched
      (and `--ext` if you touched a crate example).
- [ ] Multi-file and target projects still rebuild and test:
      `python3 guide-src/tools/check.py --projects` (or `python3 guide-src/tools/project.py 48 shortener /tmp/shortener`).
- [ ] New prose is in British English, and every new term is explained.
- [ ] Any claim of "complete" or "every" in your text is one you have checked.

## Provenance

Ideas are welcome from anywhere — books, talks, issues, other languages. **Take
the idea; write the text.** Do not paste prose from another source, even
paraphrased sentence by sentence, and do not paste code you have not run. The
example outputs must come from this repository's own toolchain.

## Licence

By contributing you agree that your prose is licensed CC BY 4.0 and your code
listings MIT, as described in [`LICENSE`](./LICENSE).
