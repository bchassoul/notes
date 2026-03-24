# Phoenix Framework

> **How to use this guide:** Phoenix is the standard web framework for Elixir. It sits on top of OTP and provides the web layer: routing, request handling, WebSockets, and application lifecycle. This guide assumes familiarity with OTP concepts.

## 1. Core Ideas: The Mental Model

Phoenix is not magic. It is a set of well-structured conventions built on top of two things you already know:

1. **OTP** — Phoenix applications are supervised OTP applications; every request is handled by a process.
2. **Plug** — Phoenix is a pipeline of composable functions that transform a connection.

> [!TIP]
> **THE PHOENIX PHILOSOPHY**
>
> Phoenix takes the OTP process model and applies it to HTTP and real-time communication. It provides a structured way to turn a web request into an Erlang message, process it, and return a response.

### 1.1 The Request Lifecycle

```mermaid
flowchart LR
    Client["Client"] -->|HTTP Request| Endpoint["Endpoint\n(Global Plugs)"]
    Endpoint --> Router["Router\n(Matches Path)"]
    Router --> Pipeline["Pipeline\n(Auth, JSON parsing)"]
    Pipeline --> Controller["Controller\n(Extracts params)"]
    Controller --> Context["Context\n(Business Logic)"]
    Context --> Controller
    Controller -->|HTTP Response| Client
```

## 2. Plug — The Foundation

> [!NOTE]
> **FOR ERLANG DEVELOPERS**
>
> If you are coming from Erlang, you likely know **Cowboy**. Phoenix runs on Cowboy. 
> **Plug** is simply an abstraction layer over Cowboy. Instead of dealing with Cowboy's `Req` object and state, Plug passes an immutable `%Plug.Conn{}` struct through a series of pure functions.

### 2.1 What a Plug Is

A Plug is a specification for composable modules between web applications. It comes in two flavors: Function Plugs and Module Plugs.

**Function Plug:**
A simple function that takes a `%Plug.Conn{}` and returns a `%Plug.Conn{}`.

```elixir
def my_plug(conn, _opts) do
  Plug.Conn.put_resp_header(conn, "x-request-id", UUID.generate())
end
```

### 2.2 Module Plugs: Compile-Time vs Run-Time

A classic senior-level interview topic is understanding the lifecycle of a Module Plug. It requires two functions: `init/1` and `call/2`.

```elixir
defmodule MyApp.AuthPlug do
  @behaviour Plug

  def init(opts) do
    # ⚠️ RUNS AT COMPILE TIME (or when the pipeline is built)
    # Do heavy lifting here: parse options, read configs, compile regexes.
    Keyword.fetch!(opts, :role)
  end

  def call(conn, role) do
    # ⚡ RUNS AT RUN TIME (for every single HTTP request)
    # The 'role' argument is the exact return value of init/1.
    if conn.assigns.user.role == role do
      conn
    else
      conn |> Plug.Conn.send_resp(403, "Forbidden") |> Plug.Conn.halt()
    end
  end
end
```

### 2.3 The `%Plug.Conn{}` State Machine

Because Elixir data structures are immutable, `conn` is constantly reassigned. However, the struct tracks the underlying HTTP state. You must understand this lifecycle:

1. **Unsent:** Headers and body can be modified.
2. **Set:** Response is ready but not sent (e.g., waiting for the pipeline to finish).
3. **Sent:** Cowboy has sent the data over the TCP socket. Any attempt to call `put_resp_header` or `send_resp` now will raise an exception.

### 2.4 Plug Pipelines

Pipelines group plugs that apply to a category of requests.

```elixir
pipeline :api do
  plug :accepts, ["json"]
  plug :fetch_session
  plug MyApp.Auth.VerifyToken
end
```

> [!NOTE]
> **SENIOR SIGNAL**
>
> Authentication, content-type negotiation, CSRF protection, and rate limiting all live in pipelines. Pipelines are the right place for cross-cutting concerns, not individual controllers.

## 3. Architecture & Contexts

### 3.1 Controllers vs Contexts

Phoenix encourages organizing business logic into **Context modules** — plain Elixir modules that group related functionality.

<div class="cols-2">
<div class="col">

**Controllers (Web Layer)**
Receives `conn` and `params`. Calls the Context. Renders the response. *Should contain zero business logic.*

</div>
<div class="col">

**Contexts (Domain Layer)**
The public API of your application. Handles validation, database calls (Ecto), and background jobs. *Should know nothing about HTTP or Plugs.*

</div>
</div>

```
lib/my_app/
  patients/         ← Context
    patient.ex      ← Schema
    patients.ex     ← Public API (CRUD + business logic)
  appointments/
```

## 4. Authentication Flow

### 4.1 Auth as a Plug

Authentication in Phoenix is typically a Plug in the pipeline, not a framework feature.

```elixir
defmodule MyApp.Auth.VerifyToken do
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, claims} <- MyApp.Token.verify(token) do
      assign(conn, :current_user, claims)
    else
      _ -> conn |> send_resp(401, "Unauthorized") |> halt()
    end
  end
end
```

> [!WARNING]
> **HALTING THE PIPELINE**
>
> Calling `halt(conn)` prevents any further plugs from running. Always halt after sending an unauthorized response, otherwise the request continues through the pipeline to the controller.

### 4.2 Auth and Absinthe (GraphQL)

The authenticated user must flow from the Phoenix pipeline into the Absinthe resolver context.

```elixir
# In the router or a plug, after authentication:
conn
|> Absinthe.Plug.put_options(context: %{current_user: conn.assigns[:current_user]})
```

## 5. Real-Time: Channels & PubSub

### 5.1 Phoenix Channels

Channels provide stateful, bidirectional real-time communication over WebSockets. **Each channel connection is an OTP process.**

```elixir
defmodule MyAppWeb.NotificationChannel do
  use MyAppWeb, :channel

  def join("notifications:" <> user_id, _payload, socket) do
    {:ok, assign(socket, :user_id, user_id)}
  end

  def handle_in("ping", _payload, socket) do
    {:reply, {:ok, %{status: "pong"}}, socket}
  end
end
```

### 5.2 Phoenix.PubSub

`Phoenix.PubSub` lets processes broadcast messages to subscribers across the application — or across a distributed cluster of nodes.

```mermaid
flowchart TD
    Mut["GraphQL Mutation\n(Creates Appointment)"] --> PubSub["Phoenix.PubSub\n(Topic: 'clinic:1')"]
    PubSub --> Sub1["Absinthe Subscription\n(Client A)"]
    PubSub --> Sub2["Absinthe Subscription\n(Client B)"]
    PubSub --> Worker["Background Worker\n(Sends Email)"]
```

> [!TIP]
> **WHY THIS MATTERS FOR GRAPHQL**
>
> Absinthe's subscription system uses `Phoenix.PubSub` internally. When a mutation fires a trigger, Absinthe broadcasts through PubSub to all connected WebSocket clients subscribed to that topic.

## 6. Background Jobs (Oban)

Oban is the standard background job library for Elixir. It uses PostgreSQL as the job queue backend, giving you durable jobs with ACID guarantees.

### 6.1 The Transactional Outbox Pattern

Using the same database as your application means jobs can be enqueued inside the same transaction as the business logic that triggers them.

```elixir
Ecto.Multi.new()
|> Ecto.Multi.insert(:appointment, changeset)
|> Oban.insert(:email_job, SendReminderEmail.new(%{id: appt_id}))
|> Repo.transaction()
```

If the transaction rolls back, the job is never enqueued. There is no separate queue infrastructure (like Redis) to operate or keep in sync.

## 7. Configuration & Deployment

### 7.1 `runtime.exs` vs `prod.exs`

<div class="cols-2">
<div class="col">

**`prod.exs` (Compile Time)**
Compiled into the release. Used for static configuration that does not change between environments.

</div>
<div class="col">

**`runtime.exs` (Run Time)**
Evaluated at startup. This is where you read environment variables (`System.get_env`).

</div>
</div>

> [!WARNING]
> **SECRETS**
>
> Never put sensitive config (API keys, DB passwords) in `prod.exs` with hardcoded values. Use `runtime.exs` and environment variables.

## 8. Testing in Phoenix (ExUnit)

ExUnit is Elixir's built-in test framework.

### 8.1 `async: true`

Marks a test module as safe to run concurrently with other async modules. Use it for tests that do not touch shared global state. Because Ecto uses a SQL Sandbox, database tests in Phoenix can safely run asynchronously.

### 8.2 Testing Levels

| Level       | What to test                       | Tools                       |
| ----------- | ---------------------------------- | --------------------------- |
| Unit        | Context functions, changeset logic | ExUnit, no DB or minimal DB |
| Integration | Controller → context → DB flow     | `ConnTest`, Ecto Sandbox    |
| Channel     | WebSocket message handling         | `ChannelTest`               |
| GraphQL     | Schema + resolver behavior         | `Absinthe.run/3` in tests   |

## 9. Test your Knowledge

<details>
<summary>What is a Plug in Phoenix?</summary>

A Plug is a function or module that takes a `%Plug.Conn{}` struct, transforms it, and returns a modified `%Plug.Conn{}`. The entire Phoenix request lifecycle is just a pipeline of Plugs.
</details>

<details>
<summary>What is the difference between `init/1` and `call/2` in a Module Plug?</summary>

`init/1` runs at **compile time** (or when the supervisor starts the pipeline). It is used to parse options and do heavy lifting once. Its return value is passed as the second argument to `call/2`, which runs at **run time** for every single HTTP request.
</details>

<details>
<summary>What happens if you try to add a header to a `conn` after `send_resp` has been called?</summary>

It will raise a `Plug.Conn.AlreadySentError`. The `%Plug.Conn{}` struct acts as a state machine. Once it transitions to the "Sent" state, Cowboy has already transmitted the HTTP response over the TCP socket, so headers can no longer be modified.
</details>

<details>
<summary>What happens if you forget to call `halt(conn)` after sending a 401 Unauthorized response in an auth Plug?</summary>

The request will continue flowing through the rest of the pipeline and eventually hit the controller, potentially executing unauthorized business logic or crashing because the user data isn't present.
</details>

<details>
<summary>Why is it recommended to use Oban (PostgreSQL) instead of a Redis-backed queue like Exq?</summary>

Because Oban uses the primary database, you can enqueue jobs inside the exact same database transaction as your business logic. If the transaction rolls back, the job is never queued, guaranteeing absolute consistency without needing a two-phase commit.
</details>

<details>
<summary>What is the difference between a Controller and a Context?</summary>

A Controller is part of the web layer; it parses HTTP requests and formats HTTP responses. A Context is a plain Elixir module that contains the actual business logic and database interactions. Controllers should be thin and delegate work to Contexts.
</details>

<details>
<summary>Why is `runtime.exs` important for deployment?</summary>

`prod.exs` is evaluated at compile time and baked into the release artifact. `runtime.exs` is evaluated every time the application starts, allowing you to read environment variables (like database URLs or API keys) dynamically without recompiling the code.
</details>