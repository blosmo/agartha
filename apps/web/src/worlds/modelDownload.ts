import files from '../../public/starter-assets/model-files.json';

const starterFiles = new Map(Object.entries(files));

/** Bundled starter assets avoid the API and storage redirect waterfall. */
export async function downloadModel(id: string, signal: AbortSignal) {
  const file = starterFiles.get(id);
  if (file) {
    try {
      const response = await fetch(`/starter-assets/${file}?v=${id.slice(6)}`, { signal });
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (`model-${hash}` === id) return bytes;
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  const response = await fetch(`/api/models/${id}/file`, { signal });
  if (!response.ok) throw new Error(`Model could not load (${response.status}).`);
  return response.arrayBuffer();
}
