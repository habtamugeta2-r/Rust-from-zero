@id blockchain-development
@part def
@title Blockchain Development
@short Blockchain
@level advanced
@time 100
@learn Model accounts, state and transactions on Solana, Substrate, CosmWasm and NEAR | Write Anchor and CosmWasm programs with PDAs, CPIs and typed messages | Interact with Ethereum through `alloy`, JSON-RPC and ABI encoding | Apply hashing, signatures, Merkle trees and consensus to real designs | Build, test and reason about tokens, DeFi, bridges, oracles, MEV and DAOs

Blockchain systems are distributed state machines with adversarial participants.
Rust is the dominant implementation language for new layer-1 runtimes (Solana,
Polkadot/Substrate, NEAR, Cosmos chains) and for the client side of every major
network. This chapter teaches the programming models, the cryptographic
primitives and the economic patterns. It does not promise that a token will be
valuable; it promises that you can read and write the code.

Unlike most Definitive chapters, this one has no counterpart in the numbered
library: blockchain was outside the guide's scope until this track. The
prerequisites are therefore the language chapters, not a second treatment of
the same material — [chapter D1](#core-language) for the language and
[chapter D6](#security-engineering) for the cryptographic and hostile-input
thinking that §5.7 and §5.9 rely on. Read this chapter in order the first
time; there is no earlier version of it to skim.

:::warn Irreversibility and real money
A deployed program and a signed transaction are effectively irreversible. Test
on a local validator or devnet, assume every input is hostile, and never put a
private key in source control, a log or a browser. The [security chapter](#security-engineering)
applies with full force here: an integer overflow or a missing signer check can
drain a contract.
:::

:::analogy A public ledger as a shared spreadsheet
Imagine a spreadsheet that anyone can read, that no one can edit in place, and
that only changes by appending a signed row. Every participant keeps a copy; a
consensus rule decides which new rows are valid and in what order. A smart
contract is a formula in one cell that anyone may trigger, but only the ledger's
rules may change the value. The spreadsheet's history is the truth, not the
current screen.
:::

:::compare Solana, Substrate and CosmWasm
Solana offers high throughput with a single global state, cheap fees and an account model; programs are stateless and state lives in accounts. Substrate gives a full chain with runtime logic compiled to Wasm and upgradeable governance. CosmWasm runs contracts inside a Cosmos SDK chain with deterministic metering and IBC interoperability. The choice is about state model, upgrade policy and the ecosystem you must interoperate with, not raw speed alone.
:::


## 5.1 The mental model and where Rust fits

Every chain answers four questions differently: who owns state (accounts,
UTXOs, cells), how state changes (transactions, extrinsics, messages), who
executes (every validator, a subset, or an off-chain prover), and how the
network agrees (Nakamoto longest-chain, BFT voting, or a hybrid). Before
writing code, identify the chain's **account model** and **execution model**;
most bugs come from assuming another chain's model.

| Ecosystem | State | Execution | Rust role |
| --- | --- | --- | --- |
| Solana | accounts owned by programs | programs are stateless, accounts passed explicitly | on-chain programs (Anchor), clients |
| Substrate/Polkadot | storage maps in a runtime | WASM runtime, pallets composed into a chain | pallets, runtimes, node |
| CosmWasm | contract key-value storage | WASM contracts on Cosmos SDK chains | contracts, schemas, clients |
| NEAR | account-scoped storage | WASM contracts, sharded | contracts, clients |
| Ethereum | account balances + storage | EVM bytecode | clients, tooling, zk/rollup infrastructure |

Rust compiles to BPF/eBPF (Solana), WASM (Substrate, CosmWasm, NEAR) and native
binaries for nodes and clients. The same language serves very different
runtimes; the constraints (no floating point on Solana, deterministic execution,
metered compute, bounded stack) are part of each target.

## 5.2 Solana: programs, accounts, PDAs, CPIs, SPL Token and extensions

Solana separates **code** (a program) from **state** (accounts). A program is
stateless: every instruction lists the accounts it reads or writes, and the
runtime enforces ownership and signer privileges. An account has an address, a
lamport balance, an owner program, data and an executable flag. Only the owner
may modify the data. **Rent** is charged for storage; an account with two years
of rent is rent-exempt.

### The Anchor program structure

Anchor is the standard framework: it generates account validation, instruction
dispatch, IDL (interface description), error codes and TypeScript clients.

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.authority = ctx.accounts.authority.key();
        counter.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1).ok_or(CounterError::Overflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 32 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, has_one = authority)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}

#[error_code]
pub enum CounterError {
    #[msg("counter overflow")]
    Overflow,
}
```

`#[derive(Accounts)]` is a validation schema, not a hint: `init` creates the
account and charges the payer, `mut` requires writability, `Signer` requires a
signature, `has_one` checks a stored key, and `space` reserves exactly the
serialised size plus the 8-byte discriminator. A missing `mut` or `Signer` is
usually a compile-time error, which is the main reason to use Anchor rather
than raw `solana-program`.

### PDAs (Program Derived Addresses)

A PDA is an address derived from seeds and a program id that is **off the ed25519
curve**, so no private key exists for it; only the owning program can sign for
it via `invoke_signed`. PDAs give programs deterministic, permissionless state
addresses without a registry.

```rust
#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::LEN,
        seeds = [b"vault", authority.key().as_ref(), &seed.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub balance: u64,
}

impl Vault {
    pub const LEN: usize = 32 + 8;
}
```

Anchor stores the bump in the account automatically when the `bump` constraint
is used. Use `seeds` and `bump` for every PDA lookup so an attacker cannot
substitute a look-alike account. The seed space is limited (each seed ≤ 32
bytes, at most 16 seeds); hashing long inputs is a common pattern.

### CPI (Cross-Program Invocations)

A CPI calls another program from inside yours. The called program sees the
accounts you pass, and only the caller's signature privileges propagate unless
you sign with a PDA.

```rust
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let transfer = Transfer {
        from: ctx.accounts.user_token.to_account_info(),
        to: ctx.accounts.vault_token.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let accounts = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer);
    token::transfer(accounts, amount)?;

    let vault = &mut ctx.accounts.vault;
    vault.balance = vault.balance.checked_add(amount).ok_or(CounterError::Overflow)?;
    Ok(())
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64, bump: u8) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    let seeds: &[&[u8]] = &[b"vault", authority.as_ref(), &[bump]];
    let signer: &[&[&[u8]]] = &[seeds];

    let transfer = Transfer {
        from: ctx.accounts.vault_token.to_account_info(),
        to: ctx.accounts.user_token.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let accounts = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer,
        signer,
    );
    token::transfer(accounts, amount)?;
    Ok(())
}
```

`CpiContext::new_with_signer` is how a PDA authorises a transfer from an account
it owns. Re-entrancy is possible; Solana limits CPI depth (4 by default) but not
the instruction re-entry pattern, so update state before the CPI when the
invariant matters.

### SPL Token and token extensions

The SPL Token program owns mint and token accounts. A **mint** defines supply,
decimals, mint authority and freeze authority; an **associated token account**
(ATA) is a deterministic token account for `(wallet, mint)`. Token-2022 (token
extensions) adds transfer fees, interest-bearing tokens, non-transferable
tokens, confidential transfers, metadata and permanent delegates.

```rust
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct CreateAta<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program,
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
```

Use `InterfaceAccount` and `Interface<TokenInterface>` to support both the
legacy token program and Token-2022. Token extensions change the risk surface:
a transfer-fee mint takes a cut, a permanent delegate can move tokens, and
confidential transfers change what an observer can see. Read the extensions on
the mint before integrating.

## 5.3 Substrate and Polkadot: pallets, runtimes and FRAME

Substrate is a framework for building chains. A **runtime** is a WASM state
transition function composed of **pallets** (modules). FRAME provides the macros
for storage, dispatchable calls, events, errors and configuration. A
**relay chain** secures parachains through shared validators and XCM messaging.

```rust
#[frame_support::pallet]
pub mod pallet {
    use frame_support::pallet_prelude::*;
    use frame_system::pallet_prelude::*;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        #[pallet::constant]
        type MaxNameLength: Get<u32>;
    }

    #[pallet::storage]
    pub type Counters<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, u32, ValueQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        Incremented { who: T::AccountId, value: u32 },
    }

    #[pallet::error]
    pub enum Error<T> {
        Overflow,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(10_000)]
        pub fn increment(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;
            Counters::<T>::try_mutate(&who, |value| -> Result<(), Error<T>> {
                *value = value.checked_add(1).ok_or(Error::<T>::Overflow)?;
                Self::deposit_event(Event::Incremented { who: who.clone(), value: *value });
                Ok(())
            })?;
            Ok(())
        }
    }
}
```

`ensure_signed` enforces that the extrinsic comes from a signed account;
`ensure_root` is for governance. Storage items (`StorageValue`, `StorageMap`,
`StorageDoubleMap`) are Merkle-trie-backed key-value maps with explicit hashers;
choose a hasher that fits the key (`Blake2_128Concat` for general keys,
`Twox64Concat` for non-adversarial keys). **Extrinsics** are the signed or
inherent calls; `#[pallet::call_index]` pins the encoding, and changing it is a
breaking runtime upgrade. **Weights** declare the computational cost and must be
benchmarked, not guessed. Events and errors are part of the runtime metadata and
the client contract.

The runtime composes the pallets:

```rust
construct_runtime!(
    pub enum Runtime {
        System: frame_system = 0,
        Balances: pallet_balances = 1,
        Counter: pallet_counter = 2,
    }
);
```

A runtime upgrade replaces the WASM blob through governance; storage migrations
(`on_runtime_upgrade`) must be versioned and tested. Polkadot adds shared
security, XCM for cross-chain messages and parachain slots; the same FRAME
skills apply to solo chains, parachains and parathreads.

## 5.4 CosmWasm: messages, state and replies

CosmWasm contracts are WASM modules on Cosmos SDK chains. They communicate by
**messages**, not by calling each other directly. The entry points are
`instantiate`, `execute`, `query`, `migrate`, `reply` and `sudo`.

```rust
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult, Uint128,
};
use cw_storage_plus::Item;

#[cw_serde]
pub struct InstantiateMsg {
    pub owner: String,
    pub count: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    Increment {},
    SetCount { value: u64 },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(CountResponse)]
    GetCount {},
}

#[cw_serde]
pub struct CountResponse {
    pub count: u64,
    pub owner: String,
}

pub const STATE: Item<State> = Item::new("state");

#[cw_serde]
pub struct State {
    pub owner: cosmwasm_std::Addr,
    pub count: u64,
}

#[entry_point]
pub fn instantiate(deps: DepsMut, _env: Env, info: MessageInfo, msg: InstantiateMsg) -> StdResult<Response> {
    let owner = deps.api.addr_validate(&msg.owner)?;
    STATE.save(deps.storage, &State { owner, count: msg.count })?;
    Ok(Response::new().add_attribute("action", "instantiate"))
}

#[entry_point]
pub fn execute(deps: DepsMut, _env: Env, info: MessageInfo, msg: ExecuteMsg) -> StdResult<Response> {
    let mut state = STATE.load(deps.storage)?;
    match msg {
        ExecuteMsg::Increment {} => {
            state.count += 1;
        }
        ExecuteMsg::SetCount { value } => {
            if info.sender != state.owner {
                return Err(cosmwasm_std::StdError::generic_err("unauthorised"));
            }
            state.count = value;
        }
    }
    STATE.save(deps.storage, &state)?;
    Ok(Response::new().add_attribute("count", state.count.to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetCount {} => {
            let state = STATE.load(deps.storage)?;
            to_json_binary(&CountResponse { count: state.count, owner: state.owner.to_string() })
        }
    }
}
```

State lives in `cw_storage_plus` maps (`Item`, `Map`, `IndexedMap`); there is no
global mutable state. Contract-to-contract calls are messages returned in
`Response::add_message` (fire-and-forget) or `add_submessage` (with a `reply`
handler). `reply` receives the result of a submessage and a `reply_id`; use it
to roll back or continue a multi-step flow. Funds sent with `info.funds` must be
validated, and `info.sender` must be checked for every privileged action.
`migrate` must guard the contract version and migrate storage explicitly.

## 5.5 NEAR Protocol: `near-sdk-rs`

NEAR contracts are WASM modules attached to accounts. `near-sdk` provides
`#[near(contract_state)]`, `#[near]` implementations, JSON-serialised arguments,
persistent collections and cross-contract promises.

```rust
use near_sdk::{env, near, AccountId, NearToken, Promise};

#[near(contract_state)]
pub struct Counter {
    owner: AccountId,
    count: u64,
}

#[near]
impl Counter {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self { owner, count: 0 }
    }

    #[payable]
    pub fn increment(&mut self) -> u64 {
        assert_eq!(env::attached_deposit(), NearToken::from_yoctonear(1), "attach 1 yoctoNEAR");
        self.count += 1;
        self.count
    }

    pub fn get_count(&self) -> u64 {
        self.count
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn call_other(&self, other: AccountId) -> Promise {
        Promise::new(other).transfer(NearToken::from_yoctonear(1))
    }
}
```

`#[payable]` is required for methods that accept attached deposits; without it
the runtime rejects value. State is stored under the contract account, with
`LookupMap`, `UnorderedMap` and `TreeMap` for larger collections; every storage
write costs gas and storage is rented. Cross-contract calls return a `Promise`;
resume logic belongs in `#[private]` callbacks that check the caller is the
contract itself. `env::predecessor_account_id()` is the immediate caller;
`env::current_account_id()` is the contract. The NEAR test runner
(`near-workspaces`) runs the real contract in a sandbox.

## 5.6 Ethereum interaction: `alloy`, `ethers-rs`, JSON-RPC and the ABI

Rust clients talk to Ethereum nodes over JSON-RPC. `alloy` is the modern
successor to `ethers-rs` (which remains widely deployed). Both provide typed
providers, signers, contract bindings and ABI codecs.

```rust
use alloy::{
    primitives::{address, U256},
    providers::ProviderBuilder,
    sol,
};

sol! {
    #[sol(rpc)]
    contract IERC20 {
        function balanceOf(address owner) external view returns (uint256);
        function transfer(address to, uint256 amount) external returns (bool);
        event Transfer(address indexed from, address indexed to, uint256 value);
    }
}

async fn balance(rpc_url: &str, token: alloy::primitives::Address, owner: alloy::primitives::Address) -> eyre::Result<U256> {
    let provider = ProviderBuilder::new().on_http(rpc_url.parse()?);
    let contract = IERC20::new(token, provider);
    Ok(contract.balanceOf(owner).call().await?._0)
}

fn main() {
    let _ = address!("0000000000000000000000000000000000000000");
}
```

`sol!` generates Rust types, selectors and event decoders from Solidity
signatures. The function selector is the first four bytes of
`keccak256("balanceOf(address)")`; arguments are ABI-encoded (32-byte words,
dynamic types with offsets). `alloy` exposes `abi_encode`, `abi_decode` and
`SolType` for manual work. JSON-RPC methods worth knowing: `eth_call`,
`eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_getLogs`,
`eth_feeHistory`, `eth_estimateGas` and `eth_chainId`. Handle chain
reorganisations: wait for confirmations, compare block hashes, and treat a
receipt as provisional until the finality depth your risk model requires.

```rust
// ethers-rs equivalent, still common in production code.
use ethers::prelude::*;

async fn block_number_ethers(provider: Provider<Http>) -> Result<U64, ProviderError> {
    provider.get_block_number().await
}
```

Never hand-roll a signature or nonce manager for production without tests: `alloy` and `ethers` handle EIP-1559 fees, nonce gaps and retries. Keep the chain id in the signed payload; a transaction signed for one chain must be invalid on another.

## 5.7 Cryptographic primitives: hashes, signatures, Merkle trees and zk

A blockchain is a hash-linked data structure plus a signature scheme plus a
consensus rule. Use audited crates; do not implement primitives from memory.

**Hashing.** SHA-256 (`sha2`), Keccak-256 (`sha3`/`tiny-keccak`, the Ethereum
hash), BLAKE2 (`blake2`) and BLAKE3 (`blake3`, fast and parallel) are the common
choices. A hash is not encryption and not a commitment on its own unless it is
binding and hiding (add a random salt for commitments).

```rust
use sha2::{Digest, Sha256};
use sha3::Keccak256;

fn main() {
    let data = b"transfer 10";
    let sha = Sha256::digest(data);
    let keccak = Keccak256::digest(data);
    println!("{:x}", sha);
    println!("{:x}", keccak);
}
```

**Signatures.** Ed25519 (`ed25519-dalek`) is fast, deterministic and used by
Solana, NEAR and many Cosmos chains. secp256k1 ECDSA (`k256`) is used by Bitcoin
and Ethereum; ECDSA needs a unique nonce or a deterministic nonce (RFC 6979),
because nonce reuse reveals the private key. Schnorr signatures over secp256k1
(`secp256k1` crate) are used by Taproot and some rollups. Verify against the
message hash and the expected public key; never accept a signature without
checking which key produced it.

```rust
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier};
use rand_core::OsRng;

fn main() {
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key = signing_key.verifying_key();
    let message = b"vote yes";
    let signature: Signature = signing_key.sign(message);
    assert!(verifying_key.verify(message, &signature).is_ok());
    println!("{} bytes", signature.to_bytes().len());
}
```

**Merkle trees.** A Merkle tree hashes leaves, then pairs of hashes, up to a
root. A membership proof is the sibling path; verifying it costs
`O(log n)` hashes. Ethereum's state trie and Solana's account proofs use
variants; a simple binary tree is enough to understand the idea.

```rust
use sha2::{Digest, Sha256};

fn hash(a: &[u8], b: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(a);
    hasher.update(b);
    hasher.finalize().into()
}

fn root(leaves: &[Vec<u8>]) -> [u8; 32] {
    let mut level: Vec<[u8; 32]> = leaves
        .iter()
        .map(|leaf| Sha256::digest(leaf).into())
        .collect();
    while level.len() > 1 {
        level = level
            .chunks(2)
            .map(|pair| {
                let right = pair.get(1).copied().unwrap_or(pair[0]);
                hash(&pair[0], &right)
            })
            .collect();
    }
    level[0]
}

fn main() {
    let root = root(&[b"a".to_vec(), b"b".to_vec(), b"c".to_vec()]);
    println!("{:x?}", &root[..4]);
}
```

**Zero-knowledge proofs.** zk-SNARKs (Groth16, PLONK, Halo2) prove knowledge of
a witness without revealing it, with a short proof and fast verification; they
need a trusted setup or a universal setup. zk-STARKs avoid a trusted setup and
scale better for large computations, at the cost of larger proofs. In Rust,
`arkworks`, `halo2`, `bellman` and `risc0`/`sp1` (zkVM) are the main toolkits.
A zk circuit is a program over a finite field; the engineering work is in the
constraint system, not in the proof library. Get an audit before value is at
stake.

## 5.8 Consensus mechanisms

**Proof of Work (PoW)** picks the next block by computational effort; the
longest chain with the most work wins. It tolerates Byzantine faults below 50%
of hash power and is expensive in energy. **Proof of Stake (PoS)** weights
validators by stake; finality comes from checkpoint voting (Casper FFG, Tendermint)
or from probabilistic confirmation (Solana's Tower BFT, Ethereum's LMD-GHOST +
Casper). Slashing punishes equivocation and double voting.

**BFT consensus** (Tendermint/Cosmos, HotStuff, Narwhal/Bullshark) reaches
deterministic finality with `3f + 1` validators tolerating `f` Byzantine
faults. It needs two rounds of voting and a leader; liveness fails if more than
`f` are offline. **Aura/BABE** in Polkadot: Aura selects block authors by a
round-robin of authorities; BABE adds a verifiable random function for slot
assignment. GRANDPA finalises the chain separately from block production.

| Property | PoW | BFT PoS | Chain-based PoS |
| --- | --- | --- | --- |
| Finality | probabilistic | deterministic | probabilistic + checkpoints |
| Fault tolerance | 50% hash power | 1/3 stake | 1/3 to 1/2 depending on rule |
| Energy | high | low | low |
| Typical Rust stacks | Bitcoin (C), `rust-bitcoin` | Cosmos/Substrate | Solana, Ethereum clients |

Consensus code is the least forgiving code in the industry: timing assumptions,
network partitions and adversarial reordering are normal. Use a mature runtime
rather than writing consensus for a new chain unless that is the product.

## 5.9 Wallet integration and key management

A wallet is a signing interface, not a token. It holds or unlocks a key,
produces signatures and broadcasts transactions. Integration options:

- **Browser wallet** (Phantom, Solflare, MetaMask): connect through the injected
  provider or WalletConnect; never request the seed phrase.
- **Embedded wallet / KMS**: the server holds keys in HSM/KMS and signs on
  behalf of the user; this is custody, with legal and security obligations.
- **Hardware wallet**: sign on-device; the host sees only public keys and
  signed payloads.
- **Smart contract wallet**: an account contract with multisig, social recovery
  or session keys (ERC-4337 account abstraction).

```rust
use solana_sdk::signature::{Keypair, Signer};

fn sign_message(keypair: &Keypair, message: &[u8]) -> Vec<u8> {
    keypair.sign_message(message).as_ref().to_vec()
}

fn main() {
    let keypair = Keypair::new();
    println!("{}", keypair.pubkey());
    println!("{}", sign_message(&keypair, b"login").len());
}
```

Never log a secret key, never derive one from a weak password (use a KDF), and
never reuse a nonce for ECDSA. Store seeds in an encrypted keystore with a
strong KDF (Argon2id) and a separate passphrase. Rotate operational keys, use
multisig for treasury actions, and separate hot signing keys from cold custody.
`zeroize` the key material after use where the threat model warrants it. Test
recovery: a backup you have never restored is not a backup.

## 5.10 RPC client development

An RPC client is a reliability layer around an unreliable endpoint. It needs
retries with jitter, timeouts, rate-limit handling, failover across providers,
and confirmation tracking.

```rust
use reqwest::Client;
use serde_json::json;
use std::time::Duration;

async fn latest_slot(url: &str) -> Result<u64, reqwest::Error> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    let response: serde_json::Value = client
        .post(url)
        .json(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSlot",
            "params": []
        }))
        .send()
        .await?
        .json()
        .await?;
    Ok(response["result"].as_u64().unwrap_or(0))
}

fn main() {
    let _ = latest_slot;
}
```

For Solana, use `solana-client`/`solana-rpc-client` rather than raw JSON. For
Ethereum, `alloy`'s provider includes retries and fee estimation. Cache
immutable data, batch requests where the provider allows it, and treat an RPC
response as a hint until a transaction is confirmed. Watch for rate limits: a
`429` needs exponential backoff with jitter, not an immediate retry. Run your
own node for latency-sensitive or high-volume workloads.

## 5.11 Token standards

| Standard | Chain | Shape | Key operations |
| --- | --- | --- | --- |
| SPL Token | Solana | mint + token accounts | `mint_to`, `transfer`, `burn`, `freeze` |
| Token-2022 | Solana | SPL + extensions | transfer fees, metadata, confidential transfers |
| ERC-20 | EVM | fungible balances | `transfer`, `approve`, `transferFrom`, `totalSupply` |
| ERC-721 | EVM | non-fungible token ids | `ownerOf`, `safeTransferFrom`, `tokenURI` |
| ERC-1155 | EVM | multi-token (fungible + NFT) | `balanceOf`, `safeBatchTransferFrom` |
| PSP-22 | ink! / Substrate | fungible token | `PSP22Trait` |
| PSP-34 | ink! / Substrate | NFT | `PSP34Trait` |

ERC-20's `approve`/`transferFrom` pattern is a standing security hazard: an
allowance can be spent by a contract before the owner revokes it, and the
classic `approve` race lets a spender spend the old and new allowance. Use
`increaseAllowance`/`decreaseAllowance` or permit-based flows. ERC-721's
`safeTransferFrom` calls `onERC721Received` on a contract recipient; a
reentrant receiver that calls back before state is updated is the classic
minting vulnerability. OpenZeppelin's audited implementations and Solana's
Anchor constraints are the baseline; a custom token should be an exception with
a reason.

## 5.12 DeFi primitives

**Automated market maker (AMM).** A constant-product pool holds reserves `x`
and `y` and enforces `x * y = k`. A swap adds `dx` and removes
`dy = y - k / (x + dx)`. The price is `x / y`; a large trade moves it, which is
slippage. Liquidity providers earn fees proportional to their share.

```text
dy = y - (x * y) / (x + dx)
fee: dx_effective = dx * (1 - fee_bps / 10_000)
price impact ≈ dx / (x + dx)
```

**Lending.** A borrower supplies collateral worth more than the loan
(loan-to-value), and a liquidation threshold triggers when the collateral price
falls. The health factor is
`collateral_value * liquidation_threshold / debt_value`; below 1, liquidators
repay debt and seize collateral with a bonus. Oracle manipulation is the main
attack: a spot price from a thin pool can be moved within one transaction. Use
time-weighted average prices or multiple oracles.

**Staking.** Validators and delegators lock tokens; rewards come from inflation
or fees; unbonding takes days. Liquid staking issues a derivative token
representing the staked position. Slashing risk and validator commission are
part of the yield, not footnotes.

Every DeFi invariant should be a test: `k` never decreases after a swap (except
for fees), total shares equal total assets, a liquidation cannot leave bad
debt under the stated assumptions. Property tests with `proptest` and invariant
tests on a fork are worth more than another dashboard.

## 5.13 Cross-chain bridges and interoperability

Bridges move value or messages between chains. The main designs:

- **Lock-and-mint**: lock on chain A, mint a wrapped asset on B; burn on B to
  unlock on A. Custody risk sits with the bridge's validators or multisig.
- **Light client**: chain B verifies A's consensus proofs. Trust-minimised but
  expensive and chain-specific.
- **Relay / optimistic**: a relayer submits messages with a challenge period.
- **Liquidity network**: market makers front liquidity on both sides; the
  bridge settles later.

Rust tooling includes `xcm` for Polkadot, `ibc-rs` for Cosmos, `wormhole` and
`layerzero` SDKs for EVM/Solana, and `alloy`/`solana-client` for the endpoints.
Bridges have historically lost more value than any other category. Threat-model
the signer set, replay protection (chain id, nonce, message hash), finality
assumptions, validator key compromise and upgradeability. A message must be
verified on the destination chain, not merely relayed by a trusted server.

## 5.14 On-chain versus off-chain computation, oracles

On-chain computation is expensive, public and deterministic. Off-chain
computation is cheap and private but needs a trust anchor to affect the chain.
Put the invariant on-chain (balances, ownership, signatures) and the heavy
computation off-chain with a proof or an attestation.

**Oracles** bring external data on-chain. Chainlink uses a decentralised network
of node operators and aggregated reports; Pyth publishes signed price updates
that anyone can submit and verify on-chain. A commit-reveal scheme hides
values until a deadline. A zk-proof can prove an off-chain computation without
revealing inputs.

```rust
// Pyth-style: a signed price update is verified by the on-chain program.
// The client fetches the update off-chain, then submits it in the transaction.
struct PriceUpdate {
    feed_id: [u8; 32],
    price: i64,
    confidence: u64,
    exponent: i32,
    publish_time: i64,
}

fn is_fresh(update: &PriceUpdate, now: i64, max_age: i64) -> bool {
    now - update.publish_time <= max_age
}

fn main() {
    let update = PriceUpdate { feed_id: [0; 32], price: 100, confidence: 1, exponent: -8, publish_time: 1 };
    println!("{}", is_fresh(&update, 2, 60));
}
```

Every oracle design must answer: who can update, how stale may data be, what
happens during an outage, and how is manipulation detected? A price with no
freshness check is a price an attacker can freeze. Chapter D7 covers the
off-chain inference side.

## 5.15 Testing blockchain programs

**Solana.** `solana-program-test` starts an in-process bank and runs
instructions; `anchor test` runs a local validator with TypeScript tests;
`bankrun` (now part of `surfpool`) provides fast program tests in TypeScript;
`mollusk` is a lightweight SVM harness in Rust. Test failure paths, not only
the happy path: missing signer, wrong PDA, reinitialisation, overflow, CPI
failure.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::system_program;
    use solana_program_test::ProgramTest;

    #[tokio::test]
    async fn initialize_sets_zero() {
        let program = ProgramTest::new("counter", counter::id(), None);
        let mut context = program.start_with_context().await;
        // Build and send the initialize instruction, then read the account.
        let _ = (&mut context, system_program::id());
    }
}
```

**CosmWasm.** `cw-multi-test` provides a mock chain with contracts, bank,
wasm and custom queriers; unit tests call entry points directly with
`mock_dependencies`. The TypeScript `@cosmjs/cosmwasm-stargate` and Mocha are
used for end-to-end tests against `wasmd`. Test `reply` paths by making a
submessage fail.

**NEAR.** `near-workspaces` spins up a sandbox and deploys the real WASM,
including cross-contract calls. **Substrate.** `cargo test -p pallet-*` plus
`frame-benchmarking` for weights; `try-runtime` for storage migrations.

General rules: use deterministic clocks and addresses, snapshot/fork the state
you depend on, fuzz arithmetic, and assert the invariants after every action.
Upgrade tests are as important as initial deployment tests.

## 5.16 Transaction simulation, optimisation and fee estimation

Solana transactions have a 1,232-byte packet limit, a compute-unit budget
(200,000 per instruction by default, 1.4 million per transaction maximum) and
priority fees. Simulate before sending (`simulateTransaction` with
`replaceRecentBlockhash`), inspect logs and compute units, and set a compute
unit limit with a margin.

```rust
use solana_client::rpc_client::RpcClient;
use solana_sdk::transaction::Transaction;

fn simulate(client: &RpcClient, transaction: &Transaction) {
    match client.simulate_transaction(transaction) {
        Ok(result) => {
            println!("units: {:?}", result.value.units_consumed);
            println!("logs: {:?}", result.value.logs);
        }
        Err(error) => eprintln!("simulation failed: {error}"),
    }
}
```

Ethereum fees are `base_fee + priority_fee` under EIP-1559; estimate with
`eth_feeHistory`, set a `max_fee_per_gas` cap, and never hard-code a gas price.
Batch operations, avoid redundant account writes, and move large loops
off-chain. On Solana, use address lookup tables to fit more accounts, and
request a higher compute limit only when simulation shows it is needed.
Priority fees are a market: a fee too low means the transaction is dropped, a
fee too high means overpaying. Simulate, measure, then set limits.

## 5.17 MEV (Maximal Extractable Value)

MEV is value extracted by choosing the order, inclusion or exclusion of
transactions. Common forms: **front-running** (buy before a large trade),
**back-running** (arbitrage after it), **sandwiching** (buy, let the victim
move the price, sell), **liquidation** and **NFT sniping**. On Ethereum,
searchers submit bundles to block builders; proposer-builder separation (PBS)
and MEV-Boost route blocks through relays.

Defences: submit through a private mempool or a protected RPC, use slippage
limits and deadlines, split large trades, use commit-reveal or batch auctions,
and prefer protocols with frequent uniform-price auctions. On Solana, Jito
bundles and the block engine dominate. MEV is not only an attack: arbitrage
keeps prices aligned and liquidations keep lending protocols solvent. If you
build a DEX, assume an adversary simulates every transaction before it lands.

## 5.18 DAO governance patterns

A DAO is a set of on-chain rules for proposing, voting, timelocking and
executing changes. The pieces:

- **Token or membership voting**, with delegation and checkpoints (voting power
  at a past block, not the current one, to prevent flash-loan governance).
- **Proposal lifecycle**: create, delay, vote, quorum, succeed, queue, timelock,
  execute, cancel.
- **Timelock** gives users an exit window before a change takes effect.
- **Multisig execution** for treasury operations; threshold signatures.
- **Upgrade authority** should be a governance process, not a single key.

```rust
enum ProposalState {
    Pending,
    Active,
    Defeated,
    Succeeded,
    Queued,
    Executed,
    Cancelled,
}

struct Proposal {
    id: u64,
    proposer: [u8; 32],
    for_votes: u128,
    against_votes: u128,
    start: i64,
    end: i64,
    eta: Option<i64>,
    executed: bool,
}

fn state(proposal: &Proposal, now: i64, quorum: u128, timelock: i64) -> ProposalState {
    if proposal.executed {
        return ProposalState::Executed;
    }
    if now < proposal.start {
        return ProposalState::Pending;
    }
    if now <= proposal.end {
        return ProposalState::Active;
    }
    if proposal.for_votes <= proposal.against_votes || proposal.for_votes < quorum {
        return ProposalState::Defeated;
    }
    match proposal.eta {
        None => ProposalState::Succeeded,
        Some(eta) if now < eta + timelock => ProposalState::Queued,
        Some(_) => ProposalState::Succeeded,
    }
}
```

Reference implementations include OpenZeppelin Governor (EVM), SPL Governance
(Solana) and Polkadot's OpenGov (Substrate). Governance attacks usually exploit
voting-power snapshots, flash loans, low quorum or a fast timelock. Audit the
state machine and simulate an adversarial proposal before launch.

## Exercises

:::exercise guided Anchor counter with a PDA
Write an Anchor program with `initialize` and `increment` instructions where the
counter is a PDA derived from `[b"counter", authority.key()]`. Enforce that only
the authority can increment, use checked arithmetic, and close the account on
`close`. List the accounts each instruction needs and why each constraint is
present.
::hint
Use `#[account(init, payer = authority, space = 8 + 8 + 32, seeds = [b"counter", authority.key().as_ref()], bump)]`.
For `increment`, use `has_one = authority` and `Signer`. For `close`, use
`#[account(mut, close = authority, has_one = authority)]`. `Counter::LEN` should
be 8 bytes for `count` plus 32 for the stored authority.
::solution
```rust
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.authority = ctx.accounts.authority.key();
        counter.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1).ok_or(ErrorCode::Overflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Counter::LEN,
        seeds = [b"counter", authority.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, has_one = authority, seeds = [b"counter", authority.key().as_ref()], bump)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}

impl Counter {
    pub const LEN: usize = 32 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("counter overflow")]
    Overflow,
}
```

The seeds in `Increment` repeat the derivation so the PDA cannot be swapped for
another user's counter. `has_one` proves the stored authority matches the
signer; `Signer` proves the signature. The `system_program` is required only for
`init`, because creating an account is a CPI to the system program.
:::

:::exercise practice A CosmWasm counter with an owner-only setter
Implement `InstantiateMsg { owner }`, `ExecuteMsg::{Increment, SetCount}` and
`QueryMsg::GetCount`. Only the owner may call `SetCount`; everyone may
increment. Add unit tests with `mock_dependencies` for the happy path and the
unauthorised path.
::hint
Store `State { owner: Addr, count: u64 }` in an `Item`. In `execute`, load the
state, match the message, check `info.sender == state.owner` for `SetCount`, and
save. In tests, use `mock_info("owner", &[])` and `mock_info("intruder", &[])`.
::solution
```rust
use cosmwasm_std::{
    testing::{mock_dependencies, mock_env, mock_info},
    Addr, DepsMut, Response, StdError, StdResult,
};
use cw_storage_plus::Item;

pub const STATE: Item<State> = Item::new("state");

#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub owner: Addr,
    pub count: u64,
}

pub fn instantiate(deps: DepsMut, owner: &str) -> StdResult<Response> {
    STATE.save(deps.storage, &State { owner: deps.api.addr_validate(owner)?, count: 0 })?;
    Ok(Response::new())
}

pub fn execute(deps: DepsMut, sender: &str, set: Option<u64>) -> StdResult<Response> {
    let mut state = STATE.load(deps.storage)?;
    match set {
        Some(value) => {
            if state.owner.as_str() != sender {
                return Err(StdError::generic_err("unauthorised"));
            }
            state.count = value;
        }
        None => state.count += 1,
    }
    STATE.save(deps.storage, &state)?;
    Ok(Response::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_can_set_and_others_cannot() {
        let mut deps = mock_dependencies();
        instantiate(deps.as_mut(), "owner").unwrap();
        execute(deps.as_mut(), "owner", Some(5)).unwrap();
        assert_eq!(STATE.load(&deps.storage).unwrap().count, 5);
        assert!(execute(deps.as_mut(), "intruder", Some(9)).is_err());
        execute(deps.as_mut(), "intruder", None).unwrap();
        assert_eq!(STATE.load(&deps.storage).unwrap().count, 6);
    }
}
```
:::

:::exercise challenge Constant-product AMM with invariants
Implement the swap maths for a constant-product pool with a 30 basis-point fee.
Given reserves `x`, `y` and input `dx`, return the output and the new reserves.
Assert that `k` never decreases and that a round trip cannot profit. Add a
property test with `proptest` for random positive reserves and inputs, and
explain the integer-rounding direction that protects the pool.
::hint
Apply the fee to the input: `dx_effective = dx * 9970 / 10_000`. Then
`dy = y * dx_effective / (x + dx_effective)`, rounding down. The new `k` is
`(x + dx) * (y - dy)`, which should be at least the old `k` minus rounding.
Use `u128` to avoid overflow in the multiplication.
::solution
```rust
fn swap(x: u128, y: u128, dx: u128, fee_bps: u128) -> Option<(u128, u128, u128)> {
    if x == 0 || y == 0 || dx == 0 || fee_bps >= 10_000 {
        return None;
    }
    let dx_effective = dx.checked_mul(10_000 - fee_bps)? / 10_000;
    let numerator = y.checked_mul(dx_effective)?;
    let denominator = x.checked_add(dx_effective)?;
    let dy = numerator / denominator;
    if dy == 0 || dy >= y {
        return None;
    }
    Some((dy, x + dx, y - dy))
}

fn main() {
    let (x, y) = (1_000_000_u128, 2_000_000_u128);
    let before = x * y;
    let (dy, new_x, new_y) = swap(x, y, 10_000, 30).unwrap();
    println!("{dy} {new_x} {new_y} {}", new_x * new_y >= before);
    assert!(swap(x, y, 10_000, 30).is_some());
}
```

Rounding `dy` down protects the pool: the trader receives slightly less, so the
invariant errs in the pool's favour. The fee stays in the reserves, which is why
`k` grows for liquidity providers. A real AMM also checks minimum output,
deadline and reentrancy, and mints/burns LP shares against the reserve ratio.
:::

## Quiz

:::quiz Blockchain check
? What is a Solana Program Derived Address (PDA)?
- A wallet address controlled by a user's private key
+ An address derived from seeds and a program id that has no private key and can be signed for only by that program
- A temporary address valid for one transaction
- A compressed NFT account
= PDAs are off-curve by construction. The owning program authorises actions with `invoke_signed`, using the seeds and bump.

? Why are account checks such as `mut`, `Signer` and `has_one` critical in Anchor?
- They make the program run faster
+ They enforce at validation time that accounts are writable, signed and related as the instruction requires
- They replace the need for unit tests
- They encrypt the account data
= Anchor's `#[derive(Accounts)]` rejects an instruction before the handler runs if the account set does not satisfy the constraints. A missing check is a common exploit.

? In CosmWasm, how does a contract call another contract?
- By obtaining a pointer to its memory
+ By returning a message or submessage in `Response`, which the runtime executes after the current call
- By reading its storage directly
- By opening a socket
= CosmWasm contracts are isolated WASM modules. Messages are the only interface; submessages add a reply handler for the result.

? What does a constant-product AMM enforce, and what is slippage?
- `x + y = k`; slippage is the fee
+ `x * y = k`; slippage is the price movement caused by the trade's size relative to the reserves
- `x / y = k`; slippage is a fixed percentage
- `x * y = k`; slippage is the validator's tip
= The invariant keeps the product constant apart from fees. A larger trade consumes more of one reserve, moving the price against the trader.

? Which statement about signature nonces is correct?
- Reusing an ECDSA nonce is safe if the message differs
+ Reusing an ECDSA nonce with different messages reveals the private key
- Ed25519 requires a random nonce per signature
- Nonces are only relevant to proof-of-work
= ECDSA's equation can be solved for the private key when the same nonce signs two different messages. Deterministic nonces (RFC 6979) or a CSPRNG are mandatory. Ed25519 derives its nonce deterministically.
:::

:::recap
- Solana separates stateless programs from accounts; Anchor validates the account set, and PDAs give deterministic program-owned addresses.
- CPIs call other programs; PDAs sign with `invoke_signed`; SPL Token and Token-2022 define mints and token accounts.
- Substrate composes pallets into a WASM runtime; extrinsics, storage, events, errors and weights are the FRAME surface.
- CosmWasm contracts communicate by messages and keep state in `cw-storage-plus`; replies resume submessage flows.
- NEAR contracts use `near-sdk`, account-scoped storage and promise-based cross-contract calls.
- `alloy` (and `ethers-rs`) provide typed Ethereum providers, signers and ABI codecs over JSON-RPC.
- Hashes, signatures, Merkle proofs and zk proofs are the cryptographic primitives; use audited crates.
- Consensus ranges from PoW to BFT and hybrid PoS; finality and fault tolerance differ.
- Key management is custody: hardware wallets, KMS, multisig and tested recovery.
- Tokens follow standards; AMMs, lending and staking rest on invariants that must be tested.
- Bridges and oracles move trust; verify messages and freshness on-chain.
- Simulation, compute limits and fee markets decide whether a transaction lands.
- MEV is structural; protect users with slippage limits, private submission and fair ordering.
- DAOs need snapshots, quorum, timelocks and audited governance state machines.
:::
