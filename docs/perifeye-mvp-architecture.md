# PerifEye MVP Architecture and 90-Day Plan

## Goal

Ship the first production version of a "know this space and watch over it" product for homes and similar small properties. The MVP must do two jobs well enough to learn from real usage:

- answer "where was this item last seen?"
- maintain a repair and maintenance punch list that updates on each walkthrough

The first version should optimize for trustworthy history and operator-corrected output, not full automation.

## MVP Product Slice

### In scope

- upload one walkthrough video per space
- extract candidate items, locations, and repair observations
- let an operator review and correct uncertain output
- persist inventory history over time
- show the latest known location and prior sightings for an item
- create and track repair issues with open/resolved state

### Out of scope for v1

- live on-device inference
- full 3D mapping or AR overlays
- autonomous repair resolution with no review path
- broad end-user self-serve editing beyond simple confirmations
- perfect identity tracking across every occlusion-heavy scenario

## Architecture Principles

- Keep one canonical source of truth in Postgres.
- Treat model output as a proposal until accepted by a review flow or a high-confidence auto-merge rule.
- Preserve raw observations separately from canonical inventory state.
- Prefer one application codebase plus background workers over premature service sprawl.
- Fake expensive intelligence with operator tooling before building specialized ML systems.

## Recommended System Shape

Use a modular monolith for the application layer in the first 90 days, with clear internal boundaries and asynchronous workers where latency or cost requires it.

### Boundary 1: Client surfaces

- mobile-web upload flow for capturing or submitting walkthroughs
- lightweight search and repair list UI for users
- internal operator console for review, correction, and audit history

### Boundary 2: Core application API

Owns auth, space management, walkthrough lifecycle, search queries, repair workflows, and operator actions.

Recommended stack:

- TypeScript application server
- Postgres as primary datastore
- object storage for raw video, extracted frames, and evidence images

### Boundary 3: Processing orchestrator

Owns job state and retries for:

- video ingest
- frame extraction
- scene segmentation
- multimodal extraction
- entity matching
- repair candidate generation
- review task creation

This can live in the same repo and database, backed by a queue such as Postgres-backed jobs or a managed queue.

### Boundary 4: Extraction workers

Stateless workers that call external vision and LLM APIs and produce structured candidates:

- location candidates
- item sightings
- repair observations
- confidence values and evidence links

### Boundary 5: Search and retrieval read path

For MVP, serve "find my item" directly from relational queries over normalized tables plus optional trigram/full-text search. Do not introduce a dedicated vector or graph store in v1 unless retrieval quality proves insufficient.

## Canonical Storage Model

Postgres should own both canonical state and raw processing lineage.

### Core entities

`spaces`

- one record per home, workshop, office, or unit

`walkthroughs`

- one uploaded video session
- status: uploaded, processing, awaiting_review, applied, failed
- captured_at, processed_at, operator_id

`media_assets`

- raw video, extracted keyframes, cropped evidence images
- tied to a walkthrough

`space_zones`

- stable logical locations such as kitchen, garage, primary bath

`storage_locations`

- finer-grained containers or surfaces such as "tool drawer left side" or "hall closet top shelf"
- belongs to a zone and may have a parent location

`inventory_items`

- canonical item records such as "pliers", "paint roller", "passport folder"
- stores normalized name, category, status, and latest confirmed location

`item_observations`

- raw sightings from a walkthrough
- references frame evidence, candidate location, extraction metadata, and confidence

`item_identity_links`

- links an observation to an existing canonical item or creates a new item after review
- keeps the matching decision explicit

`item_location_history`

- append-only history of confirmed item placements over time

`repair_issues`

- canonical maintenance or damage records
- status: open, monitoring, resolved, false_positive

`repair_observations`

- raw model or operator observations that suggest a repair issue
- linked to evidence and location

`review_tasks`

- operator work queue units for a walkthrough or a subset of extracted candidates

`review_actions`

- audit log for accept, reject, merge, relabel, resolve, or reopen decisions

### Why this model

- `inventory_items` and `repair_issues` are the durable product objects users care about.
- `item_observations` and `repair_observations` preserve model outputs and evidence without contaminating source of truth.
- `item_location_history` makes "where was it last seen?" cheap and trustworthy.
- Explicit review tables make it possible to measure operator load and model precision from day one.

## Ingestion and Extraction Pipeline

### Step 1: Upload and register walkthrough

- client uploads video to object storage via signed URL
- API creates `walkthrough` and `media_asset` records
- orchestrator enqueues processing job

### Step 2: Pre-process media

- transcode to a standard format if needed
- sample frames adaptively, biased toward scene changes and opened containers
- derive short clips or frame bundles for cabinet/drawer segments

### Step 3: Extract structured candidates

Workers call multimodal models with tightly scoped prompts to return:

- room/zone guess
- container or surface label
- item candidates with normalized names
- visible condition anomalies that may imply repair work

Output lands in raw observation tables, not in canonical inventory directly.

### Step 4: Match against existing memory

Apply deterministic and heuristic matching before any operator review:

- same normalized label in same location within recent history
- category and visual similarity cues
- user- or operator-confirmed aliases

This step should produce one of:

- matched existing item
- likely new item
- ambiguous identity requiring review

### Step 5: Create proposed space diff

For each walkthrough, build a proposed diff:

- items newly seen
- items moved
- items no longer visible
- new repair candidates
- repair candidates that appear resolved or unchanged

### Step 6: Review and commit

- high-confidence low-risk changes may auto-apply
- ambiguous or high-impact changes route to operator review
- accepted decisions update canonical item and repair tables
- the system writes append-only history rows for changes

## Operator Review Flow

The operator workflow is the main product safety mechanism for v1.

### Review queue design

One queue item per walkthrough, internally grouped into:

- identity conflicts
- uncertain locations
- newly detected repair issues
- possible resolved repairs

### Operator actions

- confirm or relabel item identity
- correct location labels
- merge duplicate items
- mark an item as unseen but still existing
- accept, reject, or downgrade a repair candidate
- mark a repair issue resolved with evidence

### UX rules

- always show the frame or clip that triggered the candidate
- show prior confirmed location and recent history during review
- allow fast batch-accept for repetitive high-confidence candidates
- keep every decision auditable so prompts and heuristics can be improved later

## What To Fake or Keep Manual First

These are deliberate MVP constraints, not missing features.

- Use a controlled operator taxonomy for rooms, storage locations, and repair labels instead of building a fully learned ontology.
- Keep identity matching heuristic-first with operator correction instead of training a custom re-identification model.
- Handle "item disappeared" conservatively: mark as not seen in this walkthrough, not as removed from the space.
- Route most repair detection through human review until false-positive rates are understood.
- Use a basic search interface over normalized names and aliases before investing in semantic retrieval.
- Let operators correct location hierarchies manually rather than generating a full spatial map.

## Top Technical Risks

### 1. Identity tracking across clutter and movement

The system may confuse visually similar objects or fail to preserve continuity when an item moves containers.

Mitigation:

- keep observation-to-item linkage explicit
- bias toward "needs review" instead of aggressive auto-merge
- store aliases and operator corrections for future matching

### 2. Location labeling drift

Model-generated labels for drawers, shelves, and containers will vary over time.

Mitigation:

- normalize locations against operator-managed `storage_locations`
- encourage reusable operator labels per space
- treat freeform model labels as suggestions only

### 3. Repair false positives

Many visual anomalies look like issues but are harmless lighting, texture, or clutter artifacts.

Mitigation:

- separate repair candidates from canonical repair issues
- require review for most repair creations in v1
- track precision by issue category

### 4. Review queue overload

If too many candidates need manual intervention, the product will not scale operationally.

Mitigation:

- instrument review volume by walkthrough
- batch similar low-risk accepts
- narrow initial item and repair scope if needed

### 5. Cost and latency of video processing

Raw end-to-end video analysis can become expensive and slow.

Mitigation:

- sample keyframes instead of analyzing every frame
- keep a small list of high-value item and issue categories first
- split processing into resumable stages with cached artifacts

## First 90 Days

### Days 1-30: Build the canonical pipeline

- stand up the TypeScript app, Postgres schema, and object storage path
- implement space creation, walkthrough upload, and processing job lifecycle
- define `spaces`, `walkthroughs`, `storage_locations`, `inventory_items`, `item_observations`, `repair_issues`, and review tables
- ship an internal operator console that can inspect candidates and commit corrections
- support one-home-at-a-time onboarding with manual operator help

Exit criteria:

- one walkthrough can move from upload to reviewed inventory state
- users can search confirmed items by name
- operators can create and resolve repair issues from extracted evidence

### Days 31-60: Make history and diffing useful

- add item location history and latest-seen views
- generate proposed diffs against previous walkthroughs
- add confidence scoring and auto-apply rules for safe low-risk changes
- expose user-facing item detail and repair list views
- instrument processing failures, review time, and candidate precision

Exit criteria:

- system can show current location plus prior sightings for an item
- each new walkthrough produces a usable changed-items and repair queue
- the team can quantify what percent of candidates require review

### Days 61-90: Reduce manual load and tighten reliability

- refine prompts, heuristics, and review batching based on real walkthroughs
- add aliases, duplicate-merge handling, and better location normalization
- narrow or expand supported item and repair categories based on operator pain
- add dashboards for extraction quality, operator throughput, and turnaround time
- decide whether retrieval, embeddings, or a more specialized identity layer are justified

Exit criteria:

- repeat walkthroughs on the same space produce stable enough history to trust
- operator time per walkthrough is trending down
- the team has evidence for the next engineering hire and next architecture step

## Day-One Metrics

- walkthrough processing success rate
- median upload-to-reviewed turnaround time
- candidates per walkthrough by type
- operator decisions per walkthrough
- auto-apply acceptance rate
- item search success rate on curated eval queries
- repair candidate precision from reviewed samples

## Recommended Hiring Implications

This plan supports the existing hiring packet directly. The first engineer should be strong in:

- TypeScript application delivery
- relational data modeling
- background job orchestration
- operator-facing web UI design
- practical multimodal API integration under human review

Do not hire first for specialized ML research or distributed systems depth. The first technical bottleneck is productizing the reviewable memory pipeline, not scaling a mature platform.
