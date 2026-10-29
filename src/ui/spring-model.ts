/** Current Material 3 motion physics tokens, verified 30 October 2026.
 * https://m3.material.io/styles/motion/overview/specs
 * Damping is a ratio; stiffness assumes unit mass. */
export const SPRINGS = {
  expressive: { damping: 0.6, stiffness: 800 },
  standard: { damping: 0.9, stiffness: 1400 },
} as const;
export type Spring = { damping: number; stiffness: number };
export function sampleSpring(
  from: number,
  to: number,
  velocity: number,
  seconds: number,
  spring: Spring,
) {
  const w = Math.sqrt(spring.stiffness),
    a = spring.damping * w;
  const d = w * Math.sqrt(1 - spring.damping ** 2);
  const x = from - to,
    b = (velocity + a * x) / d;
  const t = Math.max(0, seconds),
    decay = Math.exp(-a * t);
  const wave = x * Math.cos(d * t) + b * Math.sin(d * t);
  return {
    position: to + decay * wave,
    velocity:
      decay * (-a * wave + d * (-x * Math.sin(d * t) + b * Math.cos(d * t))),
  };
}
export function springFrames(
  from: number,
  to: number,
  velocity: number,
  spring: Spring,
) {
  const values = [from];
  let duration = 0;
  for (let frame = 1; frame <= 120; frame++) {
    const sample = sampleSpring(from, to, velocity, frame / 120, spring);
    values.push(sample.position);
    duration = (frame / 120) * 1000;
    if (
      Math.abs(sample.position - to) < 0.0001 &&
      Math.abs(sample.velocity) < 0.001
    )
      break;
  }
  values[values.length - 1] = to;
  return { values, duration };
}
