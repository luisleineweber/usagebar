export type ProviderOnboardingVariant = {
  title: string
  steps: string[]
}

const COOKIE_ONBOARDING_GUIDANCE: Record<string, ProviderOnboardingVariant[]> = {
  ollama: [
    {
      title: "Variante 1: Mit Ollama anmelden (empfohlen)",
      steps: [
        "Öffne ein Terminal.",
        "Führe ollama signin aus und melde dich an.",
        "Klicke oben auf Erneut prüfen. Fehlt der Cookie weiterhin, nutze Variante 2.",
      ],
    },
    {
      title: "Variante 2: Cookie aus dem Browser",
      steps: [
        "Melde dich auf ollama.com an und öffne ollama.com/settings.",
        "Drücke F12 und wähle Network oder Netzwerk.",
        "Lade die Seite neu und öffne eine Anfrage an ollama.com.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  opencode: [
    {
      title: "Cookie aus dem Browser",
      steps: [
        "Melde dich auf opencode.ai an.",
        "Öffne die Billing-Seite des richtigen Workspace.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne die Billing- oder _server-Anfrage.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  codex: [
    {
      title: "Variante 1: Mit Codex anmelden",
      steps: [
        "Installiere die Codex CLI, falls sie noch fehlt.",
        "Führe codex login aus und melde dich an.",
        "Klicke oben auf Erneut prüfen.",
      ],
    },
    {
      title: "Variante 2: Dashboard-Cookie aus dem Browser",
      steps: [
        "Melde dich auf chatgpt.com an und öffne das Codex-Dashboard.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne eine Anfrage des Codex-Dashboards.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  claude: [
    {
      title: "Variante 1: Mit Claude Code anmelden",
      steps: [
        "Starte Claude Code.",
        "Führe /login aus und melde dich an.",
        "Klicke oben auf Erneut prüfen.",
      ],
    },
    {
      title: "Variante 2: Cookie aus dem Browser",
      steps: [
        "Melde dich auf claude.ai an.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne eine Anfrage von claude.ai.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  zed: [
    {
      title: "Cookie aus dem Zed-Dashboard",
      steps: [
        "Öffne dashboard.zed.dev und melde dich an.",
        "Öffne die Seite Zed AI Usage.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne die Anfrage für die Nutzung.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  abacus: [
    {
      title: "Cookie aus Abacus AI",
      steps: [
        "Melde dich auf apps.abacus.ai an.",
        "Öffne die Seite für Compute Points oder Nutzung.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne die Anfrage für Compute Points.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  perplexity: [
    {
      title: "Cookie aus Perplexity",
      steps: [
        "Melde dich auf perplexity.ai an.",
        "Öffne die Account- oder Billing-Seite.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne die Anfrage für Credits oder Billing.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
  augment: [
    {
      title: "Variante 1: Mit Augment anmelden",
      steps: [
        "Öffne ein Terminal.",
        "Führe auggie login aus und melde dich an.",
        "Klicke oben auf Erneut prüfen.",
      ],
    },
    {
      title: "Variante 2: Cookie aus dem Browser",
      steps: [
        "Melde dich auf app.augmentcode.com an.",
        "Öffne die Seite für Subscription oder Credits.",
        "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
        "Öffne die Anfrage für Subscription oder Credits.",
        "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
        "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
      ],
    },
  ],
}

const DEFAULT_COOKIE_GUIDANCE: ProviderOnboardingVariant[] = [
  {
    title: "Cookie aus dem Browser",
    steps: [
      "Melde dich beim Provider im Browser an.",
      "Drücke F12, wähle Network oder Netzwerk und lade die Seite neu.",
      "Öffne die passende Nutzungs- oder Billing-Anfrage.",
      "Öffne Request Headers und kopiere den Wert bei Cookie, nicht Set-Cookie.",
      "Füge den Wert unten ein und klicke auf Cookie speichern und erneut prüfen.",
    ],
  },
]

export function getProviderCookieGuidance(providerId: string): ProviderOnboardingVariant[] {
  return COOKIE_ONBOARDING_GUIDANCE[providerId] ?? DEFAULT_COOKIE_GUIDANCE
}
