// @ts-check

const ONE_MINUTE_MS = 60 * 1000;

/**
 * Creates an evenly spaced rate limiter. Reservations are made synchronously,
 * so concurrent callers are still assigned distinct start times.
 *
 * @param {number} ratePerMinute
 * @param {{ now?: () => number, wait?: (ms: number) => Promise<void> }} [options]
 * @returns {() => Promise<void>}
 */
function createPerMinuteRateLimiter(
    ratePerMinute: number,
    options: { now?: () => number, wait?: (ms: number) => Promise<void> } = {}
) {
    if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
        throw new Error('ratePerMinute must be a positive number');
    }

    const now = options.now || Date.now;
    const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const intervalMs = ONE_MINUTE_MS / ratePerMinute;
    let nextStartTime = 0;

    return async function waitForRateLimit() {
        const currentTime = now();
        const scheduledTime = Math.max(currentTime, nextStartTime);
        nextStartTime = scheduledTime + intervalMs;
        const waitMs = scheduledTime - currentTime;
        if (waitMs > 0) {
            await wait(waitMs);
        }
    };
}

exports.createPerMinuteRateLimiter = createPerMinuteRateLimiter;

export {};
