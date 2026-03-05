import type { TeamAgent } from "./task-queue/types";

export interface TeamAgentConfig {
  id: TeamAgent;
  name: string;
  owner: string;
  isMain: boolean;
  description: string;
  capabilities: string[];
  integrations: string[];
  skills: string[];
}

export const TEAM_AGENTS: Record<TeamAgent, TeamAgentConfig> = {
  "general-manager": {
    id: "general-manager",
    name: "General Manager",
    owner: "efe",
    isMain: true,
    description: "Defines tasks and goals, assigns to other agents, monitors business performance",
    capabilities: [
      "Define tasks and decide on goals",
      "Assign tasks to other agents",
      "Report on the business",
      "Monitor revenue and worker performance",
      "Give feedback",
      "Market research and strategy",
    ],
    integrations: [],
    skills: ["market-research"],
  },
  engineering: {
    id: "engineering",
    name: "Engineering",
    owner: "efe",
    isMain: false,
    description: "Creates and maintains apps, monitors health, integrates Stripe and payments per org",
    capabilities: [
      "Create app",
      "Maintain app",
      "Monitor health of app",
      "Integrate Stripe product and payments per ORG",
    ],
    integrations: ["stripe", "vercel", "context7", "bash", "claude-code"],
    skills: ["stripe"],
  },
  product: {
    id: "product",
    name: "Product",
    owner: "efe",
    isMain: false,
    description: "Researches market and competitor products, creates PRDs for engineering",
    capabilities: [
      "Research the market and competitor products",
      "Create a PRD and hand it off to the eng team",
    ],
    integrations: [],
    skills: ["market-research"],
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    owner: "daniel",
    isMain: false,
    description: "Runs ads, drafts content, posts on social media",
    capabilities: [
      "Run ads",
      "Draft content and copy",
      "Post on Twitter and social media",
    ],
    integrations: ["twitter", "facebook-ads", "linkedin-ads", "content-generation", "asset-generation"],
    skills: ["agentmail"],
  },
};

export function getTeamConfig(team: TeamAgent): TeamAgentConfig {
  return TEAM_AGENTS[team];
}

export function getTeamsForOwner(owner: string): TeamAgentConfig[] {
  return Object.values(TEAM_AGENTS).filter((t) => t.owner === owner);
}

export function getAllTeams(): TeamAgentConfig[] {
  return Object.values(TEAM_AGENTS);
}
