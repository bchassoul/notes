import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(
  defineConfig({
    title: "Notes",
    description: "A static website built with VitePress.",
    cleanUrls: true,
    themeConfig: {
      nav: [{ text: "Home", link: "/" }],
      sidebar: [
        {
          text: "Foundations",
          collapsed: false,
          items: [
            { text: "Erlang / OTP", link: "/notes/otp" },
            { text: "Elixir", link: "/notes/elixir" },
            { text: "System Design", link: "/notes/system-design" },
          ],
        },
        {
          text: "Web Layer",
          collapsed: false,
          items: [
            { text: "Phoenix Framework", link: "/notes/phoenix" },
            { text: "React & TypeScript", link: "/notes/react-typescript" },
            { text: "GraphQL", link: "/notes/graph-ql" },
          ],
        },
        {
          text: "Data & Infrastructure",
          collapsed: false,
          items: [
            { text: "Relational Databases", link: "/notes/relational-databases" },
            { text: "Observability", link: "/notes/observability" },
          ],
        },
        {
          text: "AI Pipelines",
          collapsed: false,
          items: [
            { text: "GenStage, Broadway & AI", link: "/notes/genstage-broadway-ai" },
            { text: "Semantic Search & Vectors", link: "/notes/semantic-search-vectors" },
          ],
        },
        {
          text: "Interview Prep",
          collapsed: false,
          items: [
            { text: "Behavioral Interview", link: "/notes/behavioral-interview" },
          ],
        },
      ],
      search: {
        provider: "local",
      },
      socialLinks: [{ icon: "github", link: "https://github.com/bchassoul/notes" }],
    },
  }),
);
