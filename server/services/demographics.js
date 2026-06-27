/**
 * Radius demographic profile.
 *
 * Reuses the same block-group buffer/overlap weighting as the population
 * calculator, then applies it to the 7 ACS variables:
 *   - count fields  → area-weighted:   Σ (value × overlap)
 *   - median fields → population-weighted average:
 *       Σ (median × weightedPop) / Σ weightedPop
 */
import { computeBlockGroupWeights } from './population.js';
import { getDemographicsByGeoid } from './census.js';
import { config } from '../config.js';

const COUNT_FIELDS = [
  'population',
  'households',
  'housingUnits',
  'ownerOccupied',
  'renterOccupied',
];

export async function calculateDemographics({ lat, lng, radiusMeters }) {
  const { circle, contributions } = await computeBlockGroupWeights({
    lat,
    lng,
    radiusMeters,
  });

  const geoids = contributions.map((c) => c.geoid);
  const demoByGeoid = await getDemographicsByGeoid(geoids);

  const totals = {
    population: 0,
    households: 0,
    housingUnits: 0,
    ownerOccupied: 0,
    renterOccupied: 0,
  };
  // Population-weighted median accumulators.
  let incomeNum = 0;
  let incomeDen = 0;
  let ageNum = 0;
  let ageDen = 0;

  const blockGroups = contributions.map((c) => {
    const d = demoByGeoid[c.geoid] || {};
    const weight = c.weight;
    const weightedPop = (d.population || 0) * weight;

    for (const f of COUNT_FIELDS) totals[f] += (d[f] || 0) * weight;

    if (d.medianHouseholdIncome != null && weightedPop > 0) {
      incomeNum += d.medianHouseholdIncome * weightedPop;
      incomeDen += weightedPop;
    }
    if (d.medianAge != null && weightedPop > 0) {
      ageNum += d.medianAge * weightedPop;
      ageDen += weightedPop;
    }

    return {
      geoid: c.geoid,
      overlapPercent: Number((weight * 100).toFixed(1)),
      weight: Number(weight.toFixed(4)),
      population: d.population ?? 0,
      households: d.households ?? 0,
      medianHouseholdIncome: d.medianHouseholdIncome ?? null,
      medianAge: d.medianAge ?? null,
      housingUnits: d.housingUnits ?? 0,
      ownerOccupied: d.ownerOccupied ?? 0,
      renterOccupied: d.renterOccupied ?? 0,
      weightedPopulation: Math.round(weightedPop),
      blockGroupArea: Math.round(c.bgArea),
      intersectionArea: Math.round(c.interArea),
    };
  });

  blockGroups.sort((a, b) => b.weightedPopulation - a.weightedPopulation);

  const owner = totals.ownerOccupied;
  const renter = totals.renterOccupied;
  const tenure = owner + renter;

  const demographics = {
    population: Math.round(totals.population),
    households: Math.round(totals.households),
    housingUnits: Math.round(totals.housingUnits),
    ownerOccupied: Math.round(owner),
    renterOccupied: Math.round(renter),
    medianHouseholdIncome: incomeDen > 0 ? Math.round(incomeNum / incomeDen) : null,
    medianAge: ageDen > 0 ? Number((ageNum / ageDen).toFixed(1)) : null,
    ownerPercent: tenure > 0 ? Number(((owner / tenure) * 100).toFixed(1)) : null,
    renterPercent: tenure > 0 ? Number(((renter / tenure) * 100).toFixed(1)) : null,
  };

  return {
    estimatedPopulation: demographics.population,
    blockGroupCount: blockGroups.length,
    method: 'Area-weighted Census Block Groups',
    source: `ACS ${config.acsYear} 5-Year Census`,
    acsYear: config.acsYear,
    demographics,
    blockGroups, // per-block-group debug breakdown
    circle,
  };
}
