# Connect displays with Bonjour

Native iPad and Apple TV apps now offer **Find nearby servers**, a connection check and manual entry. Select your server, enter a single-use code from the host's Displays page, then assign the paired display's room there. Browsing and health checks never send a device token. Devices on different VLANs or isolated guest Wi-Fi may need a manual address.

## Start a server with temporary advertisement

Use Node >=22.13 and the existing npm lockfile. Build with `npm run build`, then run:

```sh
node scripts/serve-with-discovery.mjs
```

For development use `node scripts/serve-with-discovery.mjs --dev`. Use a temporary `GRATA_DATA` directory for testing. Do not run a dev server and a build against the same `.next` directory at once.

The launcher starts Next and one OS advertisement process, stops the advertisement when Next exits, and forwards Ctrl-C/termination to both. It does not install any persistent service. The existing `npm run start`/`dev` commands remain manual-address operation. To disable advertisement with the launcher, set `GRATA_DISCOVERY=0`.

| Environment | Default | Meaning |
| --- | --- | --- |
| `GRATA_PORT` | `8787` | Actual Next listener port |
| `GRATA_DISCOVERY_PORT` | Listener port | Client-facing port on this same host |
| `GRATA_DISCOVERY_SCHEME` | `http` | `http` or `https`; no automatic downgrade |
| `GRATA_DISCOVERY_LABEL` | `Grata Domum home server` | Neutral label, maximum 63 bytes; avoid household names |

macOS uses `/usr/bin/dns-sd`. Linux uses `avahi-publish-service` (normally supplied by the distribution's Avahi utilities package). Missing advertisement tooling does not stop Next; manual entry continues to work. The launcher does not install tooling or change a firewall. Run it under your normal server process supervisor if startup after reboot is wanted; stop the supervisor to disable it. Multiple server deployments need distinguishable neutral labels and separate ports/data directories.

## Optional Linux static advertisement

[grata-domum.service](grata-domum.service) is an alternative host-side Avahi template. Review its port/scheme and put it in the host's `/etc/avahi/services/` using your normal deployment process. Avahi loads service files from that directory. Remove the file to disable it; do not run both static advertisement and the launcher advertiser. Static advertisement remains visible if Next stops, so clients always make an HTTP health check before pairing.

For containers, advertise from the host with the published host port. Container-internal names and ports are not reachable addresses for a display. For a reverse proxy on the same host, advertise its reachable port and `https` scheme when applicable; the certificate must validate for the resolved `.local` hostname. Proxies on a different host require advertisement on that proxy host. Only origin-root deployments are supported by this onboarding flow. Neither a registration nor a discovered service proves the HTTP server is reachable.

## Troubleshooting and compatibility

- If no servers appear, confirm the launcher/Avahi registration, same LAN and local-network access. Multicast may be blocked even while ordinary HTTP works. Enter the server's stable URL manually and choose **Check connection**.
- A server requiring initial setup directs you to finish setup in a browser. Discovery does not bypass host authentication or consume pairing codes.
- Unsupported API versions show an update message. Older servers can still pair through a manually entered address after their existing health response validates.
- A public installation UUID in health is informational and survives restart/backup. It is not authentication. The app never automatically transfers an existing token to a newly discovered origin.
- Input accepts a root `http`/`https` origin with hostname, IPv4 or bracketed IPv6 and optional port. Passwords, queries and deployment subpaths are rejected.
- Failed code redemption preserves code/name input. Pairing followed by a failed first content load retains the paired token and offers retry.

Real-device network permission, LAN multicast, HTTPS/proxy and physical TV remote checks remain required before household release. No persistent advertiser or household configuration was installed by this implementation.
