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
          text: "Notes",
          items: [
            { text: "System Design", link: "/notes/system-design" },
            { text: "Erlang / OTP", link: "/notes/otp" },
            { text: "Phoenix Framework", link: "/notes/phoenix" },
            { text: "React & TypeScript", link: "/notes/react-typescript" },
            { text: "GraphQL", link: "/notes/graph-ql" },
            { text: "Relational Databases", link: "/notes/relational-databases" },
            { text: "Observability", link: "/notes/observability" },
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
