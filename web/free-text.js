import { descriptionQuery, confirmedDescription } from './description-query.js';
import { makeInterpreter } from './interpret.js';
import { valueLabel } from './pickers.js';

// One description, then only the clarifications required to make a valid query.
// A generation token protects edits and previous results from late completions.
export function setUpFreeText({ bundle, catalogue, nn2, onResults, onBusy, onDescription }) {
  const $ = id => document.getElementById(id);
  const input = $('description');
  let generation = 0, attempts = 0, busy = false, query = null;
  const status = text => { $('interpret-status').textContent = text; };
  function refresh() {
    $('interpret').disabled = busy || attempts >= 3;
    $('cancel-interpret').hidden = !busy;
    input.setAttribute('aria-busy', String(busy));
    onBusy(busy);
  }
  function cancel(message) {
    generation++;
    if (busy) nn2.cancel();
    busy = false;
    refresh();
    $('model-progress').hidden = true;
    if (message) status(message);
  }
  function showError(message) {
    $('description-error').textContent = message;
    $('description-error').hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }
  function compare() {
    try {
      const confirmed = confirmedDescription(query, bundle, catalogue);
      if (!onResults(confirmed, query)) return;
      $('clarification').hidden = true;
      status('');
    } catch (error) { showError(error.message); }
  }
  function select(field, label, options) {
    const group = document.createElement('div');
    const control = document.createElement('select');
    control.id = `clarify-${field}`;
    control.required = true;
    control.append(new Option('Choose…', ''));
    control.append(...options.map(o => new Option(typeof o === 'string' ? valueLabel(o) : o.label, typeof o === 'string' ? o : o.code)));
    const title = document.createElement('label');
    title.htmlFor = control.id;
    title.textContent = label;
    group.append(title, control);
    $('clarification-fields').append(group);
    return control;
  }
  function clarify() {
    $('clarification-fields').replaceChildren();
    for (const need of query.needs) {
      if (need.field === 'price') select('price', need.message, need.options).addEventListener('change', event => {
        query.profile.price_band = event.target.value;
        query.priceNeedsReview = !bundle.vocabulary.traits.find(t => t.name === 'price_band').values.includes(event.target.value);
        query.fields.price_band = {value:event.target.value,provenance:'explicit',evidence:null};
      });
      if (need.field === 'cuisine') select('cuisine', need.message, need.options).addEventListener('change', event => { query.profile.cuisine = event.target.value; });
      if (need.field === 'rent') select('rent', need.message, need.options).addEventListener('change', event => { query.rentBand = event.target.value; });
      if (need.field === 'area') {
        const search = document.createElement('input');
        search.id = 'clarify-area-text'; search.type = 'text'; search.autocomplete = 'off';
        search.value = query.placeText;
        const label = document.createElement('label');
        label.htmlFor = search.id; label.textContent = need.message;
        $('clarification-fields').append(label, search);
        const control = select('area', 'Intended place', need.options);
        const reader = makeInterpreter(bundle, undefined, catalogue);
        search.addEventListener('input', () => {
          query.area = null;
          const direct = reader.readArea(search.value);
          const options = reader.areaCandidates(search.value);
          if (direct && !options.some(p => p.code === direct.code)) options.push(direct);
          control.replaceChildren(new Option('Choose…', ''), ...options.map(p => new Option(p.label, `${p.kind}:${p.code}`)));
          control.onchange = () => { query.area = options.find(p => `${p.kind}:${p.code}` === control.value) ?? null; };
        });
        control.addEventListener('change', () => {
          if (!control.onchange) query.area = need.options.find(p => p.code === control.value) ?? null;
        });
      }
      if (need.field === 'description') {
        const p = document.createElement('p');p.textContent = need.message;$('clarification-fields').append(p);
      }
    }
    if (query.radius !== null) {
      const label = document.createElement('label');label.htmlFor = 'clarify-radius';label.textContent = 'Straight-line radius (km)';
      const radius = document.createElement('input');radius.id = 'clarify-radius';radius.type = 'number';radius.min = '0.1';radius.step = 'any';radius.value = String(query.radius);
      radius.addEventListener('input', () => { query.radius = Number(radius.value); });
      $('clarification-fields').append(label, radius);
    }
    $('clarify-compare').hidden = query.needs.some(n => n.field === 'description');
    $('clarification').hidden = false;
    $('clarification-heading').textContent = query.needs.length === 1 ? 'One thing to clarify' : 'A few things to clarify';
    $('clarification-heading').focus();
    status('Please clarify the details below. Everything else has already been read.');
  }
  input.addEventListener('input', () => {
    cancel(); attempts = 0; query = null;
    $('clarification').hidden = true;
    $('description-error').hidden = true;
    input.removeAttribute('aria-invalid');
    status('');refresh();
    $('description-count').textContent = `${[...input.value].length} / 1,000 characters`;
  });
  $('cancel-interpret').addEventListener('click', () => { cancel('Interpretation cancelled. Your description and previous results are preserved.'); input.focus(); });
  $('description-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || attempts >= 3) return;
    const description = input.value.trim();
    if (!description || [...description].length > 1000) { showError('Enter a restaurant description of 1–1,000 characters.');input.focus();return; }
    $('description-error').hidden = true;input.removeAttribute('aria-invalid');
    $('clarification').hidden = true;
    const current = ++generation;
    attempts++;busy = true;refresh();
    try {
      status('Checking on-device interpretation…');
      if (!await nn2.supported()) throw new Error('This device cannot run the interpreter. Use desktop Chrome or Edge with WebGPU. Your description is preserved.');
      if (current !== generation) return;
      if (!nn2.ready()) {
        status('Downloading the on-device interpreter (about 288 MB). Your description stays in this tab.');
        $('model-progress').hidden = false;
        $('model-progress').value = 0;
        await nn2.download(({ progress }) => { if (current === generation) $('model-progress').value = progress; }, 'focused');
      }
      if (current !== generation) return;
      $('model-progress').hidden = true;
      status('Reading your restaurant description…');
      const extraction = await nn2.readProfile(description, catalogue);
      if (current !== generation) return;
      const next = await descriptionQuery(description, extraction, bundle, catalogue);
      if (current !== generation) return;
      query = next;
      onDescription();
      if (query.needs.length) clarify(); else compare();
    } catch (error) {
      if (current !== generation) return;
      const recovery = attempts >= 3 ? ' Three attempts used. Edit your description to try again.' : ' Edit your description or try again.';
      const message = /WebGPU/.test(error.message) ? error.message : 'We could not read this description reliably.';
      showError(`${message}${recovery}`);
      status('No new results have been applied.');
    } finally {
      if (current === generation) {busy = false;refresh();$('model-progress').hidden = true;}
    }
  });
  $('clarification-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!query || busy) return;
    if (!$('clarification-form').reportValidity()) return;
    compare();
  });
  refresh();
  return { open() { cancel(); input.focus(); } };
}
