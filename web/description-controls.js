import { placeCandidates, retryAdvice } from './grounded-interpreter.js';
import { validateCatalogue } from './geography.js';

// The worker boundary is isolated so cancellation cannot publish an old draft.
export function setUpDescription({vocabulary, districts, onDraft, onArea, onBusy, onRent}) {
  const $ = id => document.getElementById(id);
  const preview = new URLSearchParams(window.location.search).get('nn2') === '1';
  $('description-panel').hidden = !preview;
  $('nn2-area-controls').hidden = !preview;
  let worker, pending, loaded = false, catalogue, attempts = 0, sequence = 0, operation = 0, busy = false;
  const manuallyEdited = new Set();
  const allFields = ['cuisine', 'price_band', 'venue_type', 'search area', 'rent budget'];
  const advice = () => retryAdvice(attempts, allFields.filter(f=>!manuallyEdited.has(f)));
  const status = text => { $('interpret-status').textContent = text; };
  const refresh = () => {
    $('interpret').disabled = busy || !advice().canRetry || !$('description').value.trim() || !navigator.gpu;
    $('cancel-interpret').hidden = !busy;
    $('interpret').textContent = attempts ? 'Try interpretation again' : 'Download and interpret';
    onBusy(busy);
  };
  function cancel() {
    const wasBusy = busy;
    sequence++;
    operation++;
    worker?.terminate(); worker = null; loaded = false;
    pending?.reject(new Error('Interpretation cancelled. Your choices are preserved.')); pending = null;
    busy = false; refresh();
    if (wasBusy) status(`Interpretation cancelled. Your choices are preserved. ${advice().message}`);
  }
  async function getCatalogue() {
    if (!catalogue) {
      const response = await fetch('models/geography.json');
      if (!response.ok) throw new Error('Places could not load. Try again or keep your current search area.');
      catalogue = await validateCatalogue(await response.json(), districts);
    }
    return catalogue;
  }
  function call(data) {
    return new Promise((resolve,reject) => {
      const id = ++sequence;
      const timeout = setTimeout(()=>{ cancel(); reject(new Error('Interpretation took too long. Please edit the fields manually.')); }, data.action === 'load' ? 300000 : 60000);
      pending = {reject:error=>{clearTimeout(timeout);reject(error);}};
      worker.onmessage = ({data:r}) => {
        if (r.id !== id) return;
        if (r.progress) { status(`Downloading interpreter: ${r.progress.text ?? 'loading model files…'}`); return; }
        clearTimeout(timeout); pending = null;
        r.error ? reject(new Error('The description could not be interpreted reliably.')) : resolve(r);
      };
      worker.onerror = event => {
        event.preventDefault();clearTimeout(timeout);pending=null;
        worker?.terminate();worker=null;loaded=false;
        reject(new Error('The interpreter stopped. Retry or edit the fields manually.'));
      };
      worker.postMessage({id,...data});
    });
  }

  let matches = [], locationSequence = 0;
  function chooseArea() {
    const place = matches.find(p=>p.id === $('place-choice').value);
    if (!$('place-text').value.trim()) { onArea($('near-place').checked ? null : {label:'England', place:null, radius:null}); return; }
    if (!place) { onArea(null); return; }
    const radius = $('near-place').checked ? Number($('radius').value) : null;
    if (radius !== null && (!Number.isFinite(radius) || radius <= 0)) {onArea(null);return;}
    onArea({label:radius === null ? `${place.name} (${place.type}, ${place.context})` : `Within ${radius} km of ${place.name} (${place.type})`,place,radius});
  }
  function showPlaces(places) {
    matches = places;
    $('place-choice').replaceChildren(new Option(places.length ? 'Choose the intended place' : 'No matching place — edit the name',''),
      ...places.map(p=>new Option(`${p.name} — ${p.type}, ${p.context}`,p.id)));
    $('place-choice').disabled = !places.length;
    $('place-help').textContent = places.length
      ? 'Choose a place and check the radius. Places with the same name may cover different districts.'
      : 'Use a known English city, borough or region. Clear the name only if you intend to compare all England.';
    chooseArea();
  }
  $('place-text').addEventListener('input', async () => {
    cancel(); manuallyEdited.add('search area');
    const current = ++locationSequence;
    const text = $('place-text').value.trim();
    onArea(text ? null : {label:'England',place:null,radius:null});
    try {
      const data = await getCatalogue();
      if (current !== locationSequence) return;
      const exact = placeCandidates(text,data);
      showPlaces(exact.length || !text ? exact : data.places.filter(p=>[p.name,...p.aliases].some(n=>n.toLowerCase().includes(text.toLowerCase()))).slice(0,50));
    } catch(error) { if (current === locationSequence) $('place-help').textContent = error.message; }
  });
  for (const id of ['place-choice','near-place','radius']) $(id).addEventListener('change',()=>{
    cancel();manuallyEdited.add('search area');$('radius').disabled = !$('near-place').checked;chooseArea();
  });
  $('profile-controls').addEventListener('input', event => {
    if (event.target.id === 'cuisine' || event.target.closest('#trait-pickers')) {
      cancel(); manuallyEdited.add(event.target.name || 'cuisine');
      $('interpret-provenance').textContent = 'Manual changes take priority over the previous interpretation.';
    }
  });
  $('description').addEventListener('input',()=>{
    cancel();attempts=0;manuallyEdited.clear();
    status('Your choices are preserved. Interpret this description or edit the fields below.');refresh();
  });
  function readRent(event) {
    cancel();manuallyEdited.add('rent budget');
    const amount=Number($('rent-amount').value);
    const period=$('rent-period').value;
    const rent=$('rent-amount').value.trim() ? {amount,period,currency:'GBP',annualGBP:amount*(period==='month' ? 12 : 1)} : null;
    if (event.target.id!=='rent-band') $('rent-band').value=rent ? '' : 'any';
    $('rent-summary').textContent=rent && Number.isFinite(rent.annualGBP) && amount>0
      ? `Rent budget: £${rent.annualGBP.toLocaleString('en-GB')} per year. Confirm a relative rent band below. The band filters districts; the total budget is not used in scoring.`
      : rent ? 'Enter a positive rent amount and its period.' : 'No total rent budget stated.';
    onRent(rent,$('rent-band').value);
  }
  $('rent-amount').addEventListener('change',readRent);
  $('rent-period').addEventListener('change',readRent);
  $('rent-band').addEventListener('change',readRent);
  $('cancel-interpret').addEventListener('click',()=>{cancel();status('Interpretation cancelled. Your choices are preserved.');});
  $('manual-entry').addEventListener('click',()=>{
    cancel();status(advice().message);$('cuisine').focus();
  });
  $('interpret').addEventListener('click',async()=>{
    if (!preview || busy || !advice().canRetry) return;
    const description = $('description').value;
    if (!description.trim() || [...description].length > 1000) {status('Enter a description of 1–1,000 characters.');return;}
    locationSequence++;
    attempts++;busy=true;refresh();status(`Interpreting description (attempt ${attempts} of 3)…`);
    const current = ++operation;
    try {
      const data = await getCatalogue();
      if (current !== operation) return;
      worker ??= new Worker('nn2-worker.js',{type:'module'});
      if (!loaded) {await call({action:'load',vocabulary,mode:'focused'});if (current !== operation) return;loaded=true;}
      status(`Interpreting description (attempt ${attempts} of 3)…`);
      const result = await call({action:'interpret',description,vocabulary,catalogue:data,mode:'focused'});
      if (current !== operation) return;
      onDraft(result.draft);
      const location = result.draft.location;
      $('place-text').value = location.text ?? '';
      $('near-place').checked = location.near;
      $('radius').disabled = !location.near;
      $('radius').value = String(location.distance === null ? 5 : location.distance * (location.unit === 'miles' ? 1.609344 : 1));
      showPlaces(result.candidates);
      const fields=Object.entries(result.draft.fields).filter(([name])=>['cuisine','price_band','venue_type'].includes(name));
      const defaults = fields.filter(([,f])=>f.provenance==='default').map(([name])=>name.replaceAll('_',' '));
      $('interpret-provenance').textContent = fields.map(([name,field])=>`${name.replaceAll('_',' ')}: ${field.provenance}${field.evidence ? ` (${field.evidence})` : ''}`).join('; ');
      if (result.rentBudget) {
        $('rent-amount').value=String(result.rentBudget.amount);$('rent-period').value=result.rentBudget.period;
        $('rent-band').value='';
        $('rent-summary').textContent=`Rent budget: £${result.rentBudget.annualGBP.toLocaleString('en-GB')} per year. Confirm a rent band. The band filters districts; this total amount is not used in scoring.`;
        onRent(result.rentBudget,'');
      }
      status(`Draft ready. Review every field and choose the intended place. ${defaults.length ? `Defaults to check: ${defaults.join(', ')}.` : ''} ${result.draft.clarifications.join(' ')} ${result.draft.unused.length ? `Not used in scoring: ${result.draft.unused.join('; ')}.` : ''}`);
    } catch(error) {
      if (current !== operation) return;
      status(`${error.message} ${advice().message}`);
      if (!advice().canRetry) $('cuisine').focus();
    } finally {
      if (current === operation) {busy=false;refresh();}
    }
  });
  if (!navigator.gpu) status('Description interpretation needs desktop Chrome or Edge with WebGPU. Use the manual fields below.');
  refresh();
  return {
    manualEdit(name) {locationSequence++;cancel();manuallyEdited.add(name);$('interpret-provenance').textContent='Manual changes take priority over the previous interpretation.';},
    setRentBand(band) {$('rent-band').value=band;},
  };
}

export function areaDistricts(area, districts) {
  if (!area) throw new Error('Choose a valid search area before comparing districts.');
  if (!area.place) return null;
  if (area.radius === null) return new Set(area.place.districts);
  if (!Number.isFinite(area.radius) || area.radius <= 0) throw new Error('Enter a positive radius.');
  const rad = degrees=>degrees * Math.PI / 180;
  return new Set(districts.filter(d=>{
    const a = Math.sin(rad(Number(d.centroid_lat)-area.place.lat)/2)**2 + Math.cos(rad(area.place.lat))*Math.cos(rad(Number(d.centroid_lat)))*Math.sin(rad(Number(d.centroid_lon)-area.place.lon)/2)**2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1,a))) <= area.radius;
  }).map(d=>d.postcode_district));
}
