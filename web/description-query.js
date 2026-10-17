// A validated NN2 extraction -> one query, or only the choices needed to finish it.
// NN2 supplies text; the checked catalogue and scoring bundle supply geography.
import { makeInterpreter } from './interpret.js';
import { areaDistricts } from './geography.js';
import { validateInterpretation } from './interpreter.js';

const mentions = (text, phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
};

// Erica's six questions, reused only for missing or invalid inputs.
export const FIELD_QUESTIONS = {
  area:'Where would you like to open?', cuisine:'What food will you serve?',
  venue:'What kind of place is it?', price:'How are your menu prices?',
  rent:'How much rent can you take on?', other:'Anything else diners should know?',
};

export function descriptionQuery(description, extraction, bundle, catalogue) {
  const { profile: ignored, ...raw } = extraction.draft;
  const draft = validateInterpretation(raw, description, bundle.vocabulary);
  const reader = makeInterpreter(bundle, undefined, catalogue);
  const profile = { ...draft.profile };
  // Explicit dietary requests are retained even though the focused NN2 candidate
  // does not extract them. Defaults are never presented as model predictions.
  const dietary = makeInterpreter(bundle).interpret({ other: description });
  const names = bundle.vocabulary.cuisines.filter(c => c.cuisine !== 'Unspecified' && mentions(description, c.cuisine));
  const conflicting = names.length > 1;
  if (conflicting) profile.cuisine = null;
  const needs = [];
  if (extraction.priceNeedsReview) needs.push({ field:'price', message:'Which menu price range should we use? The interpreter could not confirm it.', options:bundle.vocabulary.traits.find(t => t.name === 'price_band').values });
  if (!profile.cuisine || profile.cuisine === 'Unspecified') needs.push({ field: 'cuisine', message: 'Which cuisine should we compare?', options: names.length ? names.map(c => c.cuisine) : bundle.vocabulary.cuisines.filter(c => c.cuisine !== 'Unspecified').map(c => c.cuisine) });
  const location = draft.location;
  const placeText = location.text ?? (/\b(?:in|near|around)\s+([^,.;\n]+)/i.exec(description)?.[1]?.trim() ?? '');
  const candidates = reader.areaCandidates(placeText);
  const direct = reader.readArea(placeText);
  if (direct && placeText && !candidates.some(p=>p.code === direct.code)) candidates.push(direct);
  let area = location.text === null && placeText ? null : reader.readArea(placeText);
  // A missing model location is unsafe when the description explicitly requests one.
  const restriction = /\b(?:in|near|within|around|outside|except|excluding)\s+\S/i.test(description);
  if ((!placeText && restriction) || extraction.unresolvedFields?.includes('area')) area = null;
  // The small candidate may copy just the first place. Preserve unions/exclusions
  // as unresolved restrictions even when it drops their clarification.
  const namedPlaces = catalogue.places.flatMap(p => [p.name, ...p.aliases]).filter(name => name.length > 2 && mentions(description, name));
  const multiplePlaces = namedPlaces.some(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const joined = new RegExp(`(?:\\bor\\b|\\band\\b|[/+])\\s+(?:in\\s+)?${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    return joined.test(description) && namedPlaces.some(other => other !== name && mentions(description.split(/\bor\b|\band\b|[/+]/i)[0], other));
  });
  if (multiplePlaces || /\b(?:except|excluding|outside)\b/i.test(description) || draft.clarifications.some(c => /location|place|area|exclu/i.test(c))) area = null;
  if (!area) needs.push({ field: 'area', message: 'Choose one intended search area.', options: candidates });
  let radius = location.near ? (location.distance === null ? 5 : location.distance * (location.unit === 'miles' ? 1.609344 : 1)) : null;
  if (radius !== null && area?.kind !== 'place') {
    area = null;
    if (!needs.some(n => n.field === 'area')) needs.push({ field: 'area', message: 'Choose a named place for the radius search.', options: candidates });
  }
  const band = (/\brent\s*(?:band|budget)?\s*(?:is|of|:)?\s*(low|mid|medium|high|any)\b/i.exec(description)
    ?? /\b(low|mid|medium|high|any)(?:[ -]range)?\s+rent\b/i.exec(description))?.[1]?.toLowerCase();
  const rentBand = band === 'medium' ? 'mid' : band ?? null;
  if (rentBand === null) needs.push({ field: 'rent', message: 'Which relative rent band should filter districts? A budget in pounds does not determine a band.', options: ['low', 'mid', 'high', 'any'] });
  // Preserve additional model clarifications without asking for every default.
  const messages = draft.clarifications.filter(c => !needs.some(n => n.field === 'cuisine' && /cuisine/i.test(c)));
  if (messages.length && !needs.length) needs.push({ field: 'description', message: messages.join(' ') });
  return dietary.then(async explicit => {
    for (const t of bundle.vocabulary.traits.filter(t => t.kind === 'on_off')) if (explicit.marks[t.name] === 'explicit') profile[t.name] = explicit.profile[t.name];
    const completion = {
      area:Boolean(area), cuisine:Boolean(profile.cuisine && profile.cuisine !== 'Unspecified'),
      venue:draft.fields.venue_type.provenance !== 'default',
      price:!extraction.priceNeedsReview && draft.fields.price_band.provenance !== 'default',
      rent:rentBand !== null && !extraction.unresolvedFields?.includes('rent'),
      other:Boolean(extraction.requirementsText),
    };
    if (!completion.venue) needs.push({field:'venue',options:bundle.vocabulary.traits.find(t=>t.name==='venue_type').values});
    if (!completion.price && !needs.some(n=>n.field==='price')) needs.push({field:'price',options:bundle.vocabulary.traits.find(t=>t.name==='price_band').values});
    if (!completion.rent && !needs.some(n=>n.field==='rent')) needs.push({field:'rent',options:['low','mid','high','any']});
    if (!completion.other) needs.push({field:'other'});
    const ordered = Object.keys(FIELD_QUESTIONS).flatMap(field=>needs.filter(n=>n.field===field).map(n=>({...n,message:FIELD_QUESTIONS[field]})));
    const noOther = /^(?:none|nothing|no(?: other)? requirements)[.!]?$/i.test(extraction.requirementsText ?? '');
    const other = extraction.requirementsText && !noOther ? await reader.interpret({other:extraction.requirementsText}) : null;
    return { profile, fields: draft.fields, area, radius, rentBand, rentBudget: extraction.rentBudget ?? null,
      rentBudgetNeedsReview:extraction.unresolvedFields?.includes('rent') ?? false,
      priceNeedsReview:!completion.price, completion, requirementsText:extraction.requirementsText ?? null,
      needs:[...ordered,...needs.filter(n=>n.field==='description')], unused:[...new Set([...draft.unused,...(other?.unused ?? [])])], placeText };
  });
}

// A failed model read still offers the six questions; no fabricated values score.
export function unreadDescription(description, bundle, catalogue) {
  return descriptionQuery(description, {unresolvedFields:/\brent\b[^.;\n]*(?:£|GBP)/i.test(description) ? ['rent'] : [], draft:{fields:{cuisine:{value:null,provenance:'default',evidence:null}},location:{text:null,near:false,distance:null,unit:null},unused:[],clarifications:['Choose a cuisine.']}}, bundle, catalogue);
}

// Validate user clarification at the final scoring boundary too.
export function confirmedDescription(query, bundle, catalogue) {
  const missing = Object.keys(FIELD_QUESTIONS).filter(field=>!query.completion?.[field]);
  if (missing.length) throw new Error(`Please answer: ${missing.map(field=>FIELD_QUESTIONS[field]).join(' ')}`);
  if (query.priceNeedsReview) throw new Error('Choose a menu price range before comparing districts.');
  if (!bundle.vocabulary.cuisines.some(c => c.cuisine === query.profile.cuisine && c.cuisine !== 'Unspecified')) throw new Error('Choose one supported cuisine.');
  for (const t of bundle.vocabulary.traits) if (!t.values.includes(query.profile[t.name])) throw new Error('Choose a supported restaurant profile.');
  if (!['low', 'mid', 'high', 'any'].includes(query.rentBand)) throw new Error('Choose a rent band.');
  const reader = makeInterpreter(bundle, undefined, catalogue);
  let scope;
  let label = query.area?.label;
  if (query.radius !== null) {
    const place = query.area?.kind === 'place' && catalogue.places.find(p => p.id === query.area.code);
    if (!place) throw new Error('Choose a named place for the radius search.');
    scope = areaDistricts({ place, radius: query.radius }, bundle.districts);
    const rents = reader.districtsInScope({ kind: 'england' }, query.rentBand);
    scope = new Set([...scope].filter(code => rents.has(code)));
    label = `Within ${Number(query.radius.toFixed(3))} km of ${place.name}`;
  } else {
    if (!query.area) throw new Error('Choose a valid search area.');
    scope = reader.districtsInScope(query.area, query.rentBand);
  }
  if (!scope.size) throw new Error('No district centres match this search area and rent band. Edit your description; the search has not been widened.');
  return { profile: { ...query.profile }, searchArea: [...scope], searchAreaName: label };
}
