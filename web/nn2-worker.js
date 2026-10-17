import { NN2 } from './nn2-runtime.js';
import { buildPrompt, interpretationSchema, validateInterpretation } from './interpreter.js';
import { groundedPrompt, groundedSchema, groundInterpretation } from './grounded-interpreter.js';
import { profilePrompt, profileSchema, validateProfileExtraction } from './profile-extraction.js';
let engine;
self.onmessage = async ({ data }) => {
  const { id, action, description, vocabulary } = data;
  const started = performance.now();
  let reply;
  let rawReply;
  try {
    const focused = data.mode === 'focused';
    const grounded = data.mode === 'grounded' || focused;
    const schema = focused ? profileSchema(vocabulary) : grounded ? groundedSchema(vocabulary) : interpretationSchema(vocabulary);
    if (action === 'load') {
      const { CreateMLCEngine } = await import(NN2.runtimeUrl);
      engine = await CreateMLCEngine(NN2.modelId, {
        appConfig: { model_list: [{ model: NN2.model, model_id: NN2.modelId, model_lib: NN2.modelLib, overrides: { context_window_size: 4096 } }] },
        initProgressCallback: progress => self.postMessage({ id, progress }),
      });
      if (vocabulary) {
        // Compile the task grammar during cold initialization, before accepting user input.
        await engine.chat.completions.create({ messages: [{role:'user',content:'Return JSON.'}], temperature: 0, max_tokens: 1,
          response_format: { type: 'json_object', schema: JSON.stringify(schema) } });
      }
      self.postMessage({ id, loaded: true });
    } else if (action === 'interpret') {
      if (!engine) throw new Error('Download the interpreter first.');
      const start = performance.now();
      const result = await engine.chat.completions.create({ messages: focused ? profilePrompt(description) : grounded ? groundedPrompt(description, vocabulary, data.catalogue) : buildPrompt(description, vocabulary), temperature: 0,
        max_tokens: 512, response_format: { type: 'json_object', schema: JSON.stringify(schema) } });
      reply = result.choices[0].message.content;
      rawReply = reply;
      if (result.choices[0].finish_reason === 'length') throw new Error('Interpretation was truncated. Please retry.');
      const extraction = focused ? validateProfileExtraction(reply, description, vocabulary, data.catalogue, {clarifyInvalidPrice:data.clarifyInvalidPrice === true}) : grounded ? groundInterpretation(reply, description, vocabulary, data.catalogue) : null;
      const draft = extraction?.draft ?? validateInterpretation(reply, description, vocabulary);
      if (grounded) {
        const {profile,...normalized} = draft;
        reply = JSON.stringify(normalized);
      }
      self.postMessage({ id, draft, seconds: (performance.now() - start) / 1000,
        ...(grounded ? {candidates:extraction.candidates} : {}),
        ...(focused ? {rentBudget:extraction.rentBudget,rentBand:extraction.rentBand,rentNeedsReview:extraction.rentNeedsReview,priceNeedsReview:extraction.priceNeedsReview} : {}),
        ...(data.syntheticProof ? { reply, raw_reply:rawReply, usage: result.usage } : {}) });
    } else throw new Error('Unknown interpreter action.');
  } catch (error) { self.postMessage({ id, error: error.message, seconds: (performance.now()-started)/1000,
    ...(data.syntheticProof ? { reply, raw_reply:rawReply } : {}) }); }
};
