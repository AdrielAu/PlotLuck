// PROTOTYPE (#187), throwaway: compares two logos × three pixel display faces on the real landing page.
// Runs only with ?variant= in the URL, so the live site is unaffected. Delete before merging.
const LOGOS = { folded: 'Folded map', iso: 'Isometric map' };
const FACES = {
  pixelify: { name: 'Pixelify Sans', family: '"Pixelify Sans"', settings: 'normal', weight: 500, tracking: '-0.02em' },
  handjet: { name: 'Handjet', family: 'Handjet', settings: 'normal', weight: 500, tracking: '0' },
  departure: { name: 'Departure Mono', family: '"Departure Mono"', settings: 'normal', weight: 400, tracking: '-0.04em' },
};
const VARIANTS = Object.keys(LOGOS).flatMap(logo => Object.keys(FACES).map(face => `${logo}-${face}`));

const params = new URLSearchParams(location.search);
const current = params.get('variant');
if (VARIANTS.includes(current)) render(current);

function render(variant) {
  const [logo, faceKey] = variant.split('-');
  const face = FACES[faceKey];
  document.head.insertAdjacentHTML('beforeend', `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Handjet:ELGR,ELSH,wght@1..2,0..16,100..900&family=Pixelify+Sans:wght@400..700&family=Geist:wght@100..900&display=swap">
<style>
@font-face { font-family: "Departure Mono"; src: url("https://cdn.jsdelivr.net/gh/rektdeckard/departure-mono@v1.500/public/assets/DepartureMono-Regular.woff2") format("woff2"); }
:root { --display: ${face.family}, Georgia, serif; font-family: Geist, "Segoe UI", sans-serif; }
#title, #question, .review h2, .wordmark, #results-heading, .proto-specimen h2 {
  font-family: var(--display); font-weight: ${face.weight}; font-variation-settings: ${face.settings}; letter-spacing: ${face.tracking};
}
#title { display: inline-flex; align-items: center; gap: 0.18em; }
#title img { height: 0.95em; width: auto; image-rendering: pixelated; }
.proto-specimen { position: fixed; z-index: 5; top: 16px; right: 16px; width: 340px; padding: 16px 20px; background: #fff; }
.proto-specimen .wordmark { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 18px; }
.proto-specimen .wordmark img { height: 18px; image-rendering: pixelated; }
.proto-specimen h2 { margin: 4px 0 2px; font-size: 32px; line-height: 1.1; }
.proto-specimen p { margin: 0; font-size: 14px; color: #62615e; }
.proto-bar { position: fixed; z-index: 9999; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-radius: 999px; background: #111; color: #fff; font: 14px system-ui, sans-serif; box-shadow: 0 4px 16px rgb(0 0 0 / 0.3); }
.proto-bar button { border: 0; background: #333; color: #fff; border-radius: 999px; width: 32px; height: 32px; cursor: pointer; }
</style>`);

  const title = document.getElementById('title');
  title.innerHTML = `Plotluck<img src="prototype-logos/${logo}.svg" alt="">`;

  document.body.insertAdjacentHTML('beforeend', `
<aside class="proto-specimen" aria-hidden="true">
  <p class="wordmark"><img src="prototype-logos/mark.svg" alt="">Plotluck</p>
  <h2>Thai, mid-range, near Leeds</h2>
  <p>Results-screen heading and wordmark in this face. Body text is Geist.</p>
</aside>
<div class="proto-bar" role="navigation" aria-label="Prototype variants">
  <button type="button" data-step="-1" aria-label="Previous variant">←</button>
  <span>${VARIANTS.indexOf(variant) + 1}/${VARIANTS.length} · ${LOGOS[logo]} · ${face.name}</span>
  <button type="button" data-step="1" aria-label="Next variant">→</button>
</div>`);

  const go = step => {
    const next = VARIANTS[(VARIANTS.indexOf(variant) + step + VARIANTS.length) % VARIANTS.length];
    params.set('variant', next);
    location.search = params.toString();
  };
  document.querySelector('.proto-bar').addEventListener('click', e => {
    const step = Number(e.target.dataset.step);
    if (step) go(step);
  });
  addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
}
