import os from "os";

export function suggestedBase(request: Request, fallbackPort = 8787): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("host") || url.host || `127.0.0.1:${fallbackPort}`;
  let hostname = host;
  let port = "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    hostname = host.slice(1, end);
    port = host.slice(end + 2);
  } else if (host.includes(":")) {
    const split = host.lastIndexOf(":");
    hostname = host.slice(0, split);
    port = host.slice(split + 1);
  }
  if (!port) port = url.port || String(fallbackPort);
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    const lan = firstLanIPv4();
    if (lan) hostname = lan;
  }
  const scheme =
    url.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
      ? "https"
      : "http";
  return `${scheme}://${hostname}:${port}`;
}

export function firstLanIPv4(): string {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "";
}
