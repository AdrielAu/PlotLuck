# NN2 integration plan

Status: product interview complete. At the user's request, this plan has been synthesized and published as [specification #110](https://github.com/AdrielAu/PlotLuck/issues/110), the implementation contract. Implementation has started with #115's manual draft/confirmation foundation. NN2 interpretation and its feasibility/release gates remain open.

## Agreed requirements

- **Role (Q1):** NN2 interprets a restaurant profile into NN1's existing cuisine and shipped-trait vocabulary. Its output is editable by the user.
- **Release scope (Q2):** NN2 is mandatory for the competition release. Working pickers alone do not satisfy the release requirement. This replaces the previous after-MVP scope.
- **Durability (Q3):** free-text interpretation itself must keep working after the LinuxONE VM expires.
- **Review (Q5):** interpretation populates editable choices, followed by "Compare districts" before NN1 updates the map and rankings.
- **Inference (Q6):** NN2 should try to infer missing cuisine/trait values from context and ask the user to confirm its proposals. Q8 and Q9 define the cue requirement and confirmation behavior.
- **Single cuisine (Q7):** each profile supports one cuisine. Ambiguous alternatives require a user choice before scoring.
- **Deployment (Q4):** users run NN2 in their browser. LinuxONE runs a reproducible inference/evaluation notebook for validation and competition evidence. A public LinuxONE inference API is outside this plan.
- **Inference limits (Q8):** inferred values need identifiable cues in the restaurant description. For example, a student-focused cafe may justify proposing a budget price band, but generic ambience does not justify choosing a national cuisine. Without a useful cue, ask the user or show an unknown/default value. Extracted values, inferred proposals and defaults must remain distinguishable.
- **Confirmation granularity (Q9):** one "Compare districts" action confirms the entire visible profile. Inferred values are clearly marked and individually editable before confirmation. This settles the proposed action wording recorded under Q5.
- **Supported input (Q10):** English descriptions up to 1,000 characters; cuisine names from other languages are allowed.
- **Supported devices (Q11):** initial free-text support targets desktop Chrome/Edge with WebGPU available. Other devices retain manual pickers; they are outside the initial NN2 support guarantee.
- **Unsupported details (Q12):** show details that NN1 cannot use as "Not used in scoring", preserving the request for review without suggesting those details influence scores.
- **Privacy (Q13):** descriptions and interpretations stay in the current browser tab's memory, without server transmission or persistent storage. Downloaded model files can be cached separately. LinuxONE evaluation uses separate synthetic descriptions.
- **Search-area extension:** "Thai restaurant in London" must extract a restaurant profile and a geographic search area. The search area restricts the districts compared, mapped and ranked; it is separate from NN1's restaurant and district numeric features. Q14–19 and Q24 define geographic behavior. Location resolution must respect Q13.
- **Area confirmation (Q14):** ask the user to confirm the intended geographic scope where a name such as London has multiple interpretations. Do not silently fix London to Greater London or London postal districts.
- **Place coverage (Q15):** city names, boroughs and "near" searches are required in the first release, in addition to regions and postcode districts. The narrower proposed region/district-only scope was rejected. Public geography sources, the offline place catalogue and membership semantics must support this expanded requirement.
- **No location (Q16):** when the restaurant description includes no location, compare all England. Q19 handles explicitly mentioned unresolved or outside-England places separately.
- **Near searches (Q17):** use a straight-line radius around the selected place's reference point. Propose 5 km when no distance is stated; let the user edit it and honor explicit distances, including miles converted to kilometres. Review shows the resolved place and radius.
- **Radius membership (Q18):** include postcode districts whose centroids lie within the requested radius. Scores still describe whole districts, including parts outside the circle; explain this limitation in the interface.
- **Unresolved locations (Q19):** explicitly named places that are unresolved, ambiguous or outside England require a valid area choice before comparing districts. Only an absent location defaults to all England.
- **Initial model/runtime candidate (Q20):** evaluate Qwen2.5-0.5B-Instruct using WebLLM in the browser and the installed Transformers/PyTorch stack on LinuxONE. Keep it only if it passes the agreed gates; this is not evidence of compatibility or performance yet.
- **Download budget (Q21):** an explicit first-use browser model download with progress, cancellation and size disclosure; maximum 400 MB of browser model downloads. Cache model files separately from user input for subsequent use. LinuxONE's native-format weights are measured separately.
- **Latency gates (Q22):** on documented reference hardware, at least 95% of warm browser interpretations complete within 10 seconds; LinuxONE interpretations complete within 60 seconds. Record first download/load time separately. Slow requests retain progress and cancellation.
- **Quality gates (Q23):** at least 95 of 100 clear synthetic requests correctly identify cuisine, location and explicitly stated traits. Include dedicated ambiguity, negation and unsupported-request tests. Strict validation must prevent any invalid generated values from reaching NN1. Assess inferred proposals separately against a human-reviewed rubric that permits more than one reasonable suggestion.
- **Multiple locations (Q25):** one confirmed search area per comparison. A request such as "London or Manchester" asks the user to choose one; comparisons can be repeated for another area. Area unions/exclusions are outside the initial query contract and require clarification rather than silently dropping a restriction.
- **Manual edits (Q26):** manual corrections remain authoritative until the user explicitly re-runs interpretation. A new interpretation is a draft for review and does not replace the confirmed restaurant profile or search area until confirmation.
- **Failure recovery (Q27):** errors and cancellation preserve the last confirmed profile, area and results; show a recoverable error with retry/manual-edit actions. Manual recovery does not waive the NN2 release gates.

Recovery refinement, requested by the user on 2026-10-17: allow at most three
user-triggered interpretation attempts per description, then guide manual
completion of cuisine, search area and uncertain traits. Manual entry remains
available from the first attempt. No automatic retry loop; changing the
description resets the attempt allowance. Cancelling an attempt consumes that
attempt. Keep manual edits and confirmed results intact. The current browser
preview implements this policy; it does not turn manual corrections into model
successes or waive the quality gate.

Latest user clarification (2026-10-17): NN2 extracts **search area, cuisine,
menu price band, restaurant type and rent**, leaving other MVP inputs and feature
encoding to the existing code. Rent is a total GBP monthly/annual budget,
annualized for review. The user confirmed that a person chooses **low/mid/high/any
alongside that budget**. No automatic pounds-to-band mapping is defined. The
confirmed band uses the MVP's district rent tertiles to filter districts; it does
not overwrite NN1's district rent proxy. Manual dietary/chain choices remain
intact. This supersedes broad trait extraction for the current investigation;
retain the original benchmark scores separately. The approved development cases
lack explicit menu prices and rent, so they do not establish those extraction gates.

**Boundary membership (Q24):** city/borough searches include districts whose centroids lie inside the confirmed boundary. A district overlapping the area with its centroid outside is excluded; retained scores still describe whole districts.

## Verified facts and unresolved facts

- NN1 and the current pickers share `vocabulary.json`; it supplies cuisines, shipped traits, allowed values and defaults. The existing scoring function is not a validator for generated output: it encodes unknown categorical values as zeros and flags using JavaScript truthiness. NN2 needs strict validation before values reach scoring.
- [Live environment capture, issue #8](https://github.com/AdrielAu/PlotLuck/issues/8) records 3 CPUs, 7.8 GiB RAM, no swap, s390x, Python 3.12.15, torch 2.11.0+cpu, transformers 5.19.0, llama_cpp_python 0.3.36 and safetensors 0.8.0. The current availability and NN2 performance must be checked by the operator.
- Qwen2.5-0.5B-Instruct is the researched candidate, not yet validated for this task. [Publisher model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct). WebLLM's [model registry](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) includes a browser build; browser compatibility, download size and latency require measurement.
- LinuxONE runtime candidates are Transformers/PyTorch CPU or llama.cpp with a big-endian GGUF. The [official s390x instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/build-s390x.md) document the latter. Hardware support is not evidence of actual accelerated inference.
- The shared server is operated by one human at a time; coding agents do not work in that clone. Jupyter is accessed through an SSH tunnel. No public inference endpoint currently exists. See [the runbook](../server.md).
- **Competition permission is team-confirmed:** on 2026-10-17 the user confirmed pretrained weights are allowed. [The eligibility investigation](../competition/nn2-eligibility.md) records that permission basis separately from the official rules, which do not explicitly cover pretrained weights. Final artifact licences/notices and technical gates remain required.
- Offline geography source candidates: [OS Open Names](https://docs.os.uk/os-downloads/products/addresses-and-names-portfolio/os-open-names/os-open-names-technical-specification) supplies place identifiers, names, administrative context and British National Grid coordinates; [OS Open Built Up Areas](https://www.ordnancesurvey.co.uk/products/os-open-built-up-areas) supplies settlement extents; [Boundary-Line](https://www.ordnancesurvey.co.uk/products/boundary-line) supplies administrative boundaries. Coordinate conversion, a verified names-to-boundaries crosswalk, release pinning, attribution and compressed browser size need investigation. The full gazetteer must not be assumed to fit the browser budget. Precomputing area-to-district membership could avoid shipping polygons.
- [ONS built-up-area methodology](https://www.ons.gov.uk/peoplepopulationandcommunity/housing/articles/townsandcitiescharacteristicsofbuiltupareasenglandandwales/census2021) treats London differently from ordinary settlements; London, Greater London, City of London and boroughs need typed choices rather than one unqualified matching rule.

## Feasibility still to prove

- Final model/runtime artifact licences, attribution and notices; competition permission is team-confirmed.
- Candidate compatibility, quality, download size and measured latency in both runtimes.
- Permitted geography releases, reliable joins, coordinate conversion, preprocessing tooling and browser payload size. The captured LinuxONE environment has no GIS libraries installed; verify suitable formats/tooling without assuming changes to the shared image.
- Exact pinned releases, reference hardware and recorded evaluation outputs. These are implementation evidence, not established facts.

## Documentation follow-through

ADR 0001, ADR 0006, the glossary, README, root/web agent instructions and competition documents record the agreed scope. This documents requirements, not completed implementation. Older statements that free text is after MVP are superseded by Q2 above.

## Proposed implementation sequence

The published specification carries these implementation decisions and acceptance gates. The interview itself changed documentation; implementation proceeds through its child issues.

### 1. Establish eligibility and technical feasibility

- Record the readable current rules and the team-confirmed permission for pretrained weights; see the eligibility investigation for provenance. Preserve Qwen's licence/notice and distinguish pretrained inference from NN1 training in the submission. Final sign-off still requires the artifact notice audit and all technical gates.
- Pin the model revisions, browser runtime release and native runtime versions. Start with the installed Transformers/PyTorch stack on LinuxONE, without replacing the shared environment. Download the native weights on the VM under operator control; keep large weights outside git.
- Measure a small synthetic extraction set in both runtimes before building the full UI. Record cold download/load time, warm latency, errors, versions and hardware. A failing candidate triggers model/prompt/runtime investigation and a revised proposal; it does not remove the mandatory NN2 requirement or lower the agreed gates.
- Verify public geography downloads, redistribution terms, coordinate conversion, place-to-boundary joins and a compact browser payload. A city name must not be silently equated to its local authority. London candidate types remain explicit.

Completion: candidate inference works in both environments; source and licence paths are viable; measured sizes and latency support proceeding. Pretrained-weight permission is settled by team confirmation; final artifact notices remain a release check.

### 2. Define and test the interpretation and search-area contracts

- Derive the output schema from the shipped cuisine/trait vocabulary. Accept exactly one cuisine and only shipped traits, with exact enum and boolean validation. Distinguish explicit values, cue-based inferences and defaults, with evidence text tied to the submitted description. Use Unspecified/unknown/default values where no useful cue exists; an explicitly named unsupported cuisine or conflicting cuisines require user resolution.
- Treat search intent separately from restaurant traits: an absent location, a named place, or a named place plus radius. NN2 extracts location text and distance; deterministic local lookup supplies authoritative area IDs and coordinates. Generated coordinates or fabricated place identifiers never become search geometry.
- Return typed, labelled candidates for ambiguous names, including their administrative context. Resolve spelling/alias matches to catalogue entries and have the user confirm uncertain matches. Unsupported details appear as "Not used in scoring"; unresolved geographic restrictions block confirmation.
- Public test seams carried into the specification: generated reply + description + vocabulary to validated draft/errors; location mention + local catalogue to candidates; confirmed area + district table to selected districts. Reuse existing scoring/ranking interfaces and test the browser confirmation flow at its public surface.

Completion: deterministic tests cover valid drafts, negation, inferred/default distinction, unknown values, malformed replies, unsupported restrictions and ambiguous names.

### 3. Build the offline geography catalogue and scoped ranking

- Pin permitted OS/ONS releases and record attribution in `data/SOURCES.md`. Prepare an England-only catalogue of stable IDs, names/aliases, place types, centres and boundary membership. Check the names-to-boundaries linkage rather than joining by name alone. Filter out roads and unrelated gazetteer records.
- Precompute administrative/settlement membership by testing district centroids against confirmed boundaries; keep full boundary files out of the browser. Radius queries use the confirmed centre/radius against district centroids. Proposed technical convention: points exactly on a boundary or radius edge are included, with deterministic tests.
- Version the geography contract and ensure it matches the district codes/centroids used by the scoring bundle. Preserve NN1's numeric input contract and weights; adding a search filter does not itself require NN1 retraining. Extend publication checks to allow only approved geography fields and validate references.
- Filter the shared map/list result set by confirmed scope before threshold ranking. Compute the initial threshold within that scope at the 10th-best score (the lowest score when the scope has 10 or fewer districts; [#127](https://github.com/AdrielAu/PlotLuck/issues/127) replaced the earlier top-10% rule), while preserving a threshold the user has explicitly set until a new query is confirmed. Distinguish no matching district centroids from districts hidden by the score threshold. Empty results never silently widen the area.

Completion: known-answer tests cover cities, boroughs, regions, postcode districts, radius units/edges, ambiguous London choices, absent/unknown/outside-England places and empty scopes; retained districts keep their original NN1 scores.

### 4. Integrate browser interpretation and review

- Load the pinned WebLLM runtime/model only after an explicit first-use action with size disclosure, progress and cancellation. Keep generation off the UI thread and detect the supported WebGPU environment. Manual pickers remain available for unsupported devices and recovery.
- Maintain distinct description, proposed interpretation and confirmed query state. Show editable cuisine, shipped traits, search area and radius together; mark inferred values/defaults. "Compare districts" confirms the visible valid query and updates the map/list.
- Manual edits stay authoritative. Reinterpretation produces a new draft; cancelled, failed or superseded requests cannot replace newer drafts or confirmed results. Preserve and clearly identify the previous confirmed results while a new draft is pending.
- Keep descriptions, drafts and confirmed query data in tab memory only. Use local place lookup; model-file requests carry no description or interpretation payload. Disable prompt/response logging and persistent query storage. Model-file caching remains separate.
- Follow the existing interface design/accessibility workflow for review controls, ambiguity choices, keyboard use, loading, cancellation and errors. Explain centroid-based results and whole-district scores in user-facing terms.

Completion: browser flow tests and visual/keyboard inspection demonstrate interpretation, corrections, area confirmation, comparison, re-interpretation, retry and cancellation without leaking or persisting inputs.

### 5. Evaluate and release

- Create at least 100 human-labelled, clear synthetic requests covering cuisines, shipped traits, location types, spelling variants, explicit distances and omitted fields. Maintain additional adversarial/ambiguous/negated/unsupported cases. Freeze labels and the separate inference rubric before tuning; report misses rather than replacing failed examples. Reserve unseen cases for final evaluation.
- Require at least 95/100 complete clear requests to identify the correct cuisine, resolved location and explicitly stated traits. Report component metrics, clarification cases and inferred-proposal acceptability separately; syntactic validity is not semantic correctness. Validate the browser and LinuxONE paths separately; identical generated text is not required.
- On documented reference hardware, record browser warm p95 at or below 10 seconds and LinuxONE request latency at or below 60 seconds. Record cold loading separately and verify browser model downloads total at most 400 MB. Record geography/runtime download sizes and failures too.
- The current human server operator runs a thin Jupyter notebook calling the same extraction/evaluation contract on synthetic examples. Capture architecture/runtime details and inference output, timing and quality evidence. Publish safe aggregate run results and synthetic examples, excluding secrets. Describe CPU inference accurately unless accelerated execution is separately demonstrated.
- Run the relevant Python/Node suites, export/browser parity, privacy checks and real browser inspection. Align scope docs and evidence labels with mandatory NN2; retain screenshot numbering while identifying inference rather than claiming NN2 was trained.
- Open reviewed PRs for the slices above, run CI, and publish the compatible browser and geography assets together. Verify the static site works without a LinuxONE service and has clear model-download behavior. Rollback restores a compatible prior asset set; it does not count as satisfying the mandatory NN2 release.

Completion: all agreed feature, privacy, quality and performance gates pass, source/rules eligibility is documented, and both browser and LinuxONE evidence are reviewable. Otherwise report the specific unsatisfied gate before release.

## Specification handover

- [Specification #110](https://github.com/AdrielAu/PlotLuck/issues/110) is published with the `ready-for-agent` label. Its first delivery slice establishes eligibility and technical feasibility; that label does not claim the release gates already pass.
- Detailed file layout, exact pinned releases and geography payload are implementation outputs to verify, not facts established by this interview. Specification publication did not itself implement or release NN2; see progress for subsequent implementation work.
