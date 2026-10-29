/**
 * Cloudflare R2 portfolio upload settings (via Worker).
 */
export const r2Config = {
  workerUrl: 'https://sleek-btg-portfolio.sleek-btg-mv.workers.dev',
  enabled: true,
};

export function isR2Configured() {
  return (
    r2Config.enabled &&
    Boolean(r2Config.workerUrl) &&
    !r2Config.workerUrl.includes('YOUR_WORKER')
  );
}
