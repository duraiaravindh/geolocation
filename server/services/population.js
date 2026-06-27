/**
 * Population calculator.
 * Given a center point and a radius, builds a circular buffer, finds the
 * intersecting Census Block Groups, computes the area-weighted population.
 */
import * as turf from '@turf/turf';
import { getBlockGroups } from './tigerweb.js';
import { getPopulationByGeoid } from './census.js';
import { config } from '../config.js';

const UNIT_TO_METERS = {
  miles: 1609.344,
  kilometers: 1000,
  meters: 1,
  feet: 0.3048,
};

export function toMeters(value, unit) {
  const factor = UNIT_TO_METERS[unit];
  if (!factor) throw new Error(`Unsupported unit: ${unit}`);
  return value * factor;
}

/**
 * Build the circular buffer, find intersecting Census Block Groups, and compute
 * each one's area-overlap weight. Shared by the population and demographic
 * calculators so the spatial logic lives in one place.
 *
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} opts.radiusMeters
 * @returns {Promise<{circle: object, circleArea: number, contributions: Array}>}
 */
export async function computeBlockGroupWeights({ lat, lng, radiusMeters }) {
  const center = [lng, lat];
  const radiusKm = radiusMeters / 1000;

  // Circular buffer around the point.
  const circle = turf.circle(center, radiusKm, { steps: 128, units: 'kilometers' });
  const circleArea = turf.area(circle);

  // Intersecting block groups (queried by the circle's bbox).
  const bbox = turf.bbox(circle);
  const features = await getBlockGroups(bbox);

  // Spatial intersection + area weighting.
  const contributions = [];
  for (const feature of features) {
    let intersection = null;
    try {
      intersection = turf.intersect(circle, feature);
    } catch {
      intersection = null; // skip self-intersecting / invalid geometries
    }
    if (!intersection) continue;

    const bgArea = turf.area(feature);
    if (bgArea <= 0) continue;
    const interArea = turf.area(intersection);
    const weight = Math.min(interArea / bgArea, 1);
    if (weight <= 0) continue;

    contributions.push({
      geoid: feature.properties.GEOID,
      geometry: feature.geometry,
      weight,
      bgArea,
      interArea,
    });
  }

  return { circle, circleArea, contributions };
}

/**
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} opts.radiusMeters
 */
export async function calculatePopulation({ lat, lng, radiusMeters }) {
  const { circle, circleArea, contributions } = await computeBlockGroupWeights({
    lat,
    lng,
    radiusMeters,
  });

  // Step 9 — populations for the intersecting block groups.
  const geoids = contributions.map((c) => c.geoid);
  const popByGeoid = await getPopulationByGeoid(geoids);

  // Steps 10 & 11 — weighted contributions and total.
  let total = 0;
  const blockGroups = contributions.map((c) => {
    const population = popByGeoid[c.geoid] ?? 0;
    const contribution = population * c.weight;
    total += contribution;
    return {
      geoid: c.geoid,
      population,
      weight: Number(c.weight.toFixed(4)),
      weightPercent: Number((c.weight * 100).toFixed(1)),
      contribution: Math.round(contribution),
      // Raw areas (square meters) so the debug view can show the full
      // overlap math: weightedPopulation = population × (interArea / bgArea).
      blockGroupArea: Math.round(c.bgArea),
      intersectionArea: Math.round(c.interArea),
      overlapPercent: Number((c.weight * 100).toFixed(1)),
      weightedPopulation: Math.round(contribution),
      geometry: c.geometry,
    };
  });

  blockGroups.sort((a, b) => b.contribution - a.contribution);

  return {
    estimatedPopulation: Math.round(total),
    radiusMeters,
    blockGroupCount: blockGroups.length,
    method: 'Area-weighted Census Block Groups',
    source: `ACS ${config.acsYear} 5-Year Census Block Groups`,
    circle, // GeoJSON polygon for the map
    circleArea,
    blockGroups,
    // Geometry-free breakdown, matching the documented debug response shape.
    debug: blockGroups.map((bg) => ({
      geoid: bg.geoid,
      population: bg.population,
      blockGroupArea: bg.blockGroupArea,
      intersectionArea: bg.intersectionArea,
      overlapPercent: bg.overlapPercent,
      weightedPopulation: bg.weightedPopulation,
    })),
  };
}
