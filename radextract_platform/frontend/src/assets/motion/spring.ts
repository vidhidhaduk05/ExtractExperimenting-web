/** Damped springs used by the approved landing motion, without global state. */
export function springRevealFrames(distance: number, duration: number): Keyframe[] {
  const omega = Math.sqrt(270);
  const decay = 13;
  const damped = Math.sqrt(omega * omega - decay * decay);
  const frames: Keyframe[] = [];
  for (let index = 0; index <= 60; index++) {
    const offset = index / 60;
    const time = (offset * duration) / 1000;
    const displacement = Math.exp(-decay * time) *
      (Math.cos(damped * time) + (decay / damped) * Math.sin(damped * time));
    frames.push({ offset, opacity: Math.max(0, Math.min(1, (1 - displacement) * 1.12)), translate: `0 ${distance * displacement}px` });
  }
  frames[frames.length - 1] = { offset: 1, opacity: 1, translate: "0 0" };
  return frames;
}

export function createSpring({
  stiffness = 250, damping = 29, onUpdate, onRest = () => {},
}: {
  stiffness?: number;
  damping?: number;
  onUpdate: (value: number) => void;
  onRest?: (value: number) => void;
}) {
  let value = 0, velocity = 0, target = 0, frame = 0, last = 0;
  function tick(now: number) {
    let remaining = Math.min((now - last) / 1000, 0.034);
    last = now;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      velocity += (-stiffness * (value - target) - damping * velocity) * dt;
      value += velocity * dt;
      remaining -= dt;
    }
    onUpdate(value);
    if (Math.abs(value - target) < 0.025 && Math.abs(velocity) < 0.1) {
      value = target; velocity = 0; frame = 0;
      onUpdate(value); onRest(value);
    } else frame = requestAnimationFrame(tick);
  }
  return {
    setTarget(next: number) {
      target = next;
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    },
    reset() { cancelAnimationFrame(frame); frame = 0; value = velocity = target = 0; onUpdate(0); },
    get value() { return value; },
    get velocity() { return velocity; },
  };
}
