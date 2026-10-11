# Screenshot provenance

Captured October 11, 2026 from the Debug apps built from this public snapshot:

- `apple-tv.png`: Apple TV 4K simulator, tvOS 27, 1920×1080.
- `ipad.png`: iPad Pro 13-inch (M5) simulator, iPadOS 27, portrait.
- `onboarding.png`: the same iPad simulator, unpaired, with no household data or code entered.

The welcome screens use the included `ipad.fixture.json` and `tv.fixture.json` via the debug-only `GRATA_PREVIEW_SNAPSHOT` launch environment. Maple House, Avery, Jordan, plans, weather and Wi-Fi are fictional. The QR encodes `fictional-demo-only`; it is not a real network credential. Preview controls and notes are disabled. The clock uses simulator time; fixture event dates are fixed to the capture date.

Build the schemes as described in [verification](../verification.md). Install the resulting app with `xcrun simctl install <device-id> <app-path>`, then launch with:

```sh
SIMCTL_CHILD_GRATA_PREVIEW_SNAPSHOT=/absolute/path/to/docs/screenshots/ipad.fixture.json xcrun simctl launch <ipad-device-id> com.grata.domum.ipad
xcrun simctl io <ipad-device-id> screenshot ipad.png
```

Use `tv.fixture.json` and `com.grata.domum.tv` for Apple TV. For onboarding, terminate and launch the unpaired app without a preview environment. Do not use a device already paired with real household data.

These are app renders, not design mockups. They demonstrate layout and bundled assets, not physical QR scanning, network permission prompts or remote/touch behavior.
