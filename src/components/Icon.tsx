type Name = "bolt" | "check" | "lock" | "phone" | "logout" | "offline";
const paths: Record<Name, string> = {
  bolt: "M13 2 4 14h7l-1 8 10-13h-7l1-7Z",
  check: "m5 12 4 4L19 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3",
  phone: "M7 2h10v20H7V2Zm4 17h2",
  logout: "M10 4H4v16h6m4-12 4 4-4 4m-5-4h9",
  offline:
    "m3 3 18 18M2 8a17 17 0 0 1 4-2m4-1a17 17 0 0 1 12 3M5 12a12 12 0 0 1 5-2m4 0a12 12 0 0 1 5 2m-11 4a6 6 0 0 1 6-1m-2 5h.01",
};
export function Icon({ name, className }: { name: Name; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
