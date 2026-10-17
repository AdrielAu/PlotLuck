// Confirmed boundary or straight-line radius -> district centroid membership.
export function areaDistricts(area, districts) {
  if (!area) throw new Error('Choose a valid search area before comparing districts.');
  if (!area.place) return null;
  if (area.radius === null) return new Set(area.place.districts);
  if (!Number.isFinite(area.radius) || area.radius <= 0) throw new Error('Enter a positive radius.');
  const rad = degrees => degrees * Math.PI / 180;
  return new Set(districts.filter(d => {
    const a = Math.sin(rad(Number(d.centroid_lat) - area.place.lat) / 2) ** 2 + Math.cos(rad(area.place.lat)) * Math.cos(rad(Number(d.centroid_lat))) * Math.sin(rad(Number(d.centroid_lon) - area.place.lon) / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= area.radius;
  }).map(d => d.postcode_district));
}

// Check that the public, polygon-free catalogue belongs to these exact NN1 centroids.
export async function validateCatalogue(catalogue, districts) {
  const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key));
  const text = value => typeof value === "string" && value.trim().length > 0;
  if (!keys(catalogue, ["version", "districtGeometrySha256", "attribution", "places"]) ||
      catalogue.version !== 1 || !text(catalogue.attribution) || !Array.isArray(catalogue.places)) {
    throw new Error("The place catalogue needs updating.");
  }
  const codes = new Set(districts.map(d => d.postcode_district));
  const ids = new Set();
  for (const p of catalogue.places) {
    if (!keys(p, ["id", "name", "aliases", "type", "context", "lat", "lon", "districts"]) ||
        ![p.id, p.name, p.context].every(text) || ids.has(p.id) ||
        !["city", "borough", "region", "local_authority", "settlement"].includes(p.type) ||
        !Array.isArray(p.aliases) || !p.aliases.every(text) ||
        !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < 49 || p.lat > 57 || p.lon < -7 || p.lon > 3 ||
        !Array.isArray(p.districts) || !p.districts.every(code => codes.has(code)) || new Set(p.districts).size !== p.districts.length) {
      throw new Error("The place catalogue has invalid public fields or district references.");
    }
    ids.add(p.id);
  }
  const rows = districts.map(d => [d.postcode_district, d.centroid_lat, d.centroid_lon]);
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const bytes = new TextEncoder().encode(rows.map(row => row.join("\t") + "\n").join(""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  if (codes.size !== districts.length || catalogue.districtGeometrySha256 !== digest) {
    throw new Error("The place catalogue does not match the scoring districts.");
  }
  return catalogue;
}
