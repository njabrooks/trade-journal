---
source: https://x.com/benitoz/status/2005349615823183897?s=46
captured_at: 2026-01-22T14:19:00Z
kind: x-article
via: bird
---

# The Memory Wars: Why the Future Karpathy, Musk, and Jim Fan See Requires 16-Hi HBM

## Author
- @benitoz (Ben Pouladian)

## Transcript (full)

### 2005349615823183897 — @benitoz (Sun Dec 28 18:46:20 +0000 2025)

The Memory Wars: Why the Future Karpathy, Musk, and Jim Fan See Requires 16-Hi HBM

This is my first time trying out X's article feature—apologies if the formatting is rough. A polished version will be up on my [Substack](https://benitoz.substack.com/) shortly. And to everyone reading: Happy New Year!

"Weekends are for philosophy." —  @ramahluwalia

Ram's right. So let's step back from the spec sheets and ask what we're actually witnessing.

This week, Karpathy posted something that stopped me cold:

[Embedded Tweet: https://x.com/i/status/2004607146781278521]

This is Karpathy—the guy who built Tesla's Autopilot, who was skeptical about current models just two months ago on Dwarkesh's podcast—now saying he feels behind.

What changed? The inference layer got good enough. And it's about to get dramatically better.

The same week, [Electronic Times](https://www.etnews.com/) broke news that NVIDIA requested 16-Hi HBM deliveries from Samsung, SK Hynix, and Micron by Q4 2026. This isn't a research timeline—it's a production order.

These two data points are connected. The infrastructure buildout happening right now—16-Hi HBM, 3D-stacked SRAM, the $20B Groq licensing deal—is what makes Karpathy's "10X more powerful" possible. And it reveals why the AI chip competition may already be over.

[Embedded Tweet: https://x.com/i/status/2005167808498598040]

## Why AI Is Starving for Memory

Before we dive into the architecture wars, let's establish the core problem:

AI models are growing faster than our ability to feed them data.

A 70B parameter model like Llama 3 requires 140GB just to store weights. Add a 128K-token context window and the KV cache consumes 40GB per user. Serve 10 users simultaneously? That's 400GB just for the cache.

The KV cache formula reveals the exponential scaling problem:

KV Cache = 2 × 2 × head_dim × n_heads × n_layers × seq_length × batch_size

For a 70B model at 1 million tokens context (Gemini-scale), the KV cache alone reaches ~312GB per user. Serving 100 concurrent users would require 31TB of memory.

GPT-4's estimated 1.76T parameters require ~3.5TB in FP16. By 2028, we're looking at 10T+ parameter models requiring 5TB minimum.

## The 99% Idle Problem

Here's the dirty secret of AI inference: your $40,000 H100 runs at less than 1% utilization during decode.

Why? The arithmetic intensity mismatch.

H100 specs: 990 TFLOPS BF16 compute, 3.35 TB/s HBM bandwidth. That's optimized for 295 FLOPs per byte accessed.

But inference decode? Each token generation loads the entire model weights from HBM, performs roughly 2 FLOPs per byte, then waits. The GPU is literally idle 99% of the time, waiting for memory.

Training achieves 100-1000+ FLOPs/byte through batch parallelism. Prefill processes prompts in parallel. But decode's sequential, token-by-token generation leaves tensor cores starving.

This is the "memory wall"—and it's why training and inference require fundamentally different architectures.

## HBM vs SRAM: The Physics

Two types of memory, two different tradeoffs:

HBM (High Bandwidth Memory):

- Capacity: 80GB → 192GB → 1TB by 2027

- Bandwidth: 3.35 TB/s (H100) → 8 TB/s (B200) → 32 TB/s (Rubin Ultra)

- Latency: 100-150 nanoseconds

- Best for: Training, prefill, storing large models

SRAM (On-Chip Static RAM):

- Capacity: 50MB (H100 L2) → 230MB (Groq LPU)

- Bandwidth: 12 TB/s (H100 L2) → 80 TB/s (Groq internal)

- Latency: 0.5-2 nanoseconds — 50-100× faster than HBM

- Best for: Inference decode, low-latency applications

The memory wall exists because FLOPS scale ~750× every 2 years while DRAM bandwidth scales only ~1.6×. From V100 to H100, NVIDIA's compute-to-bandwidth ratio doubled from 139:1 to 295:1—making GPUs progressively worse-suited for memory-bound inference.

## The Puzzle Pieces

Piece 1: The 16-Hi HBM Race

NVIDIA wants 16 DRAM layers stacked within JEDEC's 775μm height limit. The physics are brutal:

- Current 12-Hi HBM4 uses 50μm wafers

- 16-Hi requires 30μm—silicon so thin it's translucent

- Bonding layers must shrink from ~10μm to even thinner

- Heat dissipation across 16 active DRAM layers? Unsolved at scale

Samsung uses TC-NCF bonding. SK Hynix uses MR-MUF. Both are racing to solve wafer thinning without shattering. New equipment has been deployed.

SK Hynix is ahead. The winner captures $50B+ in annual HBM revenue by 2028.

Piece 2: The SRAM Scaling Wall

SRAM density has effectively stalled:

- TSMC N5: ~0.021 µm² bitcell area

- TSMC N3E: barely better

- TSMC N2: ~0.0175 µm², ~38 Mb/mm² density

You can't add meaningful SRAM to a monolithic die without burning obscene wafer area. This is physics, not engineering.

This is Groq's moat—and limitation. Their LPU crams 230MB SRAM with 80 TB/s internal bandwidth, achieving 276 tokens/sec on Llama 3.3 70B versus 60-100 on GPUs. But holding that model requires 576 chips across 8 racks.

Piece 3: The $20B Groq Deal

NVIDIA didn't pay $20B for Groq's chips. They paid for validation that SRAM-centric, deterministic architectures win at inference. Groq's compiler-driven dataflow with static scheduling achieves higher Model FLOPs Utilization in low-batch scenarios.

NVIDIA is absorbing that insight into their roadmap.

Piece 4: The Pouladian Cheat Code

Here's what I've been calling the architectural pattern that lets NVIDIA neutralize every competitor:

NVIDIA Feynman (2028) won't fight SRAM physics. It routes around them: 3D-stacked SRAM using AMD X3D-style hybrid bonding.

[Embedded Tweet: https://x.com/i/status/2005150122343334339]

- Compute die: TSMC A16 with backside power delivery + GAA transistors. Maximum logic density.

- SRAM die: Separate chips on cheaper, mature nodes. Stacked vertically via hybrid bonding.

- HBM: 16-Hi stacks (48-64GB each) for capacity—training, prefill, large context windows.

Backside power delivery is the key enabler. Traditional chips route power and data on the front surface, creating congestion. A16 moves power to the back, freeing the front for high-density hybrid bonding—making 3D SRAM stacking practical without front-side routing nightmares.

Result: HBM capacity for weights + stacked SRAM bandwidth for low-latency decode. Best of both worlds.

## The Roadmap

- 2025-2026: HBM3E and 12-Hi HBM4 ramp. B200 with 192GB, 8 TB/s.

- 2026-2027: 16-Hi HBM4 qualification. Q4 2026 delivery per NVIDIA request.

- 2027: Rubin Ultra — 1TB HBM4E per GPU, 32 TB/s bandwidth. NVL576 configuration: 147TB total memory.

- 2028+: Feynman — A16 compute + 3D-stacked SRAM + 16-Hi HBM4. Training monopoly retained, inference gap closed.

## What Dies

Groq's standalone thesis: The $20B licensing deal is both validation and warning. Their deterministic architecture is genuinely innovative—NVIDIA paid to learn from it. But once Feynman ships with 3D-stacked SRAM, the latency gap that justified 576-chip deployments narrows considerably.

Custom ASIC differentiation: Google TPU, Amazon Trainium, Cerebras—the window is closing. Custom silicon makes sense for hyperscaler internal workloads, but when NVIDIA addresses inference efficiency through packaging rather than architectural overhaul, the ROI on separate hardware stacks becomes questionable.

AMD's catch-up strategy: MI300X's 192GB HBM3 is impressive. But if Feynman combines equivalent capacity with dramatically higher on-package bandwidth, AMD needs a packaging response—not just a process node catch-up.

## What This Means for 2030

Back to philosophy.

We're witnessing construction of an infrastructure layer that makes AI inference effectively infinite and nearly free at the margin. When Feynman ships with terabytes of addressable memory and stacked SRAM for sub-millisecond responses, the bottleneck shifts from "can we run this model?" to "what should we ask it?"

This is why Karpathy feels behind. The capability is arriving faster than our ability to conceptualize what to do with it.

Jim Fan at NVIDIA shared his own anxiety this week:

[Embedded Tweet: https://x.com/i/status/2005340845055340558]

Read that last point carefully: "Video world model seems to be a much better pretraining objective for robot policy."

Video world models are memory monsters. They need to encode spatial relationships, physics, temporal dynamics—everything VLMs throw away. This is why the memory infrastructure we're discussing matters for Physical AI. You can't run embodied intelligence on memory-starved chips. The 16-Hi HBM and stacked SRAM aren't just for chatbots generating tokens. They're for robots understanding the physical world.

Karpathy feels behind on software. Jim Fan is anxious about hardware-software alignment in robotics. Both are pointing at the same thing: capability is arriving faster than our frameworks can absorb it.

The abundance angle: Infinite inference means AI companions everywhere. A doctor in rural Kenya accessing diagnostic AI rivaling the best specialists. Every student with a personalized tutor that never tires. Scientific research accelerating as AI runs millions of hypothesis tests overnight. Democratization of intelligence—not as metaphor, but as infrastructure.

Elon Musk frames it more directly:

[Embedded Tweet: https://x.com/i/status/2003913557583511577]

Musk has been consistent: "There will be universal high income—not universal basic income—universal high income. There'll be no shortage of goods or services." He predicts work becomes optional within 10-20 years.

But here's what Musk, Karpathy, and Jim Fan are all circling around: this abundance requires infrastructure. You can't run trillion-parameter models on today's memory-starved chips. You can't deploy video world models for robotics without terabytes of fast memory. You can't make everyone wealthy through AI if the AI can't actually run.

The 16-Hi HBM war, the 3D-stacked SRAM, the Groq licensing deal—this is the infrastructure layer that makes their visions possible.

The consolidation angle: But who controls this infrastructure? NVIDIA's architectural dominance means they set terms for how AI deploys. Every hyperscaler, startup, government AI initiative runs on their roadmap. The Groq deal shows NVIDIA absorbing potential disruption rather than competing with it. By 2030, "AI infrastructure" and "NVIDIA" may be synonymous.

The synthesis: Perhaps both are true simultaneously. The transistor democratized computation while Intel dominated for decades. The internet democratized information while a handful of platforms captured most of the value. AI may democratize intelligence while NVIDIA captures the infrastructure rent.

What's philosophically novel is the speed. Previous infrastructure buildouts—railroads, electricity, internet—took decades. NVIDIA is compressing the AI infrastructure buildout into a 5-year roadmap that's already visible. We can see the 2028 endgame today, in the 16-Hi HBM specs and the Groq licensing terms.

The question for 2030 isn't whether we'll have abundant AI inference. That's settled.

The question is what we'll build with it—and whether we're ready for a world where the limiting factor on intelligence is no longer silicon, but imagination.

Karpathy isn't behind. He's just realizing how fast the ground is moving.

Time to Accelerate!

Ben
