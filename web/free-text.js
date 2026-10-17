import { descriptionQuery, confirmedDescription, unreadDescription } from './description-query.js';
import { makeInterpreter } from './interpret.js';
import { valueLabel } from './pickers.js';

// One description, then only the clarifications required to make a valid query.
// A generation token protects edits and previous results from late completions.
export function setUpFreeText({ bundle, catalogue, nn2, onResults, onBusy }) {
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
    const answer = field => {
      query.completion[field] = true;
      $('description-error').hidden = true;
      input.removeAttribute('aria-invalid');
    };
    for (const need of query.needs) {
      if (need.field === 'price') select('price', need.message, need.options).addEventListener('change', event => {
        query.profile.price_band = event.target.value;
        query.priceNeedsReview = !bundle.vocabulary.traits.find(t => t.name === 'price_band').values.includes(event.target.value);
        query.fields.price_band = {value:event.target.value,provenance:'explicit',evidence:null};
        query.completion.price = !query.priceNeedsReview;
      });
      if (need.field === 'cuisine') select('cuisine', need.message, need.options).addEventListener('change', event => { query.profile.cuisine = event.target.value; answer('cuisine'); });
      if (need.field === 'venue') select('venue', need.message, need.options).addEventListener('change', event => {
        query.profile.venue_type = event.target.value;
        query.fields.venue_type = {value:event.target.value,provenance:'explicit',evidence:null};
        answer('venue');
      });
      if (need.field === 'rent') {
        select('rent', need.message, need.options).addEventListener('change', event => {
          query.rentBand = event.target.value;
          query.completion.rent = !query.rentBudgetNeedsReview;
        });
        if (query.rentBudgetNeedsReview) {
          const group = document.createElement('div');
          const label = document.createElement('label');label.htmlFor = 'clarify-budget';label.textContent = 'Re-enter your rent budget (£), or confirm no numeric budget.';
          const amount = document.createElement('input');amount.id = 'clarify-budget';amount.type = 'number';amount.min = '0.01';amount.step = 'any';
          const period = document.createElement('select');period.id = 'clarify-period';period.setAttribute('aria-label','Rent budget period');period.append(new Option('Per month','month'),new Option('Per year','year'));
          const none = document.createElement('button');none.type = 'button';none.className = 'link';none.textContent = 'No numeric budget';
          const update = () => {
            const value = Number(amount.value);
            const valid = Number.isFinite(value) && value > 0 && Number.isFinite(value * (period.value === 'month' ? 12 : 1));
            query.rentBudgetNeedsReview = !valid;
            query.rentBudget = valid ? {amount:value,period:period.value,currency:'GBP',annualGBP:value * (period.value === 'month' ? 12 : 1)} : null;
            query.completion.rent = valid && ['low','mid','high','any'].includes(query.rentBand);
          };
          amount.addEventListener('input',update);period.addEventListener('change',update);
          none.addEventListener('click',() => {amount.value='';query.rentBudget=null;query.rentBudgetNeedsReview=false;query.completion.rent=['low','mid','high','any'].includes(query.rentBand);});
          group.append(label,amount,period,none);$('clarification-fields').append(group);
        }
      }
      if (need.field === 'other') {
        const group = document.createElement('div');
        const label = document.createElement('label');label.htmlFor = 'clarify-other';label.textContent = need.message;
        const other = document.createElement('textarea');other.id = 'clarify-other';other.rows = 2;other.required = true;other.setAttribute('aria-describedby','clarify-other-help');
        const help = document.createElement('p');help.id = 'clarify-other-help';help.textContent = 'Dietary needs or other requirements. Enter “none” if there are no others. Unsupported details are kept but not used in scoring.';
        const none = document.createElement('button');none.type = 'button';none.className = 'link';none.textContent = 'No other requirements';
        let revision = 0;
        const original = {...query.profile};
        const originalUnused = [...query.unused];
        other.addEventListener('input',async () => {
          const current = ++revision;
          const target = query;
          query.completion.other = false;
          if (!other.value.trim()) return;
          const noOther = /^(?:none|nothing|no(?: other)? requirements)[.!]?$/i.test(other.value.trim());
          const read = await makeInterpreter(bundle).interpret({other:noOther ? 'none' : other.value});
          if (current !== revision || target !== query) return;
          for (const t of bundle.vocabulary.traits.filter(t=>t.kind==='on_off')) query.profile[t.name] = read.marks[t.name] === 'explicit' ? read.profile[t.name] : original[t.name];
          query.requirementsText = other.value.trim();
          query.unused = [...originalUnused,...read.unused];
          answer('other');
        });
        none.addEventListener('click',() => {other.value='None';other.dispatchEvent(new Event('input'));});
        group.append(label,other,help,none);$('clarification-fields').append(group);
      }
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
          query.completion.area = false;
          const direct = reader.readArea(search.value);
          const options = reader.areaCandidates(search.value);
          if (direct && !options.some(p => p.code === direct.code)) options.push(direct);
          control.replaceChildren(new Option('Choose…', ''), ...options.map(p => new Option(p.label, `${p.kind}:${p.code}`)));
          control.onchange = () => { query.area = options.find(p => `${p.kind}:${p.code}` === control.value) ?? null; query.completion.area = Boolean(query.area); };
        });
        control.addEventListener('change', () => {
          if (!control.onchange) { query.area = need.options.find(p => p.code === control.value) ?? null; query.completion.area = Boolean(query.area); }
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
    status('Please complete the unanswered questions below. The details already read have been kept.');
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
      if (query.needs.length) clarify(); else compare();
    } catch (error) {
      if (current !== generation) return;
      const recovery = attempts >= 3 ? ' Three attempts used. Edit your description to try again.' : ' Edit your description or try again.';
      query = await unreadDescription(description,bundle,catalogue);
      if (current !== generation) return;
      clarify();
      const message = /WebGPU/.test(error.message) ? error.message : 'The interpreter could not read all the inputs.';
      status(`${message} Complete the questions below to continue.${recovery}`);
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
