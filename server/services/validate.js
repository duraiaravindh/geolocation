/**
 * Census Geography Population validation.
 *
 * Independent of any radius: reverse-geocodes a point to its Census Tract and
 * Block Group, then reads the official ACS 5-Year population for each. These
 * values are directly comparable with FFIEC / Census website outputs because
 * they describe whole Census geographies (not an area-weighted radius estimate).
 */
import { config } from '../config.js';
import { geocodeCoordinates } from './geocoder.js';
import { getTractPopulation, getBlockGroupPopulation } from './census.js';

/**
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 */
export async function validateCensusPopulation({ lat, lng }) {
  const geo = await geocodeCoordinates(lat, lng);

  const [tractPopulation, blockGroupPopulation] = await Promise.all([
    getTractPopulation(geo.state, geo.county, geo.tract),
    getBlockGroupPopulation(geo.state, geo.county, geo.tract, geo.blockGroup),
  ]);

  return {
    state: geo.state,
    county: geo.county,
    stateName: geo.stateName,
    countyName: geo.countyName,
    tract: geo.tract,
    blockGroup: geo.blockGroup,
    tractGeoid: geo.tractGeoid,
    blockGroupGeoid: geo.blockGroupGeoid,
    tractPopulation,
    blockGroupPopulation,
    source: `ACS ${config.acsYear} 5-Year Census API`,
  };
}
