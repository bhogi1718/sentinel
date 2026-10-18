/// The plans shown on the landing and pricing pages. Illustrative: billing
/// isn't built, and the pages say so.

export interface Plan {
  id: "free" | "team" | "business";
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  highlights: string[];
  cta: "demo" | "contact";
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "forever",
    tagline: "For keeping an eye on your own laptops.",
    highlights: ["Up to 2 devices", "1 owner", "Live view, files and commands", "Telegram alerts", "7 days of command history"],
    cta: "demo",
  },
  {
    id: "team",
    name: "Team",
    price: "$6",
    priceNote: "per device / month",
    tagline: "For small teams that look after their own fleet.",
    highlights: [
      "Unlimited devices",
      "Owner, Admin and Viewer roles",
      "Live view, files and commands",
      "Telegram alerts",
      "90 days of command history",
    ],
    cta: "demo",
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    price: "Custom",
    priceNote: "talk to us",
    tagline: "For organizations with their own requirements.",
    highlights: ["Everything in Team", "SSO (planned)", "Custom history retention", "Priority support"],
    cta: "contact",
  },
];

/// The full comparison on the pricing page.
export const COMPARISON: { feature: string; values: [string, string, string] }[] = [
  { feature: "Devices", values: ["Up to 2", "Unlimited", "Unlimited"] },
  { feature: "Members and roles", values: ["1 owner", "Owner, Admin, Viewer", "Same, plus SSO (planned)"] },
  { feature: "Live screen view", values: ["Yes", "Yes", "Yes"] },
  { feature: "Files and screenshots", values: ["Yes", "Yes", "Yes"] },
  { feature: "Remote commands", values: ["Yes", "Yes", "Yes"] },
  { feature: "Telegram alerts", values: ["Yes", "Yes", "Yes"] },
  { feature: "Command history", values: ["7 days", "90 days", "Custom"] },
];

export const GITHUB_URL = "https://github.com/bhogi1718/sentinel";
