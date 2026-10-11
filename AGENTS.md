# Contributor guidance

Grata Domum is a self-hosted guest welcome app. SwiftUI is the primary iPad/TV interface; Next.js provides the server, host console and browser fallbacks.

- Keep tokens and HA entity IDs server-side. Only explicitly guest-visible Wi-Fi information reaches displays.
- Enforce read-only TV behavior on the server. Scope iPad actions by assigned room. Never queue physical commands.
- Preview must not pair devices, pin visits, send notes or run controls. Saved feedback must reflect persisted state.
- Preserve note request IDs across retries. Clear household cache/outbox on forget, revocation or server change.
- All dates follow the household time zone; date-only values stay dates. Consume the common fictional fixtures rather than duplicating visit-selection rules.
- Use strict TypeScript and small SwiftUI views. Keep transport/session behavior out of views. Follow existing formatter settings.
- Keep the approved solid-color cards, explicit foreground/background pairs, keyboard/remote focus, Dynamic Type and Reduce Motion behavior.
- Generate shared Swift tokens from `contracts/design-tokens.json`; do not hand-edit `WelcomeBookTokens.swift`.
- Use isolated `GRATA_DATA`, test databases and DerivedData. Never run concurrent Next processes sharing `.next`.
- Run the checks in README, plus appropriate native builds. UI changes require actual rendered inspection. Record physical/device limitations honestly.
- Never commit live data, passwords, tokens, signing identities or screenshots of real household information.
