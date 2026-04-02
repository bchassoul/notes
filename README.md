# Study Guides & Architecture Notes

Comprehensive mental models, system design patterns, and deep dives for modern full-stack development.

## 📚 The Guides

### Foundations

#### [⚡ Erlang / OTP](docs/notes/otp.md)
The Actor model, gen_server, supervision trees, and fault tolerance.

#### [💧 Elixir](docs/notes/elixir.md)
Syntax, idioms, pattern matching, and functional programming patterns.

#### [🏗️ System Design](docs/notes/system-design.md)
SaaS architecture guidelines, multi-tenancy, and scaling strategies.

### Web Layer

#### [🔥 Phoenix Framework](docs/notes/phoenix.md)
Plugs, Contexts, Channels, Oban, and the request lifecycle.

#### [⚛️ React & TypeScript](docs/notes/react-typescript.md)
Rendering mental models, Server Components, and advanced TS patterns.

#### [🕸️ GraphQL](docs/notes/graph-ql.md)
Schema design, mutation payloads, Dataloader, and Absinthe.

### Data & Infrastructure

#### [🗄️ Relational Databases](docs/notes/relational-databases.md)
PostgreSQL internals, MVCC, advanced indexing, and query optimization.

#### [🔭 Observability](docs/notes/observability.md)
Logs, metrics, traces, OpenTelemetry, and structured logging.

### AI Pipelines

#### [⚙️ GenStage, Broadway & AI](docs/notes/genstage-broadway-ai.md)
Stream processing, LLM/ML integration, and production AI pipeline patterns.

#### [🧠 Semantic Search & Vectors](docs/notes/semantic-search-vectors.md)
Embeddings, pgvector, RAG pipelines, and vector search at scale.

### Interview Prep

#### [🎯 Behavioral Interview](docs/notes/behavioral-interview.md)
STAR method frameworks, interview narratives, and questions to ask.

---

## 🚀 Running the Documentation Site Locally

These notes are built using [VitePress](https://vitepress.dev/). To run the interactive documentation site locally:

1. Install dependencies:

```bash
pnpm install
```

2. Start the development server:

```bash
pnpm docs:dev
```
