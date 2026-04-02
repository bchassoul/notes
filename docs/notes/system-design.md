# SaaS Architecture & System Design Guidelines

> **How to use this guide:** This document outlines the core architectural decisions required when building a modern SaaS application. While it focuses on the **underlying design patterns and trade-offs** that apply to any full-stack architecture, it provides concrete examples across various technology stacks (Erlang/Elixir, Node.js, Ruby, React, etc.) to ground the concepts.

## 1. Data Layer (The Foundation)

The database is the hardest part of the system to change later. Getting the data model right on day one is critical.

### 1.1 How do we isolate tenant data?

In a B2B SaaS, users belong to organizations (tenants), and data must never leak across tenants.

```mermaid
flowchart TD
    subgraph RowLevel["Option A — Row-Level Isolation (Recommended)"]
        direction LR
        DB1[("Single Database")]
        DB1 --- T1A["patients\ntenant_id=A | name=..."]
        DB1 --- T1B["patients\ntenant_id=B | name=..."]
        DB1 --- T1C["patients\ntenant_id=A | name=..."]
    end

    subgraph Schema["Option B — Schema-per-Tenant"]
        direction LR
        DB2[("Single Database")]
        DB2 --- S1["schema: tenant_a\npatients, appointments..."]
        DB2 --- S2["schema: tenant_b\npatients, appointments..."]
    end

    subgraph DBPerTenant["Option C — Database-per-Tenant"]
        direction LR
        DBA[("DB: tenant_a")]
        DBB[("DB: tenant_b")]
    end
```

<div class="cols-2">
<div class="col">

**Option A: Row-Level Isolation (Recommended)**
Every table has a `tenant_id` (e.g., `org_id`).
- **Pros:** Simple to query, easy to run migrations, connection pooling is trivial.
- **Cons:** Risk of developer error (forgetting the `WHERE tenant_id = X` clause).

</div>
<div class="col">

**Option B: Schema/Database-per-Tenant**
Each tenant gets their own isolated schema or physical database.
- **Pros:** Impossible to accidentally query another tenant's data. Highest security.
- **Cons:** Migrations are slow (must run N times), connection pooling is harder, cross-tenant queries are very difficult.

</div>
</div>

> [!TIP]
> **THE DEFAULT CHOICE**
>
> **Use Row-Level Isolation.** It scales best for 95% of SaaS apps. To mitigate the risk of developer error, use ORM/query builder features to automatically inject the `tenant_id` into every query.
> *(Examples: **Elixir/Ecto's `prepare_query`**, **Ruby on Rails' `default_scope`**, **Node/Prisma client extensions**)*

### 1.2 What type of Primary Keys should we use?

- **Sequential Integers (`id: 1, 2, 3`):** Fast, cache-friendly, but leaks business intelligence (competitors can see how many users you have by creating an account).
- **UUIDs v4 (`id: 550e8400-...`):** Secure, unguessable, allows clients to generate IDs before saving. However, they are larger and can cause index fragmentation.
- **UUIDs v7 / ULIDs:** Time-sorted UUIDs. They combine the unguessability of UUIDs with the database performance of sequential integers.

**Recommendation:** Use **UUIDs (preferably v7/ULIDs)** for all public-facing records. If you need extreme performance on massive internal tables, use sequential integers internally but expose a `public_id` (UUID) to the API. 
*(Examples: **PostgreSQL `uuid` type**, **Elixir `Ecto.UUID`**, **Node `ulid` package**)*

### 1.3 How do we handle deleted data?

- **Hard Deletes:** Data is gone forever. Clean, but bad for auditing and recovering from user mistakes.
- **Soft Deletes (`deleted_at` timestamp):** Data is hidden. Complicates every single query and unique constraint in the database.

**Recommendation:** Do not use soft deletes globally. Instead, use **Hard Deletes** for trivial data, and use an **Audit Log / Event Sourcing** table for critical business entities (e.g., invoices, appointments) so you have an immutable history of what happened.

---

## 2. API Layer (The Contract)

### 2.1 Where does Authorization live?

When a user requests a resource, how do we ensure they are allowed to see it?

1. **In the Controller/Resolver:** Hard to reuse, easy to forget.
2. **In the Domain/Service Layer:** Better, but couples business logic with HTTP/API context.
3. **In API Middleware/Interceptors:** The most robust approach.

**Recommendation:** Use **Middleware**. Whether using REST or GraphQL, attach permission checks declaratively to the routes or schema fields. This ensures they are never bypassed.
*(Examples: **Phoenix Plugs**, **Absinthe Middleware**, **Express.js Middleware**, **Ruby on Rails `before_action`**)*

### 2.2 How do we handle Business Logic Errors?

If a user tries to perform an invalid action (e.g., booking an already taken slot), how does the client know?

> [!WARNING]
> **AVOID TOP-LEVEL HTTP/SYSTEM ERRORS FOR DOMAIN LOGIC**
>
> Do not use generic 500 errors or GraphQL's top-level `errors` array for validation failures. Top-level errors should be reserved for actual system failures (network drops, syntax errors).

**Recommendation:** Use **Typed Mutation Payloads** (in GraphQL) or standard **Problem Details JSON** (in REST). The API should return a 200 OK with a payload containing a `success` boolean, the `result` object, and a `userErrors` array.
*(Examples: **GraphQL union types/interfaces**, **RFC 7807 for REST APIs**)*

### 2.3 How do we solve the N+1 Problem?

Fetching a list of 50 posts, and then fetching the author for each post, results in 51 database queries.

**Recommendation:** Use the **Dataloader Pattern** (batching and caching). Instead of resolving relationships immediately, the API collects all requested IDs, hits the database *once* with a `WHERE id IN (...)` clause, and maps the results back to the original requests.
*(Examples: **Elixir `Absinthe.Dataloader`**, **Node.js `dataloader`**, **Ruby `graphql-batch`**)*

---

## 3. Application Layer (The Brains)

### 3.1 Where does Business Logic live?

```mermaid
flowchart TD
    API["API Layer\n(e.g., Phoenix Controllers, Absinthe Resolvers, Express Routers)\nParses input, formats output"] --> Domain["Domain / Service Layer\n(e.g., Phoenix Contexts, Erlang App Modules, NestJS Services)\nThe public API of your core logic"]
    Domain --> Core["Core Entities\n(e.g., Ecto Changesets, Pure Erlang Functions, Pydantic Models)\nPure functions, validations"]
    Domain --> Infra[("Infrastructure\n(Database, External APIs)")]
```

**Recommendation:** Keep the API layer dumb. A controller/resolver should only extract arguments and call a Domain function (e.g., `BillingService.process_payment(args)`). The Domain layer orchestrates the database calls, background jobs, and events.

### 3.2 Concurrency and State: Stateless vs. Actor Model

How does your application handle concurrent requests and shared state?

```mermaid
flowchart LR
    subgraph Stateless["Stateless Model (Node.js, Rails, Django)"]
        direction TB
        Req1["Request 1"] --> S1["Server Instance\n(no state)"]
        Req2["Request 2"] --> S2["Server Instance\n(no state)"]
        S1 & S2 -->|"share state via"| Redis[("Redis\nMemcached\nRabbitMQ")]
        S1 & S2 -->|"persist via"| DB1[("Database")]
    end

    subgraph Actor["Actor Model (Elixir / OTP)"]
        direction TB
        Req3["Request 3"] --> P1["Process\n(holds own state)"]
        Req4["Request 4"] --> P2["Process\n(holds own state)"]
        P1 <-->|"message passing"| P2
        P1 & P2 -->|"persist via"| DB2[("Database")]
    end
```

<div class="cols-2">
<div class="col">

**Stateless Web Servers**
*(e.g., Node.js, Python/Django, Ruby on Rails)*
The application holds no state. Every request is isolated. To share state or coordinate tasks, you *must* use external infrastructure like Redis, Memcached, or RabbitMQ.

</div>
<div class="col">

**The Actor Model**
*(e.g., Erlang, Elixir, OTP, Akka)*
The application runs millions of lightweight, isolated processes (Actors) that communicate via message passing. State can be safely held in memory.

</div>
</div>

**Recommendation:** If using a standard stateless stack, rely heavily on your Database and Redis for coordination. If using **Erlang/OTP**, leverage its built-in capabilities: use processes (`GenServer`) for long-lived state, `ETS` for shared memory caching, and supervision trees for fault tolerance, drastically reducing the need for external infrastructure.

### 3.3 How do we handle Background Jobs?

When a user signs up, you need to send a welcome email. Doing this synchronously blocks the API response.

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB as Database
    participant Worker as Job Worker
    participant Email as Email Service

    Client->>API: POST /signup

    rect rgb(230, 244, 234)
        note over API,DB: Single atomic transaction
        API->>DB: INSERT INTO users (...)
        API->>DB: INSERT INTO oban_jobs (type: send_welcome_email)
        DB-->>API: COMMIT
    end

    API-->>Client: 201 Created (fast response)

    Note over DB,Worker: Transaction committed — job is now visible
    Worker->>DB: Poll for pending jobs
    DB-->>Worker: send_welcome_email job
    Worker->>Email: Send welcome email
    Worker->>DB: Mark job complete
```

**Recommendation:** Use **Database-backed queues** utilizing the **Transactional Outbox Pattern**. 
By using the primary database for the queue, you can enqueue the job inside the *exact same database transaction* as the user creation. If the transaction rolls back, the email job is never queued, guaranteeing absolute consistency.
*(Examples: **Elixir `Oban`**, **Node.js `Graphile Worker`**, **Ruby `Delayed::Job` or `GoodJob`**)*

---

## 4. Real-Time Layer (The Nervous System)

### 4.1 How do we push state to the client?

Modern SaaS applications require the UI to update instantly when another user makes a change.

```mermaid
flowchart LR
    Mut["Client A\nUpdates Data"] --> API["API Layer"]
    API --> DB[("Database")]
    API --> PubSub["PubSub Message Bus\n(e.g., Phoenix.PubSub, Redis, Erlang pg)"]
    PubSub --> WS["WebSocket Server\n(e.g., Phoenix Channels, Socket.io)"]
    WS -->|Pushes Event| Client["Client B\nReceives Update"]
```

**Recommendation:** Standardize your event flow. 
1. The Domain layer updates the Database.
2. The Domain layer broadcasts an event via a PubSub mechanism.
3. The WebSocket/Subscription layer intercepts the broadcast and pushes a payload to subscribed clients.
*(Examples: **Absinthe Subscriptions over Phoenix Channels**, **Apollo Server Subscriptions over Redis PubSub**)*

---

## 5. Client Layer (The Face)

### 5.1 How do we manage UI vs Server State?

Modern frontend applications must distinguish between "UI State" (is this modal open?) and "Server State" (what is the user's email?).

<div class="cols-2">
<div class="col">

**Server State**
Data that lives on the server. Use specialized caching libraries. These handle caching, background refetching, and deduplication automatically.
*(Examples: **Apollo Client**, **React Query**, **SWR**, **Relay**)*

</div>
<div class="col">

**UI State**
Ephemeral data that only exists in the browser. Use lightweight tools for things like theme preferences, sidebar toggles, or multi-step form state.
*(Examples: **Zustand**, **Pinia**, **Vuex**, **React Context**)*

</div>
</div>

> [!NOTE]
> **RULE OF THUMB**
>
> Never copy data from your Server State cache into your local UI State store. Read it directly from the cache using your data-fetching library's hooks.

### 5.2 Optimistic Updates

For actions where success is highly likely (e.g., "liking" a post), update the UI *before* the server responds. If the server request fails, roll back the UI state. This makes the application feel infinitely faster.

```mermaid
sequenceDiagram
    participant User
    participant UI as UI (Client State)
    participant API

    User->>UI: Click "Like"

    rect rgb(230, 244, 234)
        note over UI: Optimistic update (immediate)
        UI->>UI: likes = likes + 1 (feels instant)
    end

    UI->>API: POST /posts/1/like (in background)

    alt Server confirms
        API-->>UI: 200 OK
        note over UI: Keep optimistic state ✓
    else Server rejects
        API-->>UI: 400 / 409 Error
        rect rgb(253, 236, 234)
            note over UI: Roll back — likes = likes - 1
        end
        UI->>User: Show error toast
    end
```

*(Examples: **Apollo Client `optimisticResponse`**, **React Query `onMutate`**)*

---

## 6. Test your Knowledge

<details>
<summary>Why is row-level multi-tenancy generally preferred over schema-per-tenant?</summary>

Row-level multi-tenancy (using a `tenant_id` on every table) makes database migrations much faster, simplifies connection pooling, and makes cross-tenant queries (for internal admin dashboards) much easier to write.
</details>

<details>
<summary>What is the Dataloader pattern and what problem does it solve?</summary>

It solves the N+1 query problem. Instead of making a database query every time a relationship is resolved, Dataloader batches all requested IDs in a single tick and makes one consolidated database query (e.g., `WHERE id IN (...)`).
</details>

<details>
<summary>What is the advantage of using the Actor Model (Erlang/OTP) over a traditional stateless web server?</summary>

The Actor Model allows you to spawn millions of lightweight, concurrent processes that can safely hold state in memory and communicate via message passing. This provides built-in fault tolerance (supervision trees) and reduces the need for external infrastructure like Redis for caching or coordination.
</details>

<details>
<summary>Why should background jobs ideally be backed by the primary database instead of an external queue like Redis?</summary>

Using the primary database allows you to utilize the Transactional Outbox pattern. You can enqueue the job inside the same database transaction as your business logic. If the business logic fails and rolls back, the job is never queued, preventing race conditions and inconsistent states.
</details>

<details>
<summary>What is the difference between Server State and UI State on the frontend?</summary>

Server State is data owned by the backend (e.g., user profiles, lists of items) and should be managed by caching libraries like React Query or Apollo. UI State is ephemeral browser state (e.g., modal visibility, dark mode) and should be managed by local state tools like Zustand or Context.
</details>