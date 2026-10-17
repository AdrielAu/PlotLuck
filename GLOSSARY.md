# Plotluck

Plotluck scores English postcode districts for the review-based success of a restaurant of a given cuisine. This glossary holds the language used across the whole repo. A folder may keep its own `GLOSSARY.md` for terms used only inside it. It never redefines a term from this file, and a term that spreads beyond its folder moves here.

## Places

**Postcode district**:
The outward part of a UK postcode (SE15, E1, W1A). It is the unit Plotluck scores.
_Avoid_: Postcode, area, neighbourhood, borough, zone

**Cross-border postcode district**:
A postcode district with active postcodes assigned to England and at least one other UK country. A district entirely in England that touches a national boundary is not cross-border.
_Avoid_: Border district

**Postcode area**:
The letter prefix of a postcode (SE, E, W). It groups postcode districts.
_Avoid_: Area (on its own), region, borough

**Search area**:
The geographic scope within which a user wants to compare postcode districts. It limits the districts shown in the map and ranked list.
_Avoid_: Cuisine group, postcode area

**Rent band**:
How much commercial rent a user can take on: low, mid or high, the thirds of England's postcode districts by commercial rent, or any. Like the search area, it limits the districts shown; it is not a model input. A district with no rent value is in no band.
_Avoid_: Rent level, budget, price band

## Restaurants and scoring

**District context**:
The population, demographic composition, deprivation, commercial rent and mapped restaurant and tourism supply associated with a postcode district.
_Avoid_: Customer profile, customer demographics

**Estimated district context**:
A district context value inferred from comparable nearby postcode districts when its own value is unavailable or unreliable. It is distinct from a recorded value.
_Avoid_: Actual value, measured value

**Unsupported district**:
A postcode district whose available and estimated context does not provide enough evidence for a score. It is omitted from the ranked results.
_Avoid_: Low-scoring district

**District sex composition**:
The shares of a district's residents recorded as female or male in the Census sex measure. It is distinct from gender identity.
_Avoid_: Most common gender, gender composition

**Restaurant**:
A real food business in the source data that serves a cuisine. Cafés, takeaways and pubs that serve food count; dark kitchens do not. A restaurant needs a usable location in England and appears once, however many duplicate listings it has.
_Avoid_: Venue, outlet, business

**Duplicate listing**:
Two or more source rows that describe the same restaurant at the same place. Plotluck keeps one.
_Avoid_: Duplicate restaurant, copy

**Restaurant profile**:
The user's description of the restaurant they want to open, given as answers to the questions screen and joined into one labelled text. Plotluck proposes a cuisine, supported traits and a search area for review before comparing postcode districts.
_Avoid_: Hypothetical restaurant, query, concept

**Restaurant-profile interpreter (NN2)**:
The part of Plotluck that identifies a cuisine and supported traits from a restaurant profile, for use in district scoring. Its interpretation is editable by the user.
_Avoid_: District scorer, success predictor

**Inferred profile value**:
A cuisine or trait suggested from the context of a restaurant profile rather than explicitly stated by its author. It is a proposal for the user to confirm.
_Avoid_: Confirmed preference, observed fact

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
The trait for a restaurant whose name, ignoring case, accents and punctuation, appears at least three times in England.
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
The required competition product: free-text interpretation by NN2, editable cuisine and trait choices, a confirmed search area, and district scores from NN1 shown on a map and ranked list. Clusters, driver charts and the cultural demand gap are outside this scope.
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
