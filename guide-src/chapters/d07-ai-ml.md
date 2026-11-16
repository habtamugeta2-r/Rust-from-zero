@id ai-ml
@part def
@title Artificial Intelligence and Machine Learning
@short AI and ML
@level advanced
@time 90
@learn Process tabular and numerical data with Polars and ndarray | Choose between Burn, Candle, tch-rs and linfa, and run ONNX inference | Tokenise text, embed documents and integrate LLM APIs | Use GPU compute, data pipelines and feature engineering in Rust | Build tensors, autodiff, a training loop and model serialisation

Rust's role in machine learning is uneven. The Python ecosystem still trains most
frontier models; Rust excels at **inference**, **data processing**, **serving**,
**edge deployment** and **systems that must not have a Python runtime**. The
crates are good enough for production work, and the gap is narrowing. This
chapter maps the ecosystem and shows the core workflows. It assumes you know
what a tensor, a gradient and a token are; the [async chapter](#async-concurrency) supplies the
foundation for serving, and [chapter D12](#webassembly) covers Wasm deployment.

The library's only earlier treatment of this area is the data section of the
[games, devices and data survey](#games-embedded), which introduces `ndarray`
and Polars in a few pages. If you read that survey, treat §7.2 as the same
ground at working depth and move quickly to the material with no survey
counterpart: choosing a framework (§7.4), inference runtimes (§7.5), language
and vision pipelines (§7.6–§7.7), embeddings and LLM clients (§7.8–§7.9), and
training your own small model (§7.16–§7.17).

:::analogy A workshop with imported tools
Training a frontier model is a research laboratory; deploying it is a workshop
that must run every day, at a predictable cost, on machines you control. Rust is
excellent at the workshop: load the model, preprocess the input, run the
inference, post-process, batch, monitor and retry. You can also build the tools
themselves in Rust, but you do not have to rebuild the laboratory to use them.
:::

:::compare Python for research, Rust for serving
Python wins where iteration speed and the research ecosystem dominate: notebooks, new architectures, GPU training and experiment tracking. Rust wins where a model must run predictably inside a product: low and stable latency, no interpreter or GIL, small containers, safe concurrency and a single binary. Many teams train in Python and export ONNX or safetensors for a Rust inference service — the boundary is the model artefact and its preprocessing.
:::


## 7.1 The ecosystem map

| Layer | Crates | Maturity | Use when |
| --- | --- | --- | --- |
| Data frames | `polars`, `arrow` | production | ETL, tabular analysis, feature pipelines |
| N-dimensional arrays | `ndarray`, `nalgebra` | production | numerical code, linear algebra |
| Deep learning | `burn`, `candle`, `tch` | good, evolving | training and inference in Rust |
| Classical ML | `linfa`, `smartcore` | usable | regression, trees, clustering without Python |
| Inference runtimes | `ort` (ONNX Runtime), `tract` | production | serving exported models |
| NLP | `tokenizers`, `rust-bert`, `kalosm` | good | tokenisation, BERT-family models, local LLMs |
| Vision | `image`, `opencv`, `kornia-rs` | good | preprocessing, classical CV |
| Vectors | `qdrant-client`, `hnsw_rs`, `usearch` | production | semantic search, RAG |
| GPU | `wgpu`, `cudarc`, `rust-gpu` | evolving | portable compute, CUDA kernels |
| LLM clients | `async-openai`, `ollama-rs`, `llm-chain` | production | API calls and orchestration |

The practical architecture is usually **Python for experiments, Rust for the
path that serves traffic**. Export the model (ONNX, safetensors, GGUF), then run
it with `ort`, `candle` or `llama.cpp` bindings. Keep preprocessing in Rust so
the same code runs in training and serving; a mismatch between the two is a
classic silent accuracy bug.

## 7.2 Data processing with Polars and ndarray

`polars` is a columnar data-frame library with a lazy query engine, Arrow
interoperability and streaming. It is the Rust answer to pandas, and often
faster because it parallelises across cores and pushes down predicates.

```rust
use polars::prelude::*;

fn main() -> PolarsResult<()> {
    let frame = df!(
        "user" => ["a", "b", "c", "a"],
        "amount" => [10.0_f64, 5.0, 7.5, 2.5],
        "country" => ["ET", "ET", "KE", "ET"],
    )?;

    let summary = frame
        .lazy()
        .filter(col("amount").gt(lit(3.0)))
        .group_by([col("country")])
        .agg([
            col("amount").sum().alias("total"),
            col("amount").mean().alias("average"),
            col("user").n_unique().alias("users"),
        ])
        .sort(["total"], SortMultipleOptions::default().with_order_descending(true))
        .collect()?;

    println!("{summary}");
    Ok(())
}
```

The lazy API builds a plan; `collect()` executes it. Use `scan_csv`/`scan_parquet`
for files larger than memory, `sink_parquet` for streaming output, and
`LazyFrame::explain()` to see the plan. `ndarray` is the lower-level tool:
contiguous N-dimensional arrays with slicing, broadcasting and BLAS-backed
matrix multiplication via `ndarray-linalg`.

```rust
use ndarray::{array, Array2, Axis};

fn main() {
    let features: Array2<f32> = array![[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]];
    let weights: Array2<f32> = array![[0.5], [-0.5]];
    let scores = features.dot(&weights);
    println!("{scores:?}");

    let means = features.mean_axis(Axis(0)).unwrap();
    let centred = &features - &means;
    println!("{centred:?}");
}
```

Choose Polars for tabular ETL and `ndarray` for numerical kernels. Arrow is the
shared memory format: exporting a `DataFrame` to Arrow and reading it in
`ndarray` avoids a serialisation round trip. For data larger than RAM, process
partitions and write Parquet; do not load a 100 GB CSV into a `Vec`.

## 7.3 Numerical computing with nalgebra and ndarray-linalg

`nalgebra` is a statically sized linear-algebra library with vectors, matrices,
quaternions, transforms and decompositions. It is the natural choice for
robotics, graphics and small dense problems. `ndarray-linalg` binds LAPACK for
large decompositions on `ndarray` arrays.

```rust
use nalgebra::{DMatrix, DVector};

fn main() {
    let a = DMatrix::from_row_slice(2, 2, &[2.0, 1.0, 1.0, 3.0]);
    let b = DVector::from_row_slice(&[3.0, 5.0]);
    let solution = a.clone().lu().solve(&b).expect("solvable");
    println!("{solution:?}");

    let eigenvalues = a.symmetric_eigen().eigenvalues;
    println!("{eigenvalues:?}");

    let covariance = DMatrix::from_row_slice(3, 2, &[1.0, 0.5, 0.5, 1.0, 0.2, 0.1]);
    let svd = covariance.svd(true, true);
    println!("{:?}", svd.singular_values);
}
```

Numerical work has its own failure modes: ill-conditioned matrices, catastrophic
cancellation, NaN propagation and floating-point non-associativity (`(a + b) + c
!= a + (b + c)`). Prefer stable decompositions (`LU` with partial pivoting, `QR`,
SVD) over explicit inverses; check residuals; and use `f64` unless memory
bandwidth demands `f32`. Determinism across CPUs is not guaranteed for parallel
reductions; sort or use compensated summation when reproducibility matters.

## 7.4 ML frameworks: Burn, Candle, tch-rs and linfa

| Framework | Backends | Style | Best for |
| --- | --- | --- | --- |
| `burn` | CPU, WGPU, CUDA, LibTorch | Rust-native, trait-based | portable training and inference, custom kernels |
| `candle` | CPU, CUDA, Metal | minimal tensor library, Hugging Face models | LLM inference, embedded models |
| `tch` | LibTorch | bindings to PyTorch | reusing PyTorch models and CUDA |
| `linfa` | CPU | scikit-learn-style classical ML | regression, trees, clustering in pure Rust |

`candle` is a small tensor library with a `Tensor` type, automatic
differentiation and model implementations (Llama, Whisper, Stable Diffusion).
`burn` takes a more framework-like approach with `Module`, `Backend`,
`TrainStep` and `InferenceStep` traits, so the same model runs on CPU, WGPU or
CUDA. `tch` exposes LibTorch directly: the fastest route to a PyTorch model, at
the cost of shipping LibTorch.

```rust
use candle_core::{DType, Device, Tensor};

fn main() -> candle_core::Result<()> {
    let device = Device::Cpu;
    let a = Tensor::from_vec(vec![1.0_f32, 2.0, 3.0, 4.0], (2, 2), &device)?;
    let b = Tensor::from_vec(vec![5.0_f32, 6.0, 7.0, 8.0], (2, 2), &device)?;
    let product = a.matmul(&b)?;
    println!("{product}");

    let softmax = candle_nn::ops::softmax(&product, 1)?;
    println!("{softmax}");
    let _ = DType::F32;
    Ok(())
}
```

Classical ML does not need a deep-learning stack. `linfa` provides
`linfa-linear`, `linfa-trees`, `linfa-svm`, `linfa-clustering` and more, with a
consistent `fit`/`predict` API. For a gradient-boosted tree model, `smartcore`
or a `lightgbm`/`xgboost` binding is often more accurate than a small neural
network on tabular data, and far cheaper to train.

## 7.5 Model inference with ONNX Runtime and tract

The safest production path is to train elsewhere and export a standard format.
`ort` binds ONNX Runtime with CUDA/TensorRT/CoreML execution providers; `tract`
is a pure-Rust ONNX/TensorFlow inference engine that runs on CPU and embedded
targets with no C++ dependency.

```rust
use ort::session::Session;
use ort::value::Tensor;

fn main() -> ort::Result<()> {
    let mut session = Session::builder()
        .commit_from_file("model.onnx")?;

    let input = Tensor::from_array(([1_usize, 4], vec![1.0_f32, 2.0, 3.0, 4.0]))?;
    let outputs = session.run(ort::inputs!["input" => input])?;
    let scores = outputs["output"].try_extract_tensor::<f32>()?;
    println!("{:?}", scores);
    Ok(())
}
```

Inference engineering is mostly about the edges: batch requests to fill the
device, pin shapes where the model allows it, reuse a session across requests
(it owns the weights), and run blocking inference on a dedicated thread pool
(`spawn_blocking` or a Rayon pool) rather than on Tokio's async workers. Measure
with the same preprocessing, batch size and precision as production. `tract`
supports INT8 quantisation and runs on `no_std` targets; ONNX Runtime has broader
operator coverage and GPU acceleration. A dynamic batch dimension is convenient
but can force reallocation; a fixed batch with a queue is often faster.

## 7.6 NLP: tokenizers, rust-bert and kalosm

`tokenizers` is the Hugging Face tokeniser library, with byte-pair encoding,
WordPiece and Unigram, fast parallel tokenisation and alignment offsets.
`rust-bert` provides ready pipelines (sentiment, QA, NER, translation) on top of
`tch`. `kalosm` bundles local LLMs, embeddings and speech models.

```rust
use tokenizers::Tokenizer;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let tokenizer = Tokenizer::from_file("tokenizer.json")?;
    let encoding = tokenizer.encode("Rust is fast and safe", true)?;
    println!("{:?}", encoding.get_ids());
    println!("{:?}", encoding.get_tokens());
    println!("{:?}", encoding.get_offsets());
    println!("{}", encoding.len());
    Ok(())
}
```

Tokenisation must match the model exactly: the same vocabulary, the same
normalisation, the same special tokens, and the same truncation policy. A
mismatched tokeniser produces plausible but wrong results. Token counts, not
character counts, drive context limits and cost; count before you call an API.
For BERT-family models, `rust-bert` wraps the pipeline machinery; for local
generation, `kalosm` or `llama-cpp-2` bind llama.cpp and support quantised GGUF
models on CPU. Chunk long documents on token boundaries with overlap, and keep
the mapping from chunk to source for citations.

## 7.7 Computer vision: `image` and OpenCV bindings

The `image` crate decodes, transforms and encodes common formats. `opencv`
binds OpenCV for classical pipelines; `kornia-rs` is a pure-Rust alternative
with tensor operations.

```rust
use image::{imageops::FilterType, DynamicImage, GenericImageView};

fn preprocess(path: &str) -> image::ImageResult<Vec<f32>> {
    let image = image::open(path)?;
    let resized: DynamicImage = image.resize_exact(224, 224, FilterType::Triangle);
    let rgb = resized.to_rgb8();

    // NCHW, normalised with ImageNet statistics: the layout most vision
    // models expect. Check your model's preprocessing, not a blog post.
    let mut tensor = vec![0.0_f32; 3 * 224 * 224];
    for (x, y, pixel) in rgb.enumerate_pixels() {
        let index = (y * 224 + x) as usize;
        let [r, g, b] = pixel.0;
        tensor[index] = (r as f32 / 255.0 - 0.485) / 0.229;
        tensor[224 * 224 + index] = (g as f32 / 255.0 - 0.456) / 0.224;
        tensor[2 * 224 * 224 + index] = (b as f32 / 255.0 - 0.406) / 0.225;
    }
    Ok(tensor)
}

fn main() {
    let image = image::open("photo.jpg").unwrap();
    println!("{:?}", image.dimensions());
}
```

Decoding untrusted images is a security surface: bound the input size, set
decoder limits, and fuzz the pipeline ([chapter D6](#security-engineering)). Colour order (RGB vs BGR),
resize interpolation, crop policy and normalisation constants must match
training. For video, decode with `ffmpeg-next` or `gstreamer` and sample frames
rather than loading the file into memory.

## 7.8 Vector databases and embedding generation

Semantic search and retrieval-augmented generation turn text into vectors and
find nearest neighbours. Rust clients exist for Qdrant, Milvus, Weaviate and
pgvector; `hnsw_rs`, `usearch` and `instant-distance` embed the index in-process.

```rust
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 { 0.0 } else { dot / (norm_a * norm_b) }
}

fn main() {
    let a = [1.0, 2.0, 3.0];
    let b = [1.0, 2.0, 3.2];
    println!("{}", cosine(&a, &b));
}
```

Generate embeddings with the same model you will use at query time, and store
the model id and dimension with every vector; mixing models in one index
produces meaningless neighbours. Normalise vectors if you use cosine similarity,
and use the database's distance metric consistently. For pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE chunks (id bigserial PRIMARY KEY, document_id uuid, content text, embedding vector(768));
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
SELECT content FROM chunks ORDER BY embedding <=> $1 LIMIT 5;
```

The retrieval quality problem is chunking, not the index: chunk on semantic
boundaries, keep overlap, store metadata for filtering, and evaluate recall on a
labelled set. Exact search is fine below a few hundred thousand vectors; HNSW
trades recall for speed and has build parameters worth tuning.

## 7.9 LLM integration

Most Rust LLM code is an HTTP client with retries, streaming, token accounting
and guardrails. `async-openai` covers the OpenAI-compatible API (including
self-hosted gateways); `ollama-rs` talks to a local Ollama; `llm-chain` and
`rig` orchestrate prompts and tools.

```rust
use async_openai::{types::CreateChatCompletionRequestArgs, Client};

async fn ask(prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = Client::new();
    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4o-mini")
        .messages([async_openai::types::ChatCompletionRequestUserMessageArgs::default()
            .content(prompt)
            .build()?
            .into()])
        .max_tokens(256_u32)
        .build()?;

    let response = client.chat().create(request).await?;
    Ok(response.choices[0].message.content.clone().unwrap_or_default())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", ask("Explain ownership in one sentence").await?);
    Ok(())
}
```

Production concerns: set timeouts and a maximum token budget; stream tokens to
the client with SSE; handle `429` with backoff; log token usage and cost per
request; never send secrets or personal data to a third party without a data
processing agreement; treat model output as untrusted input (prompt injection
is the new XSS ([chapter D6](#security-engineering))). For local models, use `llama-cpp-2`, `candle` examples or
`mistral.rs`, and quantise to fit the target. Retrieval augmentation is a
pipeline: embed the query, retrieve chunks, build a prompt within the context
window, cite sources, and evaluate the answers.

## 7.10 GPU computing: wgpu, cudarc and rust-gpu

`wgpu` is a portable GPU API (Vulkan, Metal, DX12, WebGPU) with compute shaders
in WGSL. `cudarc` provides raw CUDA driver/runtime bindings; `rust-gpu` compiles
Rust to SPIR-V for graphics and compute. `cubecl` and `burn`'s WGPU backend hide
much of the plumbing.

```rust
use wgpu::util::DeviceExt;

async fn add_one(input: &[f32]) -> Vec<f32> {
    let instance = wgpu::Instance::default();
    let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions::default()).await.unwrap();
    let (device, queue) = adapter.request_device(&Default::default()).await.unwrap();

    let data = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("input"),
        contents: bytemuck::cast_slice(input),
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC | wgpu::BufferUsages::COPY_DST,
    });

    // A real pipeline needs a shader module, bind group layout, compute
    // pipeline, output buffer and a readback map. The shape is:
    // dispatch workgroups -> submit -> map buffer -> copy to Vec<f32>.
    let _ = (data, queue);
    input.iter().map(|value| value + 1.0).collect()
}

fn main() {
    let _ = add_one;
}
```

GPU programming costs are launch overhead, memory transfer and occupancy.
Batch work to amortise the launch; keep data on the device across kernels;
prefer `f16`/`bf16` where accuracy allows; and profile with Nsight or RenderDoc
rather than guessing. A WGPU compute pipeline is portable but not automatically
fast; a vendor-specific kernel via `cudarc` can be several times faster. Most
Rust ML users should call an existing backend (Candle CUDA, ONNX Runtime
TensorRT) rather than write kernels.

## 7.11 Data pipelines and ETL

An ETL pipeline has four contracts: schema, ordering, idempotency and
observability. In Rust, the natural building blocks are `polars` for
transformations, `object_store` or `aws-sdk-s3` for storage, `arrow` for
in-memory exchange and `tokio` for I/O.

```rust
use polars::prelude::*;

fn transform(path: &str) -> PolarsResult<DataFrame> {
    LazyCsvReader::new(path)
        .with_has_header(true)
        .finish()?
        .filter(col("amount").is_not_null())
        .with_columns([
            (col("amount") * lit(1.2)).alias("amount_gross"),
            col("country").str().to_uppercase().alias("country"),
            col("created_at").str().strptime(DataType::Datetime(TimeUnit::Microseconds, None), "%Y-%m-%dT%H:%M:%S", StrptimeOptions::default()).alias("created_at"),
        ])
        .collect()
}

fn main() -> PolarsResult<()> {
    let frame = df!("amount" => [1.0, 2.0], "country" => ["et", "ke"], "created_at" => ["2026-01-01T00:00:00", "2026-01-02T00:00:00"])?;
    println!("{}", frame.select([col("amount").sum()])?);
    Ok(())
}
```

Write partitioned Parquet (`date=2026-11-16/part-000.parquet`), make every job
idempotent by writing to a temporary prefix and committing atomically, and record
row counts and schema versions. Validate the schema at the boundary: a column
that silently changes from integer to string is a data incident. For streaming,
`arrow-flight`, Kafka and `risingwave` are options; for orchestration, the job is
usually scheduled by Airflow/Dagster, with the Rust binary doing the work.

## 7.12 Feature engineering and preprocessing

The model consumes numbers; the product produces strings, timestamps, categories
and missing values. The preprocessing contract must be identical in training and
serving, versioned with the model.

- **Missing values**: choose a policy per column (drop, mean/median, sentinel,
  model-native). Record it.
- **Scaling**: fit mean/std or min/max on the training split only; store the
  parameters with the model; applying them twice is a bug.
- **Categorical encoding**: one-hot for low cardinality, hashing or target
  encoding for high cardinality; unseen categories need a bucket.
- **Time features**: hour, day of week, time since event; avoid future leakage.
- **Text**: tokenise and truncate to the model's maximum length.
- **Leakage**: any feature computed using the target or future data inflates
  validation scores and fails in production.

```rust
#[derive(Debug, Clone)]
struct Scaler {
    mean: f64,
    std: f64,
}

impl Scaler {
    fn fit(values: &[f64]) -> Self {
        let n = values.len() as f64;
        let mean = values.iter().sum::<f64>() / n;
        let variance = values.iter().map(|value| (value - mean).powi(2)).sum::<f64>() / n;
        Self { mean, std: variance.sqrt().max(1e-12) }
    }

    fn apply(&self, value: f64) -> f64 {
        (value - self.mean) / self.std
    }
}

fn main() {
    let scaler = Scaler::fit(&[1.0, 2.0, 3.0, 4.0]);
    println!("{:.3}", scaler.apply(3.0));
}
```

Store the preprocessing pipeline as data (JSON parameters) or as code with a
version, and test a golden input end to end. `polars` expressions can implement
most transformations; `linfa` has transformers for standardisation and
one-hot encoding. Keep raw events immutable so features can be recomputed.

## 7.13 Model serialisation and deserialisation

Model formats: **safetensors** (tensor names, dtypes, shapes; no pickle; the
default for Candle/Burn/Hugging Face), **ONNX** (portable graph + weights),
**GGUF** (llama.cpp quantised models), **LibTorch** archives (tch), and plain
`serde`/`bincode` for small models you control.

```rust
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use std::collections::HashMap;

fn load() -> candle_core::Result<HashMap<String, Tensor>> {
    let device = Device::Cpu;
    let tensors = candle_core::safetensors::load("model.safetensors", &device)?;
    for (name, tensor) in &tensors {
        println!("{name} {:?} {:?}", tensor.shape(), tensor.dtype());
    }
    let _builder = VarBuilder::from_tensors(tensors.clone(), DType::F32, &device);
    Ok(tensors)
}
```

Never load a pickle-based PyTorch `.pt`/`.pkl` from an untrusted source; the
pickle format can execute arbitrary code. Prefer safetensors or ONNX. Check
tensor shapes, dtypes and names against the model config, and verify checksums
before loading. Record the framework version and tokeniser revision with the
artefact. For a model you train in Rust, `serde` plus `safetensors` is enough;
a versioned manifest makes migrations possible.

## 7.14 Reinforcement learning

RL is a loop: observe state, choose action, receive reward, update policy.
`gym-rs` and `border` provide environments; `tch` and `candle` provide the
function approximators. `rl` and `rusty-rl` collect algorithms; many teams write
a small PPO/DQN loop directly because the environment is the hard part.

```rust
trait Environment {
    type State;
    type Action;

    fn reset(&mut self) -> Self::State;
    fn step(&mut self, action: Self::Action) -> (Self::State, f64, bool);
}

struct Bandit {
    means: [f64; 3],
}

impl Environment for Bandit {
    type State = ();
    type Action = usize;

    fn reset(&mut self) -> () {}

    fn step(&mut self, action: usize) -> ((), f64, bool) {
        let reward = self.means[action];
        ((), reward, true)
    }
}

fn main() {
    let mut bandit = Bandit { means: [0.2, 0.5, 0.8] };
    let mut estimates = [0.0_f64; 3];
    let mut counts = [0_u32; 3];
    for step in 0..100 {
        let action = if step < 3 { step } else {
            (0..3).max_by(|a, b| estimates[*a].partial_cmp(&estimates[*b]).unwrap()).unwrap()
        };
        let (_, reward, _) = bandit.step(action);
        counts[action] += 1;
        estimates[action] += (reward - estimates[action]) / counts[action] as f64;
    }
    println!("{estimates:?}");
}
```

The engineering pitfalls are reward hacking, non-stationarity, sample
inefficiency and evaluation. Log every episode's return distribution, not only
the mean; evaluate on a held-out set of seeds; and keep the environment
deterministic for debugging. RL is a poor fit when supervised learning can solve
the problem; use it when sequential decisions and delayed rewards are inherent.

## 7.15 Statistical analysis with statrs, rv and argmin

`statrs` provides distributions, descriptive statistics and special functions;
`rv` is a newer library of random variables with a compositional API; `argmin`
provides optimisation algorithms (gradient descent, Nelder-Mead, BFGS) with a
common interface.

```rust
use statrs::distribution::{ContinuousCDF, Normal};

fn main() {
    let normal = Normal::new(0.0, 1.0).unwrap();
    println!("{:.4}", normal.cdf(1.96));
    println!("{:.4}", normal.inverse_cdf(0.975));

    let samples = [1.2, 2.3, 1.9, 3.1, 2.8];
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let variance = samples.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (samples.len() - 1) as f64;
    println!("{mean:.3} {:.3}", variance.sqrt());
}
```

Report uncertainty: a mean without a confidence interval hides sample size.
Check distributional assumptions before a t-test, and use non-parametric tests
when they fail. Multiple comparisons need correction (Bonferroni, Benjamini-
Hochberg). For A/B tests, decide the metric, the minimum detectable effect and
the sample size **before** looking at the data; peeking inflates false positives.
`argmin` handles optimisation, but gradient-based training usually goes through
the ML framework's optimisers.

## 7.16 Tensor operations and automatic differentiation

A tensor is an N-dimensional array with a dtype, shape and device. Automatic
differentiation records operations in a graph and applies the chain rule in
reverse (backpropagation). Candle and Burn implement this; `burn` exposes
`Tensor` with `require_grad()` and `backward()`.

```rust
use burn::tensor::{backend::NdArray, Tensor};

fn main() {
    type Backend = NdArray;
    let x = Tensor::<Backend, 2>::from_floats([[1.0, 2.0], [3.0, 4.0]], &Default::default()).require_grad();
    let weights = Tensor::<Backend, 2>::from_floats([[0.5], [-0.5]], &Default::default()).require_grad();
    let prediction = x.matmul(weights);
    let loss = prediction.powf_scalar(2.0).mean();
    let gradients = loss.backward();
    println!("{:?}", gradients.grad(&weights));
}
```

Shape errors are the most common bug: a matrix product with incompatible inner
dimensions, a missing batch axis, or a broadcast that silently does the wrong
thing. Assert shapes at boundaries even when the type system knows them; the
error message is far better than the eventual wrong prediction. Mixed precision
(`f16`/`bf16`) speeds up training but needs loss scaling; check for NaNs.

## 7.17 Training loops and optimisers

A training loop repeats: forward pass, loss, backward pass, optimiser step, zero
gradients, evaluate. The details that matter are batching, shuffling, learning
rate schedule, gradient clipping and validation.

```rust
use candle_core::{DType, Device, Result, Tensor};
use candle_nn::{linear, AdamW, Module, Optimizer, ParamsAdamW, VarBuilder};

fn train() -> Result<()> {
    let device = Device::Cpu;
    let input = Tensor::randn(0.0_f32, 1.0, (64, 8), &device)?;
    let target = Tensor::randn(0.0_f32, 1.0, (64, 1), &device)?;

    let builder = VarBuilder::zeros(DType::F32, &device);
    let model = linear(8, 1, builder.pp("layer"))?;
    let mut optimiser = AdamW::new(
        model.all_vars(),
        ParamsAdamW { lr: 1e-3, ..Default::default() },
    )?;

    for epoch in 0..10 {
        let prediction = model.forward(&input)?;
        let loss = (&prediction - &target)?.sqr()?.mean_all()?;
        optimiser.backward_step(&loss)?;
        if epoch % 2 == 0 {
            println!("epoch {epoch} loss {:.4}", loss.to_scalar::<f32>()?);
        }
    }
    Ok(())
}

fn main() {
    let _ = train();
}
```

Optimisers: SGD with momentum for simple problems, AdamW for transformers and
most modern networks. A learning-rate warm-up followed by cosine decay is a
strong default. Clip gradients to avoid exploding updates; monitor both training
and validation loss, and stop on validation plateau with early stopping. Set
seeds for reproducibility, but expect nondeterminism from parallel reductions
and GPU kernels. Save checkpoints regularly and evaluate the exact artefact you
will deploy. `burn`'s `Learner` and `TrainStep` provide a structured loop if you
prefer a framework; Candle examples are the reference for LLM training.

## Exercises

:::exercise guided Preprocess an image correctly
Write a function that loads an image, converts it to RGB, resizes it to
224×224 with bilinear filtering, normalises with ImageNet mean/std, and returns
a `Vec<f32>` in NCHW order. Add a test with a 1×1 image and assert the tensor
length and channel ordering.
::hint
Use `image::open`, `to_rgb8`, `resize_exact(224, 224, FilterType::Triangle)`.
Index the output as `channel * 224 * 224 + y * 224 + x`. For a 1×1 grayscale
image, all three channels are equal; use that to check ordering.
::solution
```rust
use image::{imageops::FilterType, DynamicImage, GenericImageView};

fn preprocess(image: DynamicImage) -> Vec<f32> {
    const SIZE: usize = 224;
    let rgb = image.resize_exact(SIZE as u32, SIZE as u32, FilterType::Triangle).to_rgb8();
    let mut tensor = vec![0.0_f32; 3 * SIZE * SIZE];
    let mean = [0.485, 0.456, 0.406];
    let std = [0.229, 0.224, 0.225];

    for (x, y, pixel) in rgb.enumerate_pixels() {
        let index = y as usize * SIZE + x as usize;
        for channel in 0..3 {
            let value = pixel.0[channel] as f32 / 255.0;
            tensor[channel * SIZE * SIZE + index] = (value - mean[channel]) / std[channel];
        }
    }
    tensor
}

fn main() {
    let image = image::RgbImage::from_pixel(1, 1, image::Rgb([128, 128, 128]));
    let tensor = preprocess(DynamicImage::ImageRgb8(image));
    assert_eq!(tensor.len(), 3 * 224 * 224);
    assert!((tensor[0] - tensor[224 * 224]).abs() < 1e-6);
    println!("{}", tensor.len());
}
```
:::

:::exercise practice Embed and retrieve
Implement a small in-memory vector store: `add(id, text, embedding)`, `search(query,
k)` using cosine similarity, and a filter by metadata. Then add a second entry
with the same text in a different case and verify that both are returned. Explain
what changes at one million vectors.
::hint
Store `(id, text, metadata, Vec<f32>)`. Normalise on insert, sort by dot product,
and take `k`. At one million vectors, an exact scan is `O(n)` per query; use an
HNSW/IVF index or a vector database, and consider quantisation.
::solution
```rust
#[derive(Clone)]
struct Entry {
    id: u64,
    text: String,
    embedding: Vec<f32>,
}

struct Store {
    entries: Vec<Entry>,
}

impl Store {
    fn add(&mut self, id: u64, text: &str, mut embedding: Vec<f32>) {
        let norm = embedding.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
        for value in &mut embedding {
            *value /= norm;
        }
        self.entries.push(Entry { id, text: text.to_string(), embedding });
    }

    fn search(&self, query: &[f32], k: usize) -> Vec<(u64, f32)> {
        let norm = query.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
        let mut scores: Vec<(u64, f32)> = self
            .entries
            .iter()
            .map(|entry| {
                let score = entry.embedding.iter().zip(query).map(|(a, b)| a * (b / norm)).sum();
                (entry.id, score)
            })
            .collect();
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        scores.truncate(k);
        scores
    }
}

fn main() {
    let mut store = Store { entries: Vec::new() };
    store.add(1, "Rust", vec![1.0, 0.0, 0.0]);
    store.add(2, "rust", vec![0.99, 0.01, 0.0]);
    store.add(3, "Python", vec![0.0, 1.0, 0.0]);
    println!("{:?}", store.search(&[1.0, 0.0, 0.0], 2));
}
```
:::

:::exercise challenge Train a tiny regressor
Using Candle or Burn, generate `y = 3x + 2 + noise`, train a one-layer linear
model with AdamW for 200 steps, and print the learned weight and bias. Split
into train and validation sets, add gradient clipping, and plot (or print) the
loss every 20 steps. Compare the learned parameters with the true ones.
::hint
Use `Tensor::randn` for `x` and noise, build `y` with broadcasting, and a
`linear(1, 1, ...)`. MSE loss, AdamW with `lr = 0.05`, and 200 steps on a batch
of 256 should converge close to 3 and 2. Validation loss uses a separate batch
and no gradients.
::solution
```rust
use candle_core::{DType, Device, Result, Tensor};
use candle_nn::{linear, AdamW, Module, Optimizer, ParamsAdamW, VarBuilder};

fn main() -> Result<()> {
    let device = Device::Cpu;
    let x = Tensor::rand(-3.0_f32, 3.0, (256, 1), &device)?;
    let noise = Tensor::randn(0.0_f32, 0.1, (256, 1), &device)?;
    let y = (x.affine(3.0, 2.0)? + noise)?;

    let builder = VarBuilder::zeros(DType::F32, &device);
    let model = linear(1, 1, builder.pp("line"))?;
    let mut optimiser = AdamW::new(
        model.all_vars(),
        ParamsAdamW { lr: 0.05, ..Default::default() },
    )?;

    for step in 0..200 {
        let prediction = model.forward(&x)?;
        let loss = (&prediction - &y)?.sqr()?.mean_all()?;
        optimiser.backward_step(&loss)?;
        if step % 20 == 0 {
            println!("step {step} loss {:.4}", loss.to_scalar::<f32>()?);
        }
    }

    let weight = model.weight().to_vec2::<f32>()?[0][0];
    let bias = model.bias().map(|bias| bias.to_vec1::<f32>()).transpose()?.map(|v| v[0]).unwrap_or(0.0);
    println!("weight {weight:.3} bias {bias:.3}");
    Ok(())
}
```
:::

## Quiz

:::quiz AI and ML check
? When is Rust a better choice than Python for ML?
- For exploratory research and frontier model training
+ For inference, data processing and serving where no Python runtime is acceptable
- Only for computer vision
- Never; Python is always faster
= Python dominates research because of its ecosystem and flexibility. Rust wins at deploying, embedding and processing data at predictable cost.

? What is the safest model format to load from an untrusted source?
- A PyTorch pickle checkpoint
+ Safetensors or ONNX
- A `.pkl` file with a checksum
- A zip of Python scripts
= Pickle can execute arbitrary code during deserialisation. Safetensors stores tensors and metadata without code; ONNX is a graph format.

? Why must preprocessing be identical in training and serving?
- To keep the binary small
+ Because the model learned from the exact transformed distribution; a mismatch silently degrades accuracy
- Because the GPU requires it
- It does not need to be identical
= Scaling constants, colour order, tokenisation and feature order are part of the model. A mismatch produces plausible but wrong predictions.

? What does an embedding index need to store alongside each vector?
- Only the vector
+ The model id, dimension and any metadata used for filtering
- The original training loss
- The GPU serial number
= Query and document vectors must come from the same model and dimension. Metadata supports filtering and citations; without it, an index cannot be safely evolved.

? What is the main cost of exact nearest-neighbour search at one million vectors?
- Memory bandwidth only
+ `O(n)` distance computations per query, which becomes too slow for interactive use
- It cannot be implemented in Rust
- Vectors cannot be stored on disk
= Exact search is linear per query. At scale, an approximate index (HNSW/IVF) or a vector database trades recall for latency.
:::

:::recap
- Rust is strongest at inference, data processing and serving; Python remains the research default.
- Polars handles lazy tabular ETL; ndarray/nalgebra handle numerical kernels.
- Burn, Candle, tch-rs and linfa cover deep learning and classical ML with different trade-offs.
- ONNX Runtime and tract serve exported models; `tract` suits embedded and pure-Rust deployment.
- Tokenisation must match the model; count tokens for cost and context limits.
- Image and text preprocessing are part of the model contract; fuzz and bound untrusted decoders.
- Vector search needs a consistent embedding model, normalisation and metadata.
- LLM integration is HTTP plus retries, streaming, budgets and prompt-injection defences.
- WGPU/CUDA unlock GPU compute; most teams should use an existing backend.
- Pipelines need schema, idempotency and observability; features must avoid leakage.
- Safetensors or ONNX for weights, never pickle from untrusted sources.
- Training loops are forward/loss/backward/step; seeds, schedules, clipping and validation matter.
:::
