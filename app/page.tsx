"use client";

import { useEffect, useState } from "react";

export default function Door() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch("/api/v1/health")
      .then((response) => response.json())
      .then((health) => setSetupRequired(Boolean(health.setupRequired)))
      .catch(() => setSetupRequired(null));
  }, []);
  return (
    <main className="door">
      <p className="eyebrow">Grata Domum</p>
      <h1>Welcome home</h1>
      <p>
        The host sets up the house. Guests use a paired iPad or the large
        television layout.
      </p>
      <div className="choices">
        <a href="/admin">{setupRequired ? "Set up the house" : "Host"}</a>
        <a className="quiet" href="/display">
          iPad display
        </a>
        <a className="quiet" href="/tv">
          Apple TV
        </a>
      </div>
    </main>
  );
}
