export type IconName =
  | "learning"
  | "home"
  | "workshops"
  | "certificate"
  | "community"
  | "person"
  | "admin"
  | "help"
  | "logout"
  | "more"
  | "arrow"
  | "key"
  | "activity"
  | "requests"
  | "sun";
const paths: Record<IconName, string> = {
  learning:
    "M4 19V5c4-1 6 0 8 2 2-2 4-3 8-2v14c-4-1-6 0-8 2-2-2-4-3-8-2Zm8-12v14",
  home: "m3 10 9-7 9 7v10H6V10m4 10v-7h4v7",
  workshops: "M3 5h18v13H3zM8 22h8M12 18v4M7 9h10M7 13h6",
  certificate: "M5 3h14v12H5zM9 7h6M9 11h4m-5 4-1 7 5-3 5 3-1-7",
  community:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 7",
  person: "M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  admin: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-14a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01",
  logout: "M9 3H4v18h5m5-14 5 5-5 5m-6-5h13",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  key: "M8 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm4-2 9 9m-4-4 3-3",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  requests: "M4 3h16v14H8l-4 4zM8 7h8M8 11h5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
};
export default function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
