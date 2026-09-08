/** Sample throughout a drag rather than waiting for the drag to finish. */
export function cameraExploration(sample: () => void, delay = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => { timer = undefined; sample(); }, delay);
    },
    dispose() { clearTimeout(timer); timer = undefined; },
  };
}
