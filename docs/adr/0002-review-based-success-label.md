# Review-based success replaces the survival label

On 2026-10-17 the team chose customer satisfaction and accumulated review activity as the training target, replacing the proposed three-year survival label. The supplied fields are average rating, total review count, and counts of excellent, very good, average, poor and terrible reviews; they do not establish profitability or longevity. Closed restaurants remain eligible when their reviews are valid, and no survival horizon applies.

The initial policy combines average rating, a category utility score and logarithmic review volume, with 20 prior reviews to reduce the influence of small samples. The agreed formula, weights, training-only reference values and exclusion rules are recorded in [What does the label measure?](https://github.com/AdrielAu/PlotLuck/issues/36). These weights are a product policy to try, not empirically validated coefficients; changing them changes the target and requires relabelling and retraining.

The map score estimates review-based success, not a probability of remaining open. The earlier data-source decision selected OSM restaurant rows, so the review dataset and its join still need verifying before this label can be built. Earlier survival wording in the handover and public-facing docs must be reconciled during the separately planned documentation update.

## Amendment, 2026-10-17: review counts

The source audit found that the five category counts describe default-language reviews, not all reviews, so dividing them by the total review count would exclude about a third of rows, mostly in tourist-heavy districts. The distribution term now uses the category counts' own sum, while the rating and volume terms use the total review count. Rows with inconsistent or missing counts are repaired where the repair is sound rather than excluded. The weights and prior strength are unchanged. The rules are recorded in [Choose the review count for the success label](https://github.com/AdrielAu/PlotLuck/issues/47).
