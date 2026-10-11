/** Local, decorative navigation marks. Names remain visible beside every icon. */
export function HostIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    today: "M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10",
    visits: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2",
    house: "M5 21V10a7 7 0 0 1 14 0v11M9 21V11a3 3 0 0 1 6 0v10m-3-7h.01",
    displays: "M3 4h18v13H3zM8 21h8m-4-4v4",
    settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  };
  return (
    <svg
      className="host-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.house} />
    </svg>
  );
}

export function DoorwayMark() {
  return (
    <svg
      className="host-brand-mark"
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 38V16a13 13 0 0 1 26 0v22"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M9 38V17a7 7 0 0 1 14 0v21" fill="#F4DEA2" />
      <path d="m23 11-11 5v22h11V11Z" fill="#778579" />
      <circle cx="16" cy="26" r="1" fill="#FFFDF8" />
    </svg>
  );
}
