export async function apiJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  let result: { error?: { message?: unknown } } | null = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      result = await response.json();
    } catch {
      /* bounded fallback below */
    }
  }
  if (!response.ok || !result) {
    const message = result?.error?.message;
    throw new Error(typeof message === "string" ? message : fallback);
  }
  return result as T;
}
