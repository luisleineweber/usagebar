export type ProviderOnboardingVariant = {
  title: string
  steps: string[]
}

const COOKIE_ONBOARDING_GUIDANCE: Record<string, ProviderOnboardingVariant[]> = {
  ollama: [
    {
      title: "Option 1: Sign in to Ollama (recommended)",
      steps: [
        "Open a terminal.",
        "Run `ollama signin` and sign in.",
        "Click Check again. If the Cookie header is still missing, use Option 2.",
      ],
    },
    {
      title: "Option 2: Copy the Cookie header from a browser",
      steps: [
        "Sign in at ollama.com and open ollama.com/settings.",
        "Press F12 and select Network.",
        "Reload the page and open a request to ollama.com.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  opencode: [
    {
      title: "Copy the Cookie header from a browser",
      steps: [
        "Sign in at opencode.ai.",
        "Open the Billing page for the correct workspace.",
        "Press F12, select Network, and reload the page.",
        "Open the Billing or _server request.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  codex: [
    {
      title: "Option 1: Sign in to Codex",
      steps: [
        "Install the Codex CLI if it is not installed.",
        "Run `codex login` and sign in.",
        "Click Check again.",
      ],
    },
    {
      title: "Option 2: Copy the dashboard Cookie header from a browser",
      steps: [
        "Sign in at chatgpt.com and open the Codex dashboard.",
        "Press F12, select Network, and reload the page.",
        "Open a request from the Codex dashboard.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  claude: [
    {
      title: "Option 1: Sign in to Claude Code",
      steps: ["Start Claude Code.", "Run `/login` and sign in.", "Click Check again."],
    },
    {
      title: "Option 2: Copy the Cookie header from a browser",
      steps: [
        "Sign in at claude.ai.",
        "Press F12, select Network, and reload the page.",
        "Open a request from claude.ai.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  zed: [
    {
      title: "Copy the Cookie header from the Zed dashboard",
      steps: [
        "Open dashboard.zed.dev and sign in.",
        "Open the Zed AI Usage page.",
        "Press F12, select Network, and reload the page.",
        "Open the usage request.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  abacus: [
    {
      title: "Copy the Cookie header from Abacus AI",
      steps: [
        "Sign in at apps.abacus.ai.",
        "Open the Compute Points or usage page.",
        "Press F12, select Network, and reload the page.",
        "Open the Compute Points request.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  perplexity: [
    {
      title: "Copy the Cookie header from Perplexity",
      steps: [
        "Sign in at perplexity.ai.",
        "Open the Account or Billing page.",
        "Press F12, select Network, and reload the page.",
        "Open the Credits or Billing request.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
  augment: [
    {
      title: "Option 1: Sign in to Augment",
      steps: ["Open a terminal.", "Run `auggie login` and sign in.", "Click Check again."],
    },
    {
      title: "Option 2: Copy the Cookie header from a browser",
      steps: [
        "Sign in at app.augmentcode.com.",
        "Open the Subscription or Credits page.",
        "Press F12, select Network, and reload the page.",
        "Open the Subscription or Credits request.",
        "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
        "Enter the value below and click Save Cookie header and check again.",
      ],
    },
  ],
}

const DEFAULT_COOKIE_GUIDANCE: ProviderOnboardingVariant[] = [
  {
    title: "Copy the Cookie header from a browser",
    steps: [
      "Sign in to the provider in a browser.",
      "Press F12, select Network, and reload the page.",
      "Open the relevant usage or Billing request.",
      "Open Request Headers and copy the Cookie value. Do not copy Set-Cookie.",
      "Enter the value below and click Save Cookie header and check again.",
    ],
  },
]

export function getProviderCookieGuidance(providerId: string): ProviderOnboardingVariant[] {
  return COOKIE_ONBOARDING_GUIDANCE[providerId] ?? DEFAULT_COOKIE_GUIDANCE
}
