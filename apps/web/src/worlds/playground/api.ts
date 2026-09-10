export class PlaygroundRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function playgroundRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(25000),
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new PlaygroundRequestError(
      typeof value.error === "string"
        ? value.error
        : "The playground could not complete this request.",
      response.status,
    );
  return value as T;
}
