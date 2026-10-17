// The kitchen's make-believe day (#159): one day every 20 minutes and weather drawn every 30.
// Pure: no DOM or Three.js, so it runs in Node tests. Decorative only: it reads neither the
// computer's time nor anything the user typed.

export const DAY_MS = 20 * 60 * 1000;
export const WEATHER_MS = 30 * 60 * 1000;
// How long snow takes to settle fully on the roofs, and to melt once it stops.
export const SNOW_MS = 60 * 1000;
export const PHASES = ["night", "sunrise", "day", "sunset"];
export const WEATHERS = ["sun", "cloud", "rain", "snow"];
// The hour a forced phase (?sky=) holds the clock at.
export const PHASE_HOUR = { night: 0, sunrise: 6.5, day: 12, sunset: 18.5 };
// Running totals of the odds: cloud 40%, sun 30%, rain 25%, snow 5%.
const ODDS = [["cloud", 0.4], ["sun", 0.7], ["rain", 0.95], ["snow", 1]];

// The kitchen's hour, 0 to 24, `elapsedMs` after a day that began at `startHour`.
export function kitchenHour(startHour, elapsedMs) {
  return (((startHour + (elapsedMs / DAY_MS) * 24) % 24) + 24) % 24;
}

export function phaseAt(hour) {
  return hour < 6 || hour >= 19 ? "night" : hour < 7 ? "sunrise" : hour < 18 ? "day" : "sunset";
}

// British odds; the same weather may come round again.
export function pickWeather(random) {
  const roll = random();
  return ODDS.find(([, upTo]) => roll < upTo)?.[0] ?? "snow";
}

// ?sky= and ?weather= force one look for previews and tests. Unknown values are ignored.
export function readOverrides(search) {
  const params = new URLSearchParams(search);
  const sky = params.get("sky");
  const weather = params.get("weather");
  return { sky: PHASES.includes(sky) ? sky : null, weather: WEATHERS.includes(weather) ? weather : null };
}

// Snow depth on roofs and sill, 0 to 1, after `dtMs` more of snowing or not.
export function settleSnow(depth, snowing, dtMs) {
  return Math.min(1, Math.max(0, depth + (snowing ? 1 : -1) * (dtMs / SNOW_MS)));
}

// Clock hands in radians, clockwise from twelve.
export function handAngles(hour) {
  return { hour: ((hour % 12) / 12) * Math.PI * 2, minute: (hour % 1) * Math.PI * 2 };
}

// Colours are sRGB hex. background: beyond the room; sky and band: the window's sky and its
// low band at sunrise and sunset; ambient over ground: the hemisphere light; sun: the key light;
// city, cityFar and cityWindow: the skyline; cloud and storm: fair and overcast clouds.
const LOOKS = {
  day: {
    background: 0xeef0e8, sky: 0x8fc3e8, band: 0x8fc3e8, ambient: 0xffffff, ground: 0x8a9a80, ambientIntensity: 1.7, sun: 0xffffff, sunIntensity: 1.6,
    city: 0x5b6872, cityFar: 0x93a7b4, cityWindow: 0xb8d4e6, cloud: 0xf4f6f8, storm: 0x9aa2a8,
  },
  sunrise: {
    background: 0xf1e2da, sky: 0xeeb2a6, band: 0xf6d48c, ambient: 0xffe6dc, ground: 0x9a8a80, ambientIntensity: 1.35, sun: 0xffc9a0, sunIntensity: 1.3,
    city: 0x6a5a66, cityFar: 0xb39098, cityWindow: 0xd8c0c0, cloud: 0xf6e0dc, storm: 0x9a9498,
  },
  sunset: {
    background: 0xefd3bf, sky: 0xd97a62, band: 0xf0ae58, ambient: 0xffcfa8, ground: 0x8a6a58, ambientIntensity: 1.15, sun: 0xff9a55, sunIntensity: 1.35,
    city: 0x5a3f48, cityFar: 0xa86c62, cityWindow: 0xe0a070, cloud: 0xf0c0a0, storm: 0x8a7a78,
  },
  night: {
    background: 0x252c3c, sky: 0x1b2440, band: 0x24305a, ambient: 0x7484b4, ground: 0x2a3040, ambientIntensity: 0.6, sun: 0x8a96bc, sunIntensity: 0.25,
    city: 0x161c2c, cityFar: 0x283250, cityWindow: 0x222a3c, cloud: 0x3a4460, storm: 0x2c3240,
  },
};
// Bad weather greys the daylight and the sky and takes some of the light; night stays night.
const DULL = { sun: [0, 1, 1], cloud: [0.35, 0.6, 0.85], rain: [0.5, 0.5, 0.8], snow: [0.3, 0.75, 0.95] };
const OVERCAST = 0xa9afb4;

// The room's light for a phase and weather. The ceiling light is on at night only.
export function lightFor(phase, weather) {
  const look = LOOKS[phase];
  const [grey, sun, ambient] = DULL[weather];
  const dull = phase === "night" ? grey / 3 : grey;
  return {
    ...look,
    sky: mixHex(look.sky, phase === "night" ? 0x2a2f3a : OVERCAST, dull * 1.4),
    band: mixHex(look.band, phase === "night" ? 0x2a2f3a : OVERCAST, dull * 1.4),
    sun: mixHex(look.sun, OVERCAST, dull),
    sunIntensity: look.sunIntensity * sun,
    ambientIntensity: look.ambientIntensity * ambient,
    cloud: weather === "rain" || weather === "snow" ? look.storm : look.cloud,
    ceiling: phase === "night",
  };
}

export function mixHex(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [16, 8, 0].reduce((out, shift) => {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    return out | (Math.round(ca + (cb - ca) * k) << shift);
  }, 0);
}
