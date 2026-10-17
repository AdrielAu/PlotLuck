# Plotluck

Plotluck scores English postcode districts for the review-based success of a restaurant of a given cuisine. This glossary holds the language used across the whole repo. A folder may keep its own `GLOSSARY.md` for terms used only inside it. It never redefines a term from this file, and a term that spreads beyond its folder moves here.

## Places

**Postcode district**:
The outward part of a UK postcode (SE15, E1, W1A). It is the unit Plotluck scores.
_Avoid_: Postcode, area, neighbourhood, borough, zone

**Postcode area**:
The letter prefix of a postcode (SE, E, W). It groups postcode districts.
_Avoid_: Area (on its own), region, borough

## Restaurants and scoring

**District context**:
The population, demographic composition, deprivation, commercial rent and mapped restaurant and tourism supply associated with a postcode district.
_Avoid_: Customer profile, customer demographics

**District sex composition**:
The shares of a district's residents recorded as female or male in the Census sex measure. It is distinct from gender identity.
_Avoid_: Most common gender, gender composition

**Restaurant**:
A real food business in the source data that serves a cuisine. Cafés, takeaways and pubs that serve food count; dark kitchens do not. The data work will tighten the exact inclusion rules.
_Avoid_: Venue, outlet, business

**Restaurant profile**:
The user's free-text description of the restaurant they want to open. Plotluck reads a cuisine and traits from it and scores it in every postcode district.
_Avoid_: Hypothetical restaurant, query, concept

**Cuisine**:
The style of food a restaurant serves, from Plotluck's fixed cuisine list.
_Avoid_: Food type, category

**Cuisine tag**:
One raw cuisine value on a source restaurant row, such as Pizza, Pub or European. Plotluck maps each one to a cuisine or sets it aside.
_Avoid_: Cuisine descriptor, raw cuisine

**Trait**:
A non-cuisine property of a restaurant or restaurant profile, picked from Plotluck's fixed trait list, such as price band, takeaway or vegan options.
_Avoid_: Tag, property, attribute, feature

**Venue type**:
The trait that says what kind of place a restaurant is: restaurant, pub and bar, café, or fast food and street food.
_Avoid_: Format, venue, establishment type

**Chain**:
The trait for a restaurant whose name appears at least three times in England.
_Avoid_: Franchise, brand

**Supply**:
How many restaurants a postcode district already has, either in total or of one cuisine (same-cuisine supply).
_Avoid_: Competition, density, saturation

**Score**:
A number from 0 to 1 that rates the expected review-based success of a restaurant profile in one postcode district. It is not a calibrated probability.
_Avoid_: Probability, likelihood, chance, rating, rank

**Review-based success**:
A restaurant's customer satisfaction and accumulated review activity, characterised by its average rating, review distribution and review counts. It does not measure profitability or longevity.
_Avoid_: Commercial success, survival, profitability, longevity

**Rating**:
A restaurant's average TripAdvisor star rating in the source data. It describes a real restaurant, never a postcode district.
_Avoid_: Score, stars, review score

**Score threshold**:
The cut-off a user sets on the map. Districts scoring below it are hidden.
_Avoid_: Cutoff, filter

**Survival**:
A restaurant that is still trading at the survival horizon after it opened.
_Avoid_: Longevity, success

**Survival horizon**:
The fixed length of time after opening at which survival is judged.
_Avoid_: Window, lifetime

**Cultural demand gap**:
For one cuisine in one postcode district, how far the supply of restaurants falls short of the demand implied by the resident population.
_Avoid_: Demand gap, diversity score, under-representation index

**Driver**:
One factor's contribution to a postcode district's score.
_Avoid_: Explanation, feature importance, reason

## Map

**Cluster**:
A map node that summarises the postcode districts beneath it at the current zoom. It splits into smaller nodes as the user zooms in.
_Avoid_: Bubble, marker, pin, cluster node

**District node**:
The deepest map node: a single postcode district.
_Avoid_: Leaf, marker, pin

**Driver chart**:
The display of a postcode district's drivers.
_Avoid_: Explanation panel, breakdown

## Workflow

**MVP**:
What Plotluck would submit if the build stopped now: a cuisine and traits picked from lists, scored by NN1 trained on LinuxONE and run in the browser to colour postcode districts above the score threshold. No free-text restaurant profile, clusters, driver chart or cultural demand gap.
_Avoid_: Demo, v1, vertical slice

**Sample data**:
Small data with the full data's schema that teammates use to test on their laptops. It is cut from the full data, or made up when a dataset's licence forbids sharing its rows.
_Avoid_: Test data, dev data, toy data

**Full data**:
The complete datasets. They are run only on LinuxONE.
_Avoid_: Production data, real data

**Server operator**:
The one teammate who is currently running `main` on LinuxONE.
_Avoid_: Admin, server owner

**Linux-only issue**:
A problem that passes on a laptop but fails on the LinuxONE server.
_Avoid_: Server bug, s390x bug
