export const publicModels = [
  { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5", capabilities: "Reasoning · streaming" },
  { id: "claude-haiku-5.5", name: "Claude Haiku 5.5", capabilities: "Coding · streaming" },
] as const;

export const demoSafetyNotice = "This preview is intentionally disconnected from the live API, provider controls, and administrative procedures.";

export const betaPlans = [
  {
    name: "Explorer",
    eyebrow: "Free beta",
    price: "$0",
    description: "A careful starting point for independent builders and prototypes.",
    features: ["100 requests each day", "100,000 tokens each day", "Claude Sonnet 5.5 and Claude Haiku 5.5", "Developer dashboard"],
    action: "Try the preview",
    href: "/demo",
  },
  {
    name: "Studio",
    eyebrow: "Next release",
    price: "Waitlist",
    description: "Expanded capacity is planned after upstream capacity and launch controls are validated.",
    features: ["Future higher allowances", "Usage-led capacity review", "Team workflow exploration", "No payment collected today"],
    action: "Read the beta policy",
    href: "/docs#limits",
    featured: true,
  },
  {
    name: "Partner",
    eyebrow: "Talk to us",
    price: "Custom",
    description: "For teams that need a deliberate rollout, governance conversation, and capacity planning.",
    features: ["Launch-readiness discussion", "Capacity planning", "Provider and usage review", "No implied service level"],
    action: "Explore the docs",
    href: "/docs",
  },
] as const;
