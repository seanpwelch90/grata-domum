/** Original bundled house illustration; no remote artwork request. */
export function GuestArt({
  christmas,
  neutral = false,
}: {
  christmas: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="guest-art">
      <img
        src={`/art/house-${christmas ? "christmas" : "default"}.svg`}
        width="400"
        height="260"
        alt=""
        className={
          neutral ? "guest-art-image guest-art-neutral" : "guest-art-image"
        }
      />
    </div>
  );
}
export function GuestIcon({
  name,
}: {
  name:
    | "wifi"
    | "light"
    | "power"
    | "spark"
    | "calendar"
    | "guide"
    | "weather"
    | "arrow";
}) {
  const paths = {
    wifi: (
      <>
        <path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0" />
        <circle cx="12" cy="20" r=".5" />
      </>
    ),
    light: (
      <>
        <path d="M9 18v-2c-5-3-4-12 3-12s8 9 3 12v2m-6 0h6m-5 3h4" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v9m-5-7a9 9 0 1 0 10 0" />
      </>
    ),
    spark: (
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M8 3v5m8-5v5M4 11h16m-11 5h6" />
      </>
    ),
    guide: (
      <>
        <path d="M12 6C8 3 4 4 3 5v14c3-2 6-1 9 1 3-2 6-3 9-1V5c-3-2-6-1-9 1Zm0 0v14" />
      </>
    ),
    weather: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      className="guest-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
