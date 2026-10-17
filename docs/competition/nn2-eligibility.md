# NN2 competition eligibility investigation

Checked 2026-10-17 for [#112](https://github.com/AdrielAu/PlotLuck/issues/112), part of [spec #110](https://github.com/AdrielAu/PlotLuck/issues/110).

**Conclusion: unresolved. Competition release/sign-off remains blocked.** The current official rules are now readable. They permit open-source libraries/frameworks but do not explicitly address pretrained weights. Their originality requirements make it unsafe to infer that the library exception also covers pretrained models. Technical experiments may continue; this note does not establish eligibility or complete #112's permission requirement.

## Primary competition evidence

The [2026 event page](https://www.starhacks.org/ibm-z-datathon-2026) links to the [official rules page](https://www.starhacks.org/ibmzdatathon-official-rule). The rules page is a Wix wrapper: its public `features_hqhov` metadata identifies an HTML component containing the [readable 17-page Official Rules & Prize Guidelines](https://www-starhacks-org.filesusr.com/html/286156_9c240117b947ac3d15b81403c2ce4218.html). This is the organizer's embedded document, not a previous year's rules or a third-party summary.

Retrieval identity for the embedded document:

- HTTP content type: `text/html; charset=utf-8`.
- HTTP Last-Modified: `Thu, 08 Oct 2026 17:26:34 GMT`.
- Original response body: 71,901 bytes.
- SHA-256: `7ea1b2bc5c96cb770e863ac48db38111abed87f6dc5a3e1155c3329c19bd30bb`.
- Document identifies IBM Z Datathon 2026, Shooting Stars Foundation and the October 17–18 event. The header supplies no separate revision number. The HTTP date is retrieval metadata, not a claimed legal effective date.

Relevant provisions, paraphrased from that document:

| Location | What it establishes | Implication for NN2 |
|---|---|---|
| Section 6, page 3, originality and open-source usage | Team-created projects are required; outside code, ideas and projects are prohibited. Libraries/frameworks are permitted when their links accompany the submission. | A framework exception exists; it does not name pretrained weights. |
| Section 7.1, page 4; section 7.2, page 5 | Original code must be created during the event. The technical rubric evaluates AI/ML open-source packages/code and meaningful LinuxONE use. | Describe the team's integration and the reused model separately. Open-source scoring criteria alone do not prove model eligibility. |
| Section 11, page 12 | Participants must have the necessary rights in submitted materials; the sponsor can request proof. | Preserve source licences and provenance. A competition exception would not replace those rights. |
| Section 14, page 13 | Rule revisions appear on the official event page. | Recheck at submission; capture any changed clauses and resolve their effect. |

Reading the full embedded document and searching for pretrained/pre-trained, weights and model reuse did not locate an explicit pretrained-weight permission or prohibition. **That absence is an investigation result, not permission.** Model-licence permissions and event eligibility are separate decisions.

## Model and runtime notices

The researched candidate is Qwen2.5-0.5B-Instruct. These are licence findings, not evidence that the model passes quality, performance or competition gates.

| Component | First-party evidence | Release obligation/follow-up |
|---|---|---|
| Native Qwen model | [Publisher licence at revision `7ae5576`](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/7ae557604adf67be50417f59c2c2f167def9a775/LICENSE): Apache-2.0; Alibaba Cloud copyright. | Retain the licence and applicable copyright/attribution; identify changes to modified files and retain any applicable upstream NOTICE. The inspected repository lists LICENSE, with no NOTICE file. |
| MLC browser conversion | [Publisher tree at revision `32ff081`](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/tree/32ff081fe7e4dfe4ffb167b94c66fdf11e02b8ad) | The inspected tree supplies no LICENSE/NOTICE and its model metadata supplies no licence field. Record the conversion's provenance and original Qwen licence; verify the actual converted artifacts' applicable terms before redistribution. Do not assume missing notices mean unrestricted rights. |
| WebLLM | [Upstream licence](https://github.com/mlc-ai/web-llm/blob/main/LICENSE): Apache-2.0 plus a bundled-component section. | Preserve runtime and bundled dependency notices for the exact shipped package, compiled model library and tokenizer assets. |
| Transformers | [Upstream licence](https://github.com/huggingface/transformers/blob/main/LICENSE): Apache-2.0. | Record the installed server version and preserve notices for any redistributed components. |
| PyTorch | [Upstream licence](https://github.com/pytorch/pytorch/blob/main/LICENSE): BSD-style terms with component notices. | Record the installed server version; preserve applicable copyright, licence and disclaimer on redistribution. |

The `main` runtime links are discovery references: the release reviewer must inspect the exact pinned distribution, including transitive dependencies. The browser downloads are part of the reviewed distribution even when fetched from a model host. Large weights stay outside git. Geography licences are reviewed separately in #114; Tripadvisor-derived rows remain subject to ADR 0003. Neither dataset risk acceptance nor an Apache licence proves compliance with section 11.

## Release decision and human follow-up

The team submission owner must obtain recorded clarification from the organizer/sponsor, or a revised official rule that explicitly covers the following question:

> May an original project built during the event use existing Apache-2.0 Qwen2.5-0.5B-Instruct weights, including an MLC quantized conversion, for inference in a static browser application and synthetic inference/evaluation on LinuxONE, while NN1 is trained by the team during the event? What disclosure or licence conditions apply under the originality and open-source exceptions?

No message has been sent to organizers. Save the primary response, author/authority, date, scope and conditions as reviewable evidence; redact private contact details. A human reviewer must assess whether it covers both weights and their browser conversion. If denied, revise the model approach with the user; manual pickers do not satisfy mandatory NN2. Until explicit permission is recorded, keep #112 and the competition sign-off gate open.

Once permission is resolved, the release reviewer checks the model/runtime revisions actually shipped, licence copies and notices, submission resource links, and event-window provenance. The human LinuxONE operator records synthetic inference separately from NN1 training. Describe NN2 as **pretrained inference/evaluation**, not team training, and CPU execution as CPU execution unless an acceleration measurement proves otherwise. No server environment changes or performance claims are authorized by this licence investigation.

Unchecked: organizer permission, converted-artifact rights verification, final distribution notices and measured runtime gates remain open.
