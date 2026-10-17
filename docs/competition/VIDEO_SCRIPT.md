# Plotluck video script

Draft running time: **2 minutes 27 seconds**. The spoken lines below match the current video cut. A team member can read them over the same visuals when recording the final voice track. Speak naturally; the timings are guides, not targets to rush toward.

## 0:00–0:12 · Plotluck

**Visual:** Plotluck title and the question, “Where could your restaurant work?”

**Say:** Opening a restaurant takes a lot of work. Before you sign a lease, you need to decide where your idea could fit. We built Plotluck to give small restaurant owners a better place to start.

## 0:12–0:26 · Why we built it

**Visual:** “Choosing where to open is hard.”

**Say:** This started close to home. One of our teammates saw his father's restaurant close during COVID. We wanted to make the first location search a little less guesswork, especially for independent founders.

## 0:26–0:46 · Describe and clarify

**Visual:** The current one-description screen.

**Say:** Here's how it works. In one description, tell Plotluck about the food you want to serve, the kind of place you have in mind, and where you want to look. If something is unclear, it asks a follow-up. A complete description goes straight to district results. The answer-reading AI is still experimental.

## 0:46–1:09 · Compare districts

**Visual:** An earlier map capture with a score threshold and ranked list. The current build draws district outlines.

**Say:** Once the details are clear, Plotluck compares postcode districts. You can see them on a map, move the score threshold, and narrow down a ranked list. This map image is from an earlier build; the current map draws district outlines. The score uses customer ratings and review activity. It cannot tell you whether a restaurant will make money or survive.

## 1:09–1:21 · IBM LinuxONE

**Visual:** LinuxONE server details, then the Jupyter training screenshot.

**Say:** We trained the scoring model in Jupyter on IBM LinuxONE. These are screenshots from the actual server and training run. The machine uses the s390x architecture.

## 1:21–1:41 · Results

**Visual:** Model and baseline error values, plus the saved metrics.

**Say:** We tested the model across five folds, keeping whole postcode districts together. Its average prediction error was 0.0503, compared with 0.0823 for a baseline. That's encouraging, but we still need to test how well the district rankings work for each cuisine.

## 1:41–1:58 · The second AI model

**Visual:** LinuxONE language model inference evidence.

**Say:** We also tried a pretrained language model on LinuxONE to read restaurant descriptions. That early CPU test did not pass our quality check. We haven't trained or accelerated that model, and we're keeping the feature experimental while we test it further.

## 1:58–2:12 · After the event

**Visual:** Model export evidence and the browser deployment message.

**Say:** After training, we exported the scoring model's weights. The website runs them in your browser, so the district comparison can stay online even after the LinuxONE virtual machine is switched off.

## 2:12–2:27 · Close

**Visual:** Plotluck name, live demo and code links.

**Say:** Plotluck won't choose a restaurant site for you. It gives you a shortlist, so you know where to start visiting streets and checking costs. Our next step is to validate those rankings and finish testing the answer-reading AI.

**Recording note:** The current MP4 uses a temporary synthesized voice. Replace it with a team member's recording before final submission. Replace the earlier map capture with a current site recording. Keep the LinuxONE and training footage visible, and update claims if the model or evaluation changes.
