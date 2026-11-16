@id security-engineering
@part def
@title Security Engineering
@short Security
@level advanced
@time 95
@learn Apply memory-safety guarantees and recognise where `unsafe` breaks them | Prevent injection, XSS, CSRF and unsafe deserialisation in Rust services | Use AEAD, key exchange, hashing and password KDFs correctly | Configure TLS, randomness, key storage and constant-time comparisons | Audit, fuzz, verify and sign the supply chain from dependency to deployment

Security is not a feature that can be added at the end; it is a set of
properties that survive contact with hostile input. Rust removes entire classes
of memory bugs, which changes the threat model but does not remove the need for
security engineering. The remaining risks are logic errors, injection,
cryptography misuse, secret leakage, dependency compromise and denial of
service. This chapter is the working checklist, with code. Chapter D4 covers
authentication and authorisation in a service context; this chapter covers the
primitives and the process.

The library touches security wherever it arises — memory safety in the
[unsafe chapter](#unsafe), transport security in the [DNS, HTTP and TLS
trace](#dns-http-tls-trace), dependency checks in [quality tools](#quality-tools).
This chapter is the first place those scattered concerns are gathered into one
threat-led pass, and it adds the topics the library does not teach elsewhere:
cryptography chosen and used correctly (§6.6–§6.13), supply-chain verification
(§6.14, §6.19–§6.20), fuzzing and formal verification (§6.15–§6.16), and secure
deserialisation (§6.21). If you read the library first, start from those
sections and use the rest as the checklist that joins them up.

:::analogy A castle with many doors
Memory safety is a strong wall, but a castle is only as secure as its doors:
input parsing, SQL, HTML output, deserialisation, dependencies, secrets and
deployment. An attacker does not attack the wall if a door is open. Security
engineering is the practice of walking the perimeter, assuming every door will
be tried, and making each one fail closed.
:::

:::compare Prevention, detection and response
Prevention stops an attack: validation, least privilege, memory safety, signatures. Detection notices one that got through: audit logs, anomaly alerts, integrity checks. Response limits the damage: rotation, revocation, rollback, incident process. A control in only one layer fails silently when it is bypassed, so security work balances all three and assumes each individual control will eventually fail.
:::


## 6.1 Rust's memory safety and how `unsafe` breaks it

Safe Rust guarantees that references are valid, that data races are impossible
and that values are initialised before use. It does not guarantee that a program
is correct, that an index is semantically valid, that a panic is acceptable, or
that a resource limit is enforced. `unsafe` reopens the memory-safety door:

- dereferencing a dangling or misaligned raw pointer;
- creating two mutable references to the same value;
- reading uninitialised memory (`MaybeUninit` misuse);
- transmuting between layouts;
- calling an FFI function with a violated contract;
- implementing `Send`/`Sync` for a type that is not thread-safe.

Every `unsafe` block needs a **safety comment** that names the invariant and
the code that establishes it. Run `cargo miri test` on unsafe-heavy crates; Miri
detects many undefined-behaviour patterns that tests miss. Keep unsafe blocks
small and wrap them in a safe API that cannot be misused.

```rust
/// # Safety
/// `values` must contain at least one element, and the caller must not hold
/// another reference to it for the duration of the returned reference.
unsafe fn first_unchecked<T>(values: &[T]) -> &T {
    // SAFETY: the caller promised a non-empty slice; `get_unchecked` requires
    // the index to be in bounds.
    unsafe { values.get_unchecked(0) }
}
```

Rust also prevents use-after-free across threads only when the types say so.
`Rc`, `RefCell` and raw pointers are not `Send`/`Sync` for good reason; reaching
for `unsafe impl Send` to silence a compiler error is how data races enter a
codebase. The [unsafe chapter](#unsafe) explains stacked borrows and provenance.

## 6.2 Input validation and sanitisation

Validate at the **boundary**, normalise before validating, and represent the
validated value with a type. A handler that accepts `String` and checks it in
five places will eventually miss one; a `Email` newtype with a fallible
constructor makes the check unavoidable.

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Signup {
    email: String,
    display_name: String,
    age: u8,
}

#[derive(Debug)]
struct Email(String);

impl Email {
    fn parse(input: &str) -> Result<Self, &'static str> {
        let trimmed = input.trim();
        if trimmed.len() > 254 {
            return Err("email too long");
        }
        let (local, domain) = trimmed.split_once('@').ok_or("missing @")?;
        if local.is_empty() || !domain.contains('.') || domain.starts_with('.') {
            return Err("malformed email");
        }
        Ok(Email(trimmed.to_lowercase()))
    }
}

fn validate(input: Signup) -> Result<(Email, String), &'static str> {
    let email = Email::parse(&input.email)?;
    let name = input.display_name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("display name must be 1..=80 characters");
    }
    if !(13..=120).contains(&input.age) {
        return Err("age out of range");
    }
    Ok((email, name.to_string()))
}

fn main() {
    let input = Signup { email: " ADA@EXAMPLE.COM ".into(), display_name: "Ada".into(), age: 30 };
    println!("{:?}", validate(input).map(|(email, name)| (email.0, name)));
}
```

Rules that generalise: use allow-lists, not deny-lists; bound every length and
collection size; reject unknown fields; validate on the server even if the
client validates; encode output for its context; never use input to build a
path, command, SQL fragment or HTML string. "Sanitisation" that strips
characters is fragile; correct encoding at the sink is robust. Log validation
failures without logging the full payload, which may contain secrets or personal
data.

## 6.3 SQL injection prevention

SQL injection happens when data is concatenated into a query. Parameterised
queries send the SQL text and the values separately, so the database never
parses a value as syntax. Every Rust database library supports them.

```rust
use sqlx::PgPool;

async fn find_user(pool: &PgPool, email: &str) -> sqlx::Result<Option<(i64, String)>> {
    sqlx::query_as("SELECT id, email FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
}

// Never do this:
// let sql = format!("SELECT * FROM users WHERE email = '{email}'");
// sqlx::query(&sql).execute(pool).await?;
```

Identifiers (table and column names) cannot be bound as values. If they must be
dynamic, map a closed enum to a fixed fragment:

```rust
enum SortBy { CreatedAt, Email }

fn order_clause(sort: SortBy) -> &'static str {
    match sort {
        SortBy::CreatedAt => "created_at DESC",
        SortBy::Email => "email ASC",
    }
}
```

ORMs reduce the risk but do not eliminate it: raw SQL escape hatches, `ORDER BY`
interpolation and dynamic filters still need care. Set the database user's
privileges to the minimum (no `DROP`, no cross-database access), and use
row-level security where multi-tenancy demands it. A `LIKE` pattern is data, not
syntax, but `%` and `_` inside it still have wildcard meaning; escape them if
the user meant them literally.

## 6.4 XSS prevention and Content Security Policy

Cross-site scripting is an output-encoding failure. In Rust web applications,
use a template engine that escapes by default (`askama`, `maud`, `minijinja`
with auto-escaping) and never build HTML with `format!` from user input.

```rust
// Askama escapes {{ }} for HTML by default. Use |safe only for trusted,
// already-sanitised markup.
#[derive(askama::Template)]
#[template(source = "<p>Hello, {{ name }}</p>", ext = "html")]
struct Greeting<'a> {
    name: &'a str,
}

fn render(name: &str) -> String {
    Greeting { name }.render().unwrap()
}

fn main() {
    println!("{}", render("<script>alert(1)</script>"));
}
```

Layers of defence:

- **Contextual encoding**: HTML text, attribute, URL, JavaScript and CSS need
  different escaping. Use the template's contextual escaper.
- **Content Security Policy**: `default-src 'self'; script-src 'self'; object-src
  'none'; base-uri 'none'; frame-ancestors 'none'`. A strict CSP turns many XSS
  bugs into blocked scripts. Nonces or hashes allow inline scripts without
  `unsafe-inline`.
- **Cookie flags**: `HttpOnly`, `Secure`, `SameSite`.
- **Trusted Types** in browsers for DOM sinks.
- **Sanitise rich text** with an allow-list HTML sanitiser (`ammonia`), not a
  regex.

```rust
use axum::{http::HeaderValue, response::Response};

fn add_security_headers(response: &mut Response) {
    let headers = response.headers_mut();
    headers.insert("content-security-policy", HeaderValue::from_static(
        "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
}
```

## 6.5 CSRF protection

Cross-site request forgery tricks a logged-in browser into sending a
state-changing request to your site. Cookies are attached automatically, so
authentication alone is not authorisation for the request's origin.

- Use `SameSite=Lax` or `Strict` cookies; `Lax` still allows top-level `GET`
  navigation, so state changes must not be `GET`.
- Require a CSRF token for state-changing requests: a random value bound to the
  session, sent in a form field or header, compared in constant time.
- Verify `Origin`/`Referer` against an allow-list as defence in depth.
- Do not expose state-changing endpoints with permissive CORS; `Access-Control-
  Allow-Origin: *` with credentials is invalid, and reflecting arbitrary origins
  is equivalent to disabling the protection.

```rust
use rand::RngCore;

fn new_csrf_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn token_matches(expected: &str, supplied: &str) -> bool {
    use subtle::ConstantTimeEq;
    expected.as_bytes().ct_eq(supplied.as_bytes()).into()
}

fn main() {
    let token = new_csrf_token();
    println!("{}", token_matches(&token, &token));
}
```

APIs that authenticate with a bearer token in a header, not a cookie, are not
vulnerable to classic CSRF because the browser does not attach the header
automatically. If you support both, the cookie path still needs protection.

## 6.6 Symmetric cryptography: AES-GCM and ChaCha20-Poly1305

Use an **AEAD** (authenticated encryption with associated data) and never a raw
block cipher. AES-256-GCM is hardware-accelerated on most servers;
ChaCha20-Poly1305 is fast without AES hardware and is the better choice on
mobile and embedded. Both need a **unique nonce** per key; reusing a nonce with
the same key destroys confidentiality and integrity.

```rust
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
    ChaCha20Poly1305, Nonce,
};

fn encrypt(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> (Vec<u8>, [u8; 12]) {
    let cipher = ChaCha20Poly1305::new(key.into());
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plaintext, aad })
        .expect("encryption failure");
    (ciphertext, nonce.into())
}

fn decrypt(key: &[u8; 32], ciphertext: &[u8], nonce: &[u8; 12], aad: &[u8]) -> Option<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
        .ok()
}
```

Rules: generate keys with a CSPRNG and store them in a KMS/HSM; use a 96-bit
random nonce and track a counter if you encrypt more than a few billion
messages per key; never reuse `(key, nonce)`; include the context (user id,
record id, version) in the AAD so a ciphertext cannot be moved to another row;
rotate keys and keep a key id with each ciphertext; do not compress before
encrypting unless you understand CRIME-style attacks. `aes-gcm` offers the same
API for AES. A MAC without encryption (`HMAC`) is for integrity, not secrecy.
Chapter D5 uses the same primitives for on-chain data.

## 6.7 Asymmetric cryptography: RSA, ECC and X25519

Asymmetric keys solve key distribution and signatures. Use them for what they
are designed for, with modern parameters:

- **RSA**: encryption with OAEP (SHA-256), signatures with PSS. Minimum 3072-bit
  keys for new systems. RSA is slow and large; prefer ECC unless compatibility
  demands it.
- **ECDSA/EdDSA**: P-256 (NIST) or secp256k1 (Bitcoin/Ethereum), Ed25519 for
  signatures. Ed25519 is the simplest safe choice.
- **X25519**: Diffie-Hellman key agreement. Combine it with a KDF (HKDF-SHA256)
  to derive symmetric keys. It is not a signature scheme.

```rust
use rand_core::OsRng;
use x25519_dalek::{PublicKey, StaticSecret};

fn exchange() -> ([u8; 32], [u8; 32]) {
    let alice_secret = StaticSecret::random_from_rng(OsRng);
    let bob_secret = StaticSecret::random_from_rng(OsRng);
    let alice_public = PublicKey::from(&alice_secret);
    let bob_public = PublicKey::from(&bob_secret);

    let alice_shared = alice_secret.diffie_hellman(&bob_public);
    let bob_shared = bob_secret.diffie_hellman(&alice_public);
    assert_eq!(alice_shared.as_bytes(), bob_shared.as_bytes());
    (alice_shared.to_bytes(), bob_shared.to_bytes())
}

fn main() {
    let _ = exchange();
}
```

Raw ECDH output is not a key: pass it through HKDF with a salt and context
info. For signatures, verify against the expected public key and bind the
message to its context (domain separation) to prevent cross-protocol reuse. Do
not implement padding, primality tests or elliptic-curve arithmetic yourself.
`ring`, `aws-lc-rs`, `rustls` and the RustCrypto crates are the building blocks;
prefer one audited provider per application rather than mixing several.

## 6.8 Hashing: SHA-2, SHA-3, BLAKE2 and BLAKE3

| Function | Output | Use | Avoid |
| --- | --- | --- | --- |
| SHA-256 | 256 bit | signatures, Merkle trees, general integrity | password storage |
| SHA-512 | 512 bit | high-security integrity | password storage |
| SHA-3 (Keccak) | 224–512 bit | diversity from SHA-2, Ethereum's Keccak variant | assuming SHA-3 == Keccak |
| BLAKE2b/s | up to 512 bit | fast software hashing, keyed MAC | password storage |
| BLAKE3 | 256 bit | very fast, parallel, tree mode | password storage |

A general-purpose hash is fast, which is exactly wrong for passwords. Use a
password KDF (section 6.12) and a salt per password. For integrity, compare
digests in constant time where an attacker can time the comparison (section
6.18). For keyed integrity, use HMAC or an AEAD, not `hash(secret || message)`
unless you use a construction designed for it (HMAC, KMAC, BLAKE3 keyed mode).

```rust
use blake3::Hasher;
use sha2::{Digest, Sha256};

fn main() {
    let digest = Sha256::digest(b"payload");
    let mut hasher = Hasher::new();
    hasher.update(b"payload");
    println!("{:x}", digest);
    println!("{}", hasher.finalize().to_hex());
}
```

## 6.9 Key management, rotation and secure storage

Keys are the highest-value asset in a cryptographic system. The lifecycle:
generate in a trusted environment, store encrypted at rest with access control,
use through a minimal interface, rotate on a schedule or after an incident, and
destroy verifiably.

- **Envelope encryption**: a data key encrypts the data; a master key in a KMS
  encrypts the data key. Rotating the master does not require re-encrypting
  every record.
- **Key ids** in ciphertext headers make rotation possible without guessing.
- **Separation of duties**: the service can decrypt but not export the master
  key; humans need break-glass approval.
- **HSM/KMS**: AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault Transit.
- **Filesystem**: `age` or `SOPS` for secrets at rest; restrictive permissions;
  no keys in container images or Git.

Never derive a key from a password without a KDF, and never use the same key for
encryption and signing. Rotate credentials on a documented schedule and
immediately after suspected compromise; keep the old key only long enough to
decrypt existing data, then re-encrypt.

## 6.10 TLS configuration: `rustls`, `native-tls` and certificate pinning

TLS protects data in transit and authenticates the server. `rustls` is a memory-
safe implementation with no OpenSSL dependency; `native-tls` delegates to the
platform. Use TLS 1.2 as a minimum and prefer 1.3; disable renegotiation and
legacy ciphers; keep the trust store updated.

```rust
use rustls::{ClientConfig, RootCertStore};
use std::sync::Arc;

fn client_config() -> Arc<ClientConfig> {
    let roots = RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    Arc::new(ClientConfig::builder().with_root_certificates(roots).with_no_client_auth())
}

fn main() {
    let _ = client_config();
}
```

Server-side, terminate TLS at a proxy (nginx, Envoy, a cloud load balancer) or in
the service with `axum-server` and `rustls`. Redirect HTTP to HTTPS, set HSTS
with a long max-age after confirming the whole site works over HTTPS, and use
OCSP stapling where the stack supports it.

**Certificate pinning** compares the server's public key or certificate hash to
a known value. It defends against a compromised CA, at the cost of operational
rigidity: a rotated certificate breaks every pinned client unless you pin the
public key and ship a backup pin. Mobile apps often pin; browsers do not.
Prefer certificate transparency monitoring plus a narrow trust store over
pinning unless the threat model justifies it.

## 6.11 Secure random number generation

Use the operating system CSPRNG through `getrandom` (the lowest layer) or
`rand`'s `OsRng`/`ThreadRng`. Never use a seeded PRNG for keys, nonces, tokens,
session ids or password resets.

```rust
use rand::{rngs::OsRng, RngCore};

fn session_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn random_between(low: u32, high: u32) -> u32 {
    use rand::Rng;
    rand::rng().random_range(low..high)
}

fn main() {
    println!("{} {}", session_token().len(), random_between(1, 10));
}
```

`rand::rng()` is a per-thread CSPRNG seeded from the OS; it is fine for tokens.
`SmallRng` and `StdRng` are deterministic algorithms: use them for simulations
and tests, never for secrets. In `no_std`, use `getrandom` with the target's
backend or a hardware RNG, and fail closed if no entropy source exists. A
random value for security must be unpredictable to an attacker who has seen
previous values; that is a CSPRNG property, not a statistical one.

## 6.12 Password hashing: Argon2, bcrypt and scrypt

Passwords must be stored with a memory-hard, salted KDF. Argon2id is the
current recommendation; bcrypt is acceptable for legacy systems; scrypt is a
reasonable alternative where Argon2 is unavailable. Never use SHA-256, MD5 or
a fast hash, even with a salt.

```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("hashing failure")
        .to_string()
}

fn verify_password(password: &str, encoded: &str) -> bool {
    let parsed = match PasswordHash::new(encoded) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

fn main() {
    let stored = hash_password("correct horse battery staple");
    println!("{} {}", verify_password("correct horse battery staple", &stored), verify_password("wrong", &stored));
}
```

Tune the parameters to your hardware: OWASP's baseline for Argon2id is 19 MiB
of memory, two iterations and one degree of parallelism, with higher costs where
latency allows. Store the full encoded hash (algorithm, parameters, salt, hash)
so parameters can evolve. Rehash on successful login when the stored parameters
are below the current policy. Compare with the verifier, which is constant-time;
do not compare hashes with `==`. Rate-limit login attempts and return a generic
message for both wrong user and wrong password to avoid account enumeration.

## 6.13 Secret management and zeroing memory

A secret in a `String` may be copied by a reallocation, left in a freed heap
page, or printed by a `Debug` implementation. `zeroize` overwrites memory
deterministically; `secrecy` adds a wrapper that refuses to print or compare
carelessly.

```rust
use secrecy::{ExposeSecret, SecretString};
use zeroize::Zeroizing;

fn main() {
    let password = SecretString::from("hunter2".to_string());
    println!("length {}", password.expose_secret().len()); // explicit access

    let mut key = Zeroizing::new([0_u8; 32]);
    key[0] = 7;
    // Zeroizing wipes the array when it drops.
    println!("{}", key[0]);
}
```

Zeroing is best-effort: the compiler may have copied the value to a register or
the stack, and the OS may have swapped the page. It reduces the window, it does
not guarantee erasure. Do not log secrets, do not include them in error
messages, and redact them in configuration dumps. Close file descriptors that
hold keys, and avoid `Clone` on secret types. On Linux, `mlock` can prevent
swapping but needs privileges and is not a substitute for a KMS.

## 6.14 Supply chain security: `cargo-audit`, `cargo-deny` and `cargo-vet`

A Rust build pulls hundreds of crates and their build scripts. Supply chain
security means knowing what you ship, pinning it, and responding to advisories.

```sh
cargo install cargo-audit cargo-deny cargo-vet
cargo audit                     # RustSec advisory database
cargo deny check advisories bans licenses sources
cargo vet                       # audited dependency review for organisations
cargo tree -d                   # duplicate versions
cargo outdated                  # newer versions available
```

```toml
# deny.toml
[advisories]
yanked = "deny"

[bans]
multiple-versions = "warn"
wildcards = "deny"

[licenses]
allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "Unicode-3.0"]

[sources]
unknown-registry = "deny"
unknown-git = "deny"
```

`cargo-audit` checks the lock file against RustSec advisories.
`cargo-deny` combines advisories, licence policy, duplicate/ban lists and source
restrictions. `cargo-vet` records human audits of dependencies and can require
them for every crate. Pin a committed `Cargo.lock` for binaries, review
dependency additions in pull requests, and avoid unnecessary build scripts and
proc macros in the dependency tree. `cargo-crev` adds web-of-trust reviews.
None of these tools replaces reading the diff when a dependency changes.

## 6.15 Fuzzing

Fuzzing throws generated inputs at a parser until it crashes or hangs. It is the
most effective way to find panics in decoders, protocol handlers and file
formats. `cargo-fuzz` uses libFuzzer on nightly; `afl.rs` uses AFL++; both
integrate with `arbitrary` for structured inputs.

```rust
// fuzz/fuzz_targets/parse.rs
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = my_crate::parse_message(data);
});
```

```sh
cargo install cargo-fuzz
cargo fuzz init
cargo fuzz run parse -- -max_total_time=60
cargo fuzz coverage parse
```

A fuzz target should assert the invariant you care about, not only "does not
crash": a round trip (`encode(decode(x)) == x`), a length bound, or a rejection
that must not allocate unboundedly. Seed the corpus with real messages and check
in regressions. Run fuzzing in CI for a bounded time on pull requests and
continuously on a dedicated worker. `proptest` complements fuzzing for
structured, shrinking inputs (section 9.6).

## 6.16 Formal verification: Kani, Prusti and Creusot

Testing samples inputs; verification proves a property for all inputs within a
model. Three Rust tools approach it differently:

- **Kani** compiles Rust to a bounded model checker. It can prove absence of
  panics and overflow for a bounded input size, and find counterexamples with a
  concrete trace. Annotate with `kani::proof`, `kani::assert` and
  `kani::cover`.
- **Prusti** verifies functions against preconditions and postconditions
  written in Rust-like specification syntax, using separation logic.
- **Creusot** translates Rust with contracts to Why3, which discharges proofs
  with SMT solvers; it handles ownership and aliasing precisely.

```rust
#[kani::proof]
fn addition_does_not_overflow() {
    let a: u8 = kani::any();
    let b: u8 = kani::any();
    kani::assume(a < 200 && b < 55);
    let sum = a as u16 + b as u16;
    assert!(sum <= u8::MAX as u16);
}
```

Formal verification is strongest for small, critical kernels: arithmetic,
state machines, parsers, consensus rules and cryptographic protocol logic. It
does not prove the specification matches the real world, and it does not scale
to an entire service. Use it where a bug is catastrophic, and pair it with
fuzzing and review. The [unsafe chapter](#unsafe) discusses the aliasing models
these tools encode.

## 6.17 Sandboxing and capability-based security

A process should hold only the capabilities it needs. Defence in depth:

- **Least privilege**: run as a non-root user, drop capabilities (`capset`,
  `libcap`), use a read-only root filesystem.
- **Seccomp**: restrict syscalls to an allow-list (Docker's default profile,
  `seccomp` crate, `landlock` for filesystem access).
- **Namespaces/cgroups**: containers, user namespaces, memory and CPU limits.
- **Wasm sandbox**: run untrusted plugins in Wasmtime with an explicit
  capability set and fuel/epoch limits ([chapter D12](#webassembly)).
- **Process isolation**: a separate service or worker for parsing untrusted
  files, with no network and a time limit.

```rust
// Wasmtime: no filesystem, no network, a fuel budget.
use wasmtime::{Config, Engine, Store};
use wasmtime_wasi::preview1::WasiP1Ctx;

fn engine() -> Engine {
    let mut config = Config::new();
    config.consume_fuel(true);
    config.wasm_component_model(true);
    Engine::new(&config).unwrap()
}

fn main() {
    let _ = (engine(), std::mem::size_of::<Store<WasiP1Ctx>>());
}
```

Capability security is a design principle: pass a handle to a specific resource
instead of granting a global namespace. A file descriptor is a capability; a
path is not. An API token scoped to one repository is a capability; a root token
is not. Sandboxing limits the blast radius when prevention fails.

## 6.18 Constant-time operations

A timing attack infers secrets from how long a comparison or branch takes. If a
comparison returns at the first differing byte, an attacker can recover a token
one byte at a time. Use constant-time equality for secrets and MACs.

```rust
use subtle::ConstantTimeEq;

fn verify_token(expected: &[u8], supplied: &[u8]) -> bool {
    if expected.len() != supplied.len() {
        return false; // length is not usually secret; compare content in CT
    }
    expected.ct_eq(supplied).into()
}

fn main() {
    println!("{} {}", verify_token(b"secret", b"secret"), verify_token(b"secret", b"secreu"));
}
```

Constant-time code must avoid data-dependent branches, memory indices and
variable-latency instructions. `subtle` provides `Choice` and constant-time
selection. Cryptographic crates already implement their comparisons in constant
time; the risk is in application code that writes `if supplied == expected` or
uses `HashMap` lookups keyed by a secret. Beware that the optimiser can
reintroduce branches; use `black_box`/`#[inline(never)]` deliberately and test
the generated assembly for hot paths. Timing attacks over a network are noisy
but practical; do not assume noise is protection.

## 6.19 Dependency auditing and minimal-dependency philosophy

Every dependency is code you did not review, executed with your privileges
(build scripts run at compile time, `proc-macro`s run in the compiler process).
Keep the tree small:

- Prefer the standard library and small, focused crates.
- Check maintenance activity, download counts and the number of transitive
  dependencies before adding a crate.
- Avoid crates with build scripts or proc macros unless the benefit is clear;
  they expand the attack surface and slow builds.
- Avoid duplicate major versions (`cargo tree -d`) and unmaintained crates
  (`cargo-audit`, `cargo-outdated`).
- Review features: default features often pull in more than you need
  (`default-features = false`).
- Vendor or mirror dependencies for reproducible, offline builds.

`cargo-deny` enforces bans and source restrictions; `cargo-machete` finds unused
dependencies; `cargo-udeps` (nightly) finds unused ones precisely. A minimal
dependency tree is also a smaller SBOM, a faster build and a smaller binary.

## 6.20 SBOM generation

A Software Bill of Materials lists every component, version and licence in an
artefact. It is required by regulation in some markets and invaluable during an
incident: "are we affected by this CVE?" becomes a query, not an archaeology
project.

```sh
cargo install cargo-sbom cargo-cyclonedx
cargo sbom --output-format spdx_json_2_3 > sbom.spdx.json
cargo cyclonedx --format json --all
```

Generate the SBOM in CI from the locked dependency graph, sign it (Sigstore
`cosign`, in-toto attestations), attach it to the release artefact, and store it
with the image digest. Include the Rust toolchain version and target triple;
the same source compiled with a different toolchain is a different artefact.
SPDX and CycloneDX are the common formats. `cargo-audit` can consume the
advisory database against the SBOM, and vulnerability scanners can ingest it
without rebuilding the project.

## 6.21 Secure deserialisation

Deserialisation is an attack surface because it turns bytes into typed values
and can allocate, recurse or execute constructors. Rules:

- Bound the input size before parsing, at the proxy and in the application.
- Prefer formats with explicit schemas and no executable features. Avoid
  formats that support arbitrary object graphs, custom tags or code execution.
- Reject unknown fields with `#[serde(deny_unknown_fields)]` where the schema is
  closed.
- Validate after deserialisation: `u8` parses but may be an invalid age; a
  `String` may be an invalid email.
- Limit nesting depth and collection lengths; a 10 MB JSON array of arrays can
  exhaust memory or stack.
- Do not use `bincode` on untrusted input without a length limit; its compact
  format has no self-describing bounds. Use `postcard` with explicit limits or a
  schema-checked format.
- Treat `serde`'s `Deserialize` implementation as code: a custom one can panic
  or allocate on hostile input.

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Message {
    id: u64,
    #[serde(default)]
    tags: Vec<String>,
}

fn parse_limited(input: &[u8]) -> Result<Message, &'static str> {
    const MAX: usize = 64 * 1024;
    if input.len() > MAX {
        return Err("payload too large");
    }
    let message: Message = serde_json::from_slice(input).map_err(|_| "invalid payload")?;
    if message.tags.len() > 32 || message.tags.iter().any(|tag| tag.len() > 64) {
        return Err("tag limit exceeded");
    }
    Ok(message)
}

fn main() {
    println!("{:?}", parse_limited(br#"{"id":1,"tags":["a"]}"#));
}
```

In Rust, deserialisation is memory-safe, so the classic Java-style gadget chains
are not the main risk. The risks are resource exhaustion, logic errors from
unvalidated invariants, and `unsafe` code inside a parser. Fuzz the parser and
enforce limits at the boundary.

## 6.22 Secrets in CI/CD pipelines

A pipeline is a high-privilege environment with access to source, registries and
production. Treat it as such:

- Use **OIDC short-lived credentials** (GitHub Actions → cloud role) instead of
  long-lived cloud keys.
- Store secrets in the platform's secret store, masked in logs; never echo them.
- Scope tokens to the minimum repository and permission; set `permissions:`
  explicitly in GitHub Actions (`contents: read` by default).
- Pin third-party actions to a commit SHA, not a tag; audit what they run.
- Do not expose secrets to pull requests from forks; use `pull_request_target`
  with extreme care.
- Use environment protection rules and required reviewers for production
  deploys.
- Rotate on any suspected leak and scan history (`gitleaks`, `trufflehog`).
- Prefer short-lived, per-job credentials over a shared vault token; log the
  identity, not the secret.

```yaml
permissions:
  contents: read
  id-token: write   # for OIDC, not for reading secrets

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/deploy
          aws-region: eu-west-1
```

A secret in an environment variable is visible to every process in the job,
including build scripts; prefer a file with restrictive permissions or a
short-lived token fetched at use time. `cargo` build scripts can read the
environment, which is another reason to audit dependencies (section 6.19).

## Exercises

:::exercise guided Fix the vulnerable handler
This handler concatenates a query, logs the password, renders HTML with
`format!` and compares a token with `==`. Rewrite it with parameter binding,
redacted logging, template escaping and a constant-time comparison. Explain each
change.

```rust
async fn login(pool: &sqlx::PgPool, email: &str, password: &str, token: &str) {
    let sql = format!("SELECT password_hash FROM users WHERE email = '{email}'");
    println!("login {email} {password}");
    let html = format!("<h1>Welcome {email}</h1>");
    if token == "expected" {
        println!("{html} {sql}");
    }
}
```
::hint
Use `sqlx::query_as("... WHERE email = $1").bind(email)`. Never log the
password; log a user id or an event with no secret. Use an escaping template or
`ammonia` for HTML. Use `subtle::ConstantTimeEq` for the token, and compare a
hash of the token if it is stored server-side.
::solution
```rust
use subtle::ConstantTimeEq;

#[derive(askama::Template)]
#[template(source = "<h1>Welcome {{ email }}</h1>", ext = "html")]
struct Welcome<'a> {
    email: &'a str,
}

async fn login(pool: &sqlx::PgPool, email: &str, password: &str, token: &str) -> bool {
    // Parameterised: the database parses data as a value, never as SQL.
    let stored: Option<(String,)> = sqlx::query_as("SELECT password_hash FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    // Verify with the password KDF, not by comparing plaintext.
    let valid = stored
        .as_ref()
        .map(|(hash,)| argon2::PasswordHash::new(hash).map(|parsed| {
            use argon2::password_hash::{PasswordVerifier, PasswordHasher};
            argon2::Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
        }).unwrap_or(false))
        .unwrap_or(false);

    // Log the event without the password or the token.
    tracing::info!(email_len = email.len(), valid, "login attempt");

    // Template interpolation escapes hostile characters in HTML context.
    let _page = Welcome { email }.render().unwrap_or_default();

    let expected = b"expected";
    let supplied = token.as_bytes();
    expected.len() == supplied.len() && expected.ct_eq(supplied).into()
}
```
:::

:::exercise practice Encrypt a record with a rotating key
Implement `encrypt_record(key_id, key, plaintext, aad)` returning
`(key_id, nonce, ciphertext)` and a decrypt function that selects the key by id
from a small keyring. Use ChaCha20-Poly1305, a random nonce and the record id in
the AAD. Write a test proving that swapping ciphertexts between records fails to
decrypt.
::hint
Store `HashMap<u8, [u8; 32]>` as the keyring. Encrypt with
`Payload { msg, aad }`; decrypt with the same AAD. Swapping the ciphertext
without changing the AAD makes the tag check fail. Return a `Result` rather than
panicking on authentication failure.
::solution
```rust
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
    ChaCha20Poly1305, Nonce,
};
use std::collections::HashMap;

struct Keyring {
    keys: HashMap<u8, [u8; 32]>,
}

struct Sealed {
    key_id: u8,
    nonce: [u8; 12],
    ciphertext: Vec<u8>,
}

impl Keyring {
    fn encrypt(&self, key_id: u8, plaintext: &[u8], aad: &[u8]) -> Result<Sealed, &'static str> {
        let key = self.keys.get(&key_id).ok_or("unknown key")?;
        let cipher = ChaCha20Poly1305::new(key.into());
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, Payload { msg: plaintext, aad })
            .map_err(|_| "encryption failed")?;
        Ok(Sealed { key_id, nonce: nonce.into(), ciphertext })
    }

    fn decrypt(&self, sealed: &Sealed, aad: &[u8]) -> Result<Vec<u8>, &'static str> {
        let key = self.keys.get(&sealed.key_id).ok_or("unknown key")?;
        let cipher = ChaCha20Poly1305::new(key.into());
        cipher
            .decrypt(Nonce::from_slice(&sealed.nonce), Payload { msg: &sealed.ciphertext, aad })
            .map_err(|_| "authentication failed")
    }
}

fn main() {
    let mut keys = HashMap::new();
    keys.insert(1, [7_u8; 32]);
    let keyring = Keyring { keys };

    let sealed = keyring.encrypt(1, b"balance=100", b"record-42").unwrap();
    assert_eq!(keyring.decrypt(&sealed, b"record-42").unwrap(), b"balance=100");
    assert!(keyring.decrypt(&sealed, b"record-43").is_err());
    println!("ok");
}
```
:::

:::exercise challenge Audit a dependency graph
Take a small Rust project, run `cargo deny check`, `cargo audit`, `cargo tree
-d` and `cargo tree --edges build,proc-macro`, and produce a short report: number
of dependencies, build scripts, proc macros, duplicate versions, licences and
any advisories. Remove one unnecessary dependency and measure the binary-size
change with `cargo bloat` or `cargo build --release` plus `ls -l`.
::hint
Start from `cargo new audit-demo`, add `serde`, `reqwest` and `clap` with default
features, then compare with `default-features = false` and a smaller HTTP client
such as `ureq`. `cargo tree --edges build` shows compile-time code that runs in
your build. Record the exact commands and results.
::solution
```sh
cargo new audit-demo
cd audit-demo
cargo add serde --features derive
cargo add reqwest --features json
cargo add clap --features derive

cargo install cargo-deny cargo-audit cargo-bloat --locked
cargo deny init
cargo deny check
cargo audit
cargo tree -d
cargo tree --edges build,proc-macro

cargo build --release
ls -l target/release/audit-demo

# Remove reqwest in favour of ureq and serde_json, then rebuild.
cargo remove reqwest
cargo add ureq
cargo add serde_json
cargo build --release
ls -l target/release/audit-demo
```

The report should say how many crates come from build scripts and proc macros,
which licences are present, whether any advisory affects the locked versions,
and how much binary and compile time the removal saved. A dependency count is
not a security score, but an unexplained build script is a reason to look.
:::

## Quiz

:::quiz Security check
? Why is `unsafe` a security concern even in Rust?
- It disables all compiler checks
+ It shifts the responsibility for memory-safety invariants to the programmer, so a violated contract can cause undefined behaviour
- It makes the binary larger
- It disables the borrow checker only at run time
= `unsafe` unlocks specific operations while the type system remains. A dangling raw pointer, aliasing mutable references or a bad `Send` impl can still produce memory unsafety.

? What makes a nonce safe for AES-GCM or ChaCha20-Poly1305?
- It must be secret
+ It must be unique for each encryption under the same key
- It must be 256 bits
- It can be reused if the plaintext is small
= AEAD security breaks catastrophically on nonce reuse under one key: confidentiality and integrity both fail. A random 96-bit nonce is standard, with a counter for high volume.

? Why is Argon2id preferred over SHA-256 for passwords?
- It produces a shorter hash
+ It is deliberately memory-hard and slow, which raises the cost of offline guessing
- It is reversible with the right key
- It never needs a salt
= Fast hashes let an attacker test billions of candidates per second. A memory-hard KDF makes parallel guessing expensive; each password still needs a unique salt.

? What is the purpose of `#[serde(deny_unknown_fields)]`?
- It encrypts unknown fields
+ It rejects payloads containing fields the schema does not define, catching typos and unexpected input
- It makes deserialisation constant-time
- It removes the need for validation
= A closed schema is easier to reason about: unknown fields fail loudly. It is not a substitute for validating lengths, ranges and semantic invariants.

? Which is the strongest reason to pin a GitHub Action to a commit SHA?
- It makes the workflow faster
+ A tag can be moved, so a mutable tag can run different code later
- It avoids needing a token
- It enables caching
= Third-party actions execute with your workflow's privileges. A commit SHA is immutable; a tag or branch is not.
:::

:::recap
- Safe Rust eliminates memory-safety bugs; `unsafe`, FFI and logic errors remain, so document and test every unsafe invariant.
- Validate at the boundary with allow-lists, length limits and newtypes; encode output for its context.
- Bind SQL parameters and whitelist identifiers; never concatenate input into a query.
- Escape HTML with an auto-escaping template; add CSP, cookie flags and trusted types.
- Protect cookie-authenticated state changes with CSRF tokens, `SameSite` and origin checks.
- Use AEADs with unique nonces and AAD; derive shared keys with X25519 plus HKDF; never invent crypto.
- Use Argon2id for passwords, a CSPRNG for tokens, and constant-time comparison for secrets.
- Keep keys in a KMS/HSM, rotate with key ids, and zero secret memory where the threat model warrants it.
- Configure TLS 1.3/1.2 with `rustls`, HSTS and a deliberate pinning policy.
- Audit dependencies with `cargo-audit`, `cargo-deny` and `cargo-vet`; keep the tree small.
- Fuzz parsers; verify critical kernels with Kani, Prusti or Creusot.
- Sandbox untrusted work with capabilities, seccomp or Wasm; enforce resource limits.
- Bound and validate deserialised input; reject unknown fields and oversized collections.
- Use OIDC short-lived credentials in CI, scope tokens, pin actions and scan for leaked secrets.
:::
