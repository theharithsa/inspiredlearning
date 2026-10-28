// Production builds have separate HTML entries/output directories. The dev path
// selects the admin entry only for local rehearsal; a route grants no authority.
export const isAdminApp =
  import.meta.env.MODE === "admin" ||
  (import.meta.env.DEV && location.pathname === "/admin.html");
export const adminUrl = (path = "/") =>
  import.meta.env.DEV
    ? `/admin.html#${path}`
    : `https://admin.inspi.in/#${path}`;
export const learnerUrl = (path = "/") =>
  import.meta.env.DEV ? `/#${path}` : `https://inspi.in/#${path}`;
