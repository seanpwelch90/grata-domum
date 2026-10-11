# Verification status

Public snapshot checked October 11, 2026 on macOS with Node 22.19.0 and available Xcode simulator SDKs.

| Check | Result |
| --- | --- |
| `npm ci` | Passed from the checked-in lockfile |
| `npm test` | 38 tests passed |
| TypeScript, ESLint, Prettier checks | Passed |
| `npm run build` | Passed with an isolated temporary `GRATA_DATA` |
| `npm run swift:lint` | Passed |
| Shared `swift test` | 23 tests executed: 21 passed, 2 opt-in LAN checks skipped in the default run |
| Opt-in Bonjour integration | All 9 onboarding tests passed with a temporary production server, including real discovery, SRV resolution, product health and advertiser removal |
| iPad simulator Debug build | Passed, code signing disabled |
| Apple TV simulator Debug build | Passed, code signing disabled |
| Public screenshot inspection | Fresh iPad welcome, TV welcome and unpaired onboarding renders inspected |
| `npm audit` | Zero known vulnerabilities after compatible dependency updates |

The publication copy updates Next.js and affected transitive dependencies through the existing semver ranges. Web tests, type checking, lint, formatting and production build were rerun after those updates. The original private checkout remains unchanged.

Native build commands (choose unique DerivedData directories):

```sh
xcodebuild -project clients/GrataDomum.xcodeproj -scheme 'Grata Domum' -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/grata-ipad-check CODE_SIGNING_ALLOWED=NO build
xcodebuild -project clients/GrataDomum.xcodeproj -scheme 'Grata Domum TV' -sdk appletvsimulator -configuration Debug -derivedDataPath /tmp/grata-tv-check CODE_SIGNING_ALLOWED=NO build
```

Remaining release checks: signed physical installs, local-network permission denial/retry, real LAN/VLAN and HTTPS configurations, TV remote Back/focus, VoiceOver and largest text sizes, actual rotation/map alignment, physical QR scans, offline/reconnect and note retries across device restarts, overnight date transitions, deployment reboot and backup/restore rehearsal. No real Home Assistant actions or household data were used for this checkpoint.

SQLite’s experimental-runtime warning and the Vitest configuration’s future-loader warning remain. Passing automated checks is not a claim of full household release acceptance.
