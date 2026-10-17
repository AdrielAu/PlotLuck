# An open-source LLM reads the restaurant profile; the models are a combination, not a 2-NN hybrid

The early docs set "no LLM" and "a hybrid of 2 neural networks" as hard limits. Both were team choices, not guidebook rules, and on 2026-10-17 the team dropped them. A user describes their restaurant in free text. An open-source LLM running in the browser reads a cuisine and traits from that text, and NN1, trained on one row per restaurant joined to its district, scores the result in every postcode district. Free text is easier for first-time restaurateurs than a tag form. Running the LLM in the browser keeps the GitHub Pages site static, so it stays live after the event.

## Consequences

- The early `AGENTS.md`, `README.md`, `web/AGENTS.md`, PROJECT, PROGRESS, DELIVERABLES and evidence checklist described the earlier constraints. Their current descriptions are aligned with this decision; the handover retains clearly marked historical concept text.
- The required LLM integration targets desktop WebGPU with an explicit browser model download capped at 400 MB. The current implementation uses cuisine-and-traits pickers until integration passes the agreed gates.

Amended 2026-10-17 during the NN2 planning interview: the restaurant-profile interpreter is required for the competition release, replacing the earlier after-MVP scope. Its job is free text to cuisine and supported traits for NN1, with editable output. Free-text interpretation itself must remain usable after the LinuxONE VM expires. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) records the implementation contract; [the plan](../plans/nn2-integration.md) retains the interview context. [ADR 0006](0006-nn2-proposes-a-profile-and-search-area.md) records the confirmation and search-area boundary.
