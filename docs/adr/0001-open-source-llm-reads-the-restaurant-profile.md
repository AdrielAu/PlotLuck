# An open-source LLM reads the restaurant profile; the models are a combination, not a 2-NN hybrid

The early docs set "no LLM" and "a hybrid of 2 neural networks" as hard limits. Both were team choices, not guidebook rules, and on 2026-10-17 the team dropped them. A user describes their restaurant in free text. An open-source LLM running in the browser reads a cuisine and traits from that text, and NN1, trained on one row per restaurant joined to its district, scores the result in every postcode district. Free text is easier for first-time restaurateurs than a tag form. Running the LLM in the browser keeps the GitHub Pages site static, so it stays live after the event.

## Consequences

- `AGENTS.md`, `README.md`, `web/AGENTS.md`, PROJECT, PROGRESS, DELIVERABLES and the evidence checklist still say "no LLM" or "hybrid". They need updating.
- The site downloads model weights of hundreds of MB and needs WebGPU. The MVP uses a cuisine-and-traits picker until the LLM is integrated.
