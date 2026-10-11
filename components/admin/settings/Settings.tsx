"use client";

import { useState } from "react";
import { adminApi } from "../client";
import { useHost } from "../shell/context";
import { useUnsaved } from "../house/useUnsaved";

export function Settings() {
  const { overview, run, pending } = useHost();
  const [form, setForm] = useState({
    ...overview.household,
    haToken: "",
    clearHAToken: false,
  });
  const [saved, setSaved] = useState(form);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsaved(dirty);
  const busy = pending || working;
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  }
  return (
    <>
      <header className="host-heading">
        <div>
          <p className="host-eyebrow">Your household</p>
          <h1>Make it feel like home</h1>
          <p className="host-muted">
            The shared details every visit uses. Saved changes appear on paired
            displays.
          </p>
        </div>
        <span className="host-badge">
          {dirty ? "Unsaved changes" : "Settings saved"}
        </span>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          if (
            form.clearHAToken &&
            !window.confirm(
              "Remove the saved Home Assistant token? Room controls will stop working until you add a new token.",
            )
          )
            return;
          if (await run("/api/v1/admin/settings", form, "PUT")) {
            const next = { ...form, haToken: "", clearHAToken: false };
            setForm(next);
            setSaved(next);
            setMessage("Household settings saved.");
          }
        }}
      >
        <fieldset disabled={busy} className="host-panel">
          <legend>Essentials</legend>
          <div className="host-form-grid">
            <label>
              Household name
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>
            <label>
              Household time zone
              <input
                required
                value={form.timeZone}
                onChange={(event) => set("timeZone", event.target.value)}
                placeholder="America/New_York"
              />
            </label>
            <label>
              Temperature unit
              <select
                value={form.temperatureUnit}
                onChange={(event) =>
                  set(
                    "temperatureUnit",
                    event.target.value === "celsius" ? "celsius" : "fahrenheit",
                  )
                }
              >
                <option value="fahrenheit">Fahrenheit</option>
                <option value="celsius">Celsius</option>
              </select>
            </label>
          </div>
          <p className="host-muted">
            Dates, greetings and visit schedules use this time zone, even if a
            display has a different setting.
          </p>
        </fieldset>
        <fieldset disabled={busy} className="host-panel">
          <legend>Guest Wi-Fi</legend>
          <div className="host-form-grid">
            <label>
              Network name
              <input
                maxLength={80}
                value={form.wifiSSID}
                onChange={(event) => set("wifiSSID", event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Network security
              <select
                value={form.wifiSecurity}
                onChange={(event) =>
                  set(
                    "wifiSecurity",
                    event.target.value as typeof form.wifiSecurity,
                  )
                }
              >
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open network</option>
              </select>
            </label>
            <label>
              Wi-Fi password
              <input
                type={showPassword ? "text" : "password"}
                disabled={form.wifiSecurity === "nopass"}
                maxLength={120}
                value={form.wifiPassword}
                onChange={(event) => set("wifiPassword", event.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <button
            type="button"
            className="quiet"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide password here" : "Show password here"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={form.wifiHidePassword}
              onChange={(event) =>
                set("wifiHidePassword", event.target.checked)
              }
            />{" "}
            Hide written password on guest displays
          </label>
          <p className="host-muted">
            The join QR code still contains the password so guests can connect.
            Leave the network name blank to omit Wi-Fi from the welcome.
          </p>
        </fieldset>
        <fieldset disabled={busy} className="host-panel">
          <legend>Location and weather</legend>
          <div className="host-form-grid">
            <label>
              Street address
              <input
                maxLength={160}
                value={form.addressLine}
                onChange={(event) => set("addressLine", event.target.value)}
              />
            </label>
            <label>
              Postal code
              <input
                maxLength={20}
                value={form.postalCode}
                onChange={(event) => set("postalCode", event.target.value)}
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={form.showAddress}
              onChange={(event) => set("showAddress", event.target.checked)}
            />{" "}
            Show the address to guests
          </label>
          <button
            type="button"
            className="quiet"
            disabled={!form.postalCode.trim()}
            onClick={async () => {
              setWorking(true);
              setError("");
              setMessage("");
              try {
                const place = await adminApi<{
                  latitude: number;
                  longitude: number;
                }>("/api/v1/admin/geocode", {
                  method: "POST",
                  body: JSON.stringify({ postalCode: form.postalCode }),
                });
                setForm((current) => ({
                  ...current,
                  latitude: place.latitude,
                  longitude: place.longitude,
                }));
                setMessage("Weather location found. Save settings to use it.");
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "That postal code was not found.",
                );
              } finally {
                setWorking(false);
              }
            }}
          >
            Find weather location from postal code
          </button>
          <details>
            <summary>Weather coordinates</summary>
            <p className="host-muted">
              Set both coordinates, or leave both blank. Your street address is
              not needed for weather.
            </p>
            <div className="host-form-grid">
              <label>
                Latitude
                <input
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={form.latitude ?? ""}
                  onChange={(event) =>
                    set(
                      "latitude",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={form.longitude ?? ""}
                  onChange={(event) =>
                    set(
                      "longitude",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
          </details>
        </fieldset>
        <fieldset disabled={busy} className="host-panel">
          <legend>Guest notes</legend>
          <label>
            <input
              type="checkbox"
              checked={form.showNotesOnTV}
              onChange={(event) => set("showNotesOnTV", event.target.checked)}
            />{" "}
            Show a recent note on Apple TV
          </label>
          <label>
            Keep notes for this many days
            <input
              required
              type="number"
              min={1}
              max={90}
              value={form.noteExpiryDays}
              onChange={(event) =>
                set("noteExpiryDays", Number(event.target.value))
              }
            />
          </label>
        </fieldset>
        <fieldset disabled={busy} className="host-panel">
          <legend>Integrations · optional</legend>
          <h2>Home Assistant</h2>
          <p className="host-muted">
            Your welcome works without an integration. Connect Home Assistant
            only if you want to offer room controls.
          </p>
          <span className="host-badge">
            {overview.household.haConfigured
              ? "Credentials saved · not a connection check"
              : "Not configured"}
          </span>
          <label>
            Server address
            <input
              type="url"
              value={form.haBaseURL}
              onChange={(event) => set("haBaseURL", event.target.value)}
              placeholder="http://homeassistant.local:8123"
            />
          </label>
          <label>
            New access token
            <input
              type="password"
              autoComplete="off"
              maxLength={400}
              value={form.haToken}
              disabled={form.clearHAToken}
              onChange={(event) => set("haToken", event.target.value)}
              placeholder={
                overview.household.haConfigured
                  ? "Leave blank to keep the saved token"
                  : "Long-lived access token"
              }
            />
          </label>
          {overview.household.haConfigured && (
            <label>
              <input
                type="checkbox"
                checked={form.clearHAToken}
                onChange={(event) => set("clearHAToken", event.target.checked)}
              />{" "}
              Remove the saved token when settings are saved
            </label>
          )}
          <p className="host-muted">
            The token stays on your home server. Testing uses the last saved
            address and token.
          </p>
          <button
            type="button"
            className="quiet"
            disabled={!overview.household.haConfigured}
            onClick={async () => {
              setWorking(true);
              setError("");
              setMessage("");
              try {
                const result = await adminApi<{ message?: string }>(
                  "/api/v1/admin/home-assistant/test",
                  { method: "POST" },
                );
                setMessage(
                  result.message ||
                    "Home Assistant responded using the saved settings.",
                );
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Home Assistant did not respond.",
                );
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? "Checking…" : "Test saved connection"}
          </button>
        </fieldset>
        {error && (
          <p className="host-alert" role="alert">
            {error}
          </p>
        )}
        <p role="status">{message}</p>
        <div className="host-actions">
          <button type="submit" disabled={busy || !dirty}>
            {busy ? "Working…" : "Save household settings"}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy || !dirty}
            onClick={() => {
              if (window.confirm("Discard unsaved household settings?")) {
                setForm(saved);
                setError("");
                setMessage("");
              }
            }}
          >
            Discard changes
          </button>
        </div>
      </form>
      <section className="host-panel">
        <h2>Appearance</h2>
        <p className="host-muted">
          Choose a theme for each visit in the visit editor. Built-in themes are
          ready to use.
        </p>
        <div className="host-form-grid">
          {overview.themes.map((theme) => (
            <div key={theme.id}>
              <strong>{theme.name}</strong>
              <p className="host-muted">
                {theme.id === "christmas"
                  ? "Evergreen, cranberry and warm winter light"
                  : theme.id === "default"
                    ? "A bright, warm welcome for any visit"
                    : "Custom household theme"}
              </p>
            </div>
          ))}
        </div>
        <details>
          <summary>Advanced: create a custom theme</summary>
          <ThemeForm />
        </details>
      </section>
    </>
  );
}

function ThemeForm() {
  const { overview, run, pending } = useHost();
  const [theme, setTheme] = useState({
    id: "",
    name: "",
    background: "#f4efe6",
    backgroundSecondary: "#e7e0d4",
    text: "#241c16",
    textSecondary: "#5e5348",
    accent: "#8e3d2f",
    accentText: "#fffcf7",
    surface: "#fffcf7",
    surfaceText: "#241c16",
    surfaceMuted: "#5e5348",
    motion: "none" as "none" | "gentle",
    greetingStyle: "plain" as "plain" | "festive",
  });
  const colors = [
    "background",
    "backgroundSecondary",
    "text",
    "textSecondary",
    "accent",
    "accentText",
    "surface",
    "surfaceText",
    "surfaceMuted",
  ] as const;
  return (
    <form
      className="stack-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run("/api/v1/admin/themes", theme);
      }}
    >
      <h2>Custom theme</h2>
      <p>Text needs to stay readable. Built-in themes stay as they are.</p>
      <label>
        Name
        <input
          value={theme.name}
          onChange={(event) =>
            setTheme({
              ...theme,
              name: event.target.value,
              id: event.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/^-|-$/g, ""),
            })
          }
        />
      </label>
      <p>Id: {theme.id || "—"}</p>
      {colors.map((key) => (
        <label key={key}>
          {key}
          <input
            type="color"
            value={theme[key]}
            onChange={(event) =>
              setTheme({ ...theme, [key]: event.target.value })
            }
          />
        </label>
      ))}
      <label>
        Motion
        <select
          value={theme.motion}
          onChange={(event) =>
            setTheme({
              ...theme,
              motion: event.target.value === "gentle" ? "gentle" : "none",
            })
          }
        >
          <option value="none">None</option>
          <option value="gentle">Gentle</option>
        </select>
      </label>
      <button type="submit" disabled={pending || !theme.name.trim()}>
        Save theme
      </button>
      <ul>
        {overview.themes
          .filter((item) => item.id !== "default" && item.id !== "christmas")
          .map((item) => (
            <li key={item.id}>
              {item.name}{" "}
              <button
                type="button"
                className="quiet"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove the ${item.name} theme? Visits using it will need another theme.`,
                    )
                  )
                    void run(
                      `/api/v1/admin/themes/${item.id}`,
                      undefined,
                      "DELETE",
                    );
                }}
              >
                Remove
              </button>
            </li>
          ))}
      </ul>
    </form>
  );
}
