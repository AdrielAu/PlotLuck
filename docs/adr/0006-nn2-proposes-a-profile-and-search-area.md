# NN2 proposes an editable profile and search area before NN1 scores

**Later user amendment, 2026-10-17:** the one free-text description stays, but NN2 pre-fills the review card's pickers; the user can manually correct any wrong value and confirms before NN1 scores. This restores the review-before-scoring requirement below; the six questions do not return. See the NN2 plan.

**Earlier user amendment, 2026-10-17:** the product now accepts one free-text description and shows results immediately when its interpretation is clear and valid. Clarify only unclear or invalid details; remove the six-question flow, routine review card and results pickers. Editing the description explicitly re-runs interpretation. This supersedes the review-before-scoring requirement below; offline geography, strict validation, privacy and preservation of previous results remain in force. See the current contract in the NN2 plan.

Agreed during the 2026-10-17 product interview. NN2 is required competition scope under ADR 0001. [Spec #110](https://github.com/AdrielAu/PlotLuck/issues/110) records the implementation contract; this decision records the settled product boundary.

A description such as "Thai restaurant in London" expresses both a restaurant profile and a search area. NN2 proposes one cuisine and supported traits, distinguishing explicit values, cue-based inferences and defaults. It also extracts location intent; a deterministic offline place catalogue supplies authoritative place identifiers and geometry. Ambiguous locations require a user choice. Without a location, the scope is England; an unresolved explicit location blocks comparison.

The user reviews and edits the whole draft, then confirms with "Compare districts". Manual edits remain authoritative until explicit reinterpretation. A new draft, failure or cancellation preserves the last confirmed profile, area and results. Unsupported details are visible as unused in scoring.

NN1 retains its numeric input contract and scores whole postcode districts. Search areas filter which districts are compared, mapped and ranked. City/borough membership uses district centroids inside the confirmed boundary; near searches use centroids within a confirmed straight-line radius. Overlapping districts whose centroids fall outside are excluded. These limits must be visible to users.

Browser inference and offline place resolution keep descriptions and interpretations in tab memory, with no server transmission or persistent query storage, and keep interpretation working after the VM expires. LinuxONE evaluation uses synthetic descriptions. This requires a downloadable browser model and local geography assets, whose size and feasibility remain to be measured. Device support, runtime candidates and acceptance gates are in [the integration plan](../plans/nn2-integration.md).
