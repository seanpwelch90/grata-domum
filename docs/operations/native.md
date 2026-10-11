# Native installation and household operation

Status: implementation notes, September 27, 2026. Simulator builds and fictional visual fixtures are verified. Signing, physical-device installation, LAN permissions, overnight operation and real QR scanning remain release checks.

## Build and install

Open `clients/GrataDomum.xcodeproj` in Xcode. Schemes are **Grata Domum** (iPad) and **Grata Domum TV** (Apple TV). The current project requires iPadOS 18+ / tvOS 18+; do not lower deployment targets without a compatibility review. Bundle identifiers are `com.grata.domum.ipad` and `com.grata.domum.tv`. Automatic signing is configured, but a developer team is deliberately not committed.

For a physical device, the owner must choose their Team in Signing & Capabilities, pair/register the device in Xcode, select it as the run destination and run the appropriate scheme. Follow Xcode's device/developer-mode prompts. Apple documents this process in [Running your app on simulated or physical devices](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices) and [wireless device pairing](https://help.apple.com/xcode/mac/current/en.lproj/dev3e2f4ee6d.html). No signing identity, provisioning profile or private credential belongs in this repository.

An unsigned simulator `.app` cannot be installed on a physical iPad or Apple TV. A successful simulator build does not confirm account capabilities, device registration, provisioning lifetime or distribution availability. Before Christmas, record the chosen provisioning/distribution method and its expiry/renewal schedule from the actual account. For registered-device distribution use Apple's [distribution instructions](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices); no TestFlight/App Store delivery has been set up or published.

## Connect to the house

1. Keep the server running at a stable address reachable from the display's network. A physical display cannot reach a Mac server using `localhost`.
2. In the host console create a pairing code for the correct surface. Select a nearby server or enter its URL, check the connection, then enter the code in the native app. The code is not an installation link.
3. Assign a friendly device name and, for iPad room controls, the appropriate room. TV is read-only; do not assign physical actions as a workaround.
4. Confirm a visit, theme and known fictional/approved content appears. Verify update propagation before entering real Wi-Fi details or enabling real room controls.

Both native Info.plists declare `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking`. Allow the intended LAN access on the device when prompted. If denied, review the app's Local Network permission in Settings. Simulator success cannot validate this permission: Apple's [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) explicitly notes the simulator does not support local network privacy. Use Find nearby servers with the Bonjour launcher, or enter the address directly. See [discovery setup](discovery.md). Guest-network isolation, firewalls and routed subnets can prevent server access even when Wi-Fi itself works. Do not disable household isolation or broaden firewall exposure automatically; choose the intended network configuration with the owner.

The local-network exception is not a promise that every arbitrary HTTP hostname works. Test the final server address and ATS behavior on the actual devices. Do not add broad `NSAllowsArbitraryLoads` or bypass certificate validation to suppress an error. Keep device tokens and HA credentials out of screenshots and diagnostic reports.

## Sleep, background and reconnection

The app respects the platform's normal idle/sleep behavior; it does **not** disable the idle timer, install kiosk management or guarantee permanent foreground operation. The native roots forward scene phase to `HouseSession.setActive`. Backgrounded displays pause work; returning active triggers refresh/reconnection. Saved content is useful during an outage, but no physical action is queued. An unsupported API is presented as an update requirement. If revoked, reconnect detection clears the household session; revocation cannot be detected while disconnected.

The host must decide display sleep/auto-lock and household privacy expectations on the real devices. Validate wake-up, overnight restart, server restart and Wi-Fi loss/recovery. Keep power/thermal/device placement appropriate for the hardware. A wall-mounted iPad or always-on television is an operational choice, not a guarantee from this application.

## Maintenance and verification

Display settings opens deliberate maintenance. Forgetting requires confirmation and a new pairing code afterward. The QR contains the Wi-Fi password even if its text is hidden. TV prioritizes the complete network name and QR; visible password text is available on iPad when the household allows it. Test scanning from the intended couch/bed position using real phones before release.

See [screenshots](../screenshots/README.md) and [verification status](../verification.md). Required remaining checks include physical remote Back/focus, VoiceOver, actual landscape rotation, queued note retries and household switching, revoked device purge, tall/wide floor plans, real networking/ATS and long credential scanning. Do not mark these complete from screenshots alone.
