import { createFileRoute } from "@tanstack/react-router";
import Calculator from "@/components/Calculator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nova Calculator — Premium Scientific Calculator" },
      { name: "description", content: "A premium scientific calculator with history, keyboard shortcuts, dark mode, and beautiful glassmorphism UI." },
      { property: "og:title", content: "Nova Calculator" },
      { property: "og:description", content: "Premium scientific calculator with history, keyboard shortcuts, and dark mode." },
    ],
  }),
  component: Calculator,
});
