/** Parse mutation acknowledgements as well as JSON resource responses. */
export async function parseAPIResponse(response) {
  const raw = await response.text();
  if (response.ok && !raw.trim()) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Non-JSON API response ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        error: data.error,
        requestId: response.headers.get("x-request-id"),
      }),
    );
  }
  return data;
}

/** Standard, short-context Astra prices, including possible cache writes. */
export function conservativeTokenCost(usage) {
  if (
    !usage ||
    !Number.isFinite(usage.input_tokens) ||
    !Number.isFinite(usage.output_tokens)
  ) {
    throw new Error("Token usage unavailable");
  }
  return (usage.input_tokens * 22.5 + usage.output_tokens * 50) / 1_000_000;
}
