// One free-text description, NN2 interpretation, and clarification only when needed.
import { loadBundle } from './scoring.js';
import { validateCatalogue } from './geography.js';
import { makeNN2 } from './nn2.js';
import { setUpFreeText } from './free-text.js';
import { setUpResultsScreen, showScreen } from './results-screen.js';
import { traitLabel, valueLabel } from './pickers.js';

const $ = id => document.getElementById(id);
const kitchen = import('./kitchen.js').then(m => m.startKitchen($('kitchen'))).catch(() => {
  $('kitchen').dataset.kitchen = 'off';return null;
});
function syncKitchen() {
  $('kitchen').hidden = $('questions-screen').hidden;
  kitchen.then(k => k?.update());
  window.scrollTo(0, 0);
}
async function readModelFile(name) {
  const response = await fetch(`models/${name}`);
  if (!response.ok) throw new Error(`Could not load models/${name} (HTTP ${response.status}).`);
  return response.text();
}
$('retry').addEventListener('click', () => window.location.reload());
async function main() {
  const bundle = await loadBundle(readModelFile);
  const catalogue = await validateCatalogue(JSON.parse(await readModelFile('geography.json')), bundle.districts);
  let flow;
  const openResults = setUpResultsScreen(bundle, {
    describeProfile(profile, searchAreaName) {
      const cuisine = bundle.vocabulary.cuisines.find(c => c.cuisine === profile.cuisine);
      return { heading: `${cuisine.label} · ${searchAreaName}`, summary: bundle.vocabulary.traits.map(t => `${traitLabel(t.name)}: ${typeof profile[t.name] === 'boolean' ? profile[t.name] ? 'Yes' : 'No' : valueLabel(profile[t.name])}`).join('; ') };
    },
    onChangeAnswers() { syncKitchen();flow.open(); },
  });
  flow = setUpFreeText({
    bundle, catalogue, nn2: makeNN2(bundle.vocabulary),
    onBusy(busy) { $('description-form').setAttribute('aria-busy', String(busy)); },
    onDescription() { kitchen.then(k => k?.serve(1)); },
    onResults(confirmed, query) {
      if (!openResults(confirmed)) return false;
      const defaults = Object.entries(query.fields).filter(([name, f]) => ['venue_type', 'price_band'].includes(name) && f.provenance === 'default').map(([name]) => traitLabel(name));
      const inferred = Object.entries(query.fields).filter(([, f]) => f.provenance === 'inferred').map(([name, f]) => `${traitLabel(name)}: ${valueLabel(f.value)}${f.evidence ? ` (${f.evidence})` : ''}`);
      $('query-notes').textContent = [defaults.length ? `Not specified: ${defaults.join(', ')}; scoring uses the model defaults.` : '', inferred.length ? `Inferred: ${inferred.join('; ')}.` : '', `Rent band: ${query.rentBand}.`, query.rentBudget ? `Rent budget: £${query.rentBudget.annualGBP.toLocaleString('en-GB')} per year; the amount is not used in scoring.` : ''].filter(Boolean).join(' ');
      $('unused-details').hidden = !query.unused.length;
      $('unused-details').textContent = `Not used in scoring: ${query.unused.join('; ')}`;
      syncKitchen();return true;
    },
  });
  $('loading').hidden = true;
}
main().catch(error => {
  showScreen('questions-screen');syncKitchen();
  $('loading').hidden = true;
  $('error-detail').textContent = `${error.message} Try loading again.`;
  $('error').hidden = false;
});
