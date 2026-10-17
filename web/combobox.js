// ARIA 1.2 combobox with a listbox popup, shared by the question box and the cuisine picker.
// `search(text)` returns the options [{label}] for the typed text; `onPick(option)` runs when
// one is chosen and decides what the input then holds. `count(n, text)` words the live status.
export function setUpCombobox({ input, list, status, search, onPick, count }) {
  let matches = [];
  let active = -1;

  function setActive(index) {
    active = index;
    for (const [i, li] of [...list.children].entries()) li.setAttribute("aria-selected", String(i === active));
    if (active < 0) {
      input.removeAttribute("aria-activedescendant");
    } else {
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    }
  }

  function open(text = input.value) {
    matches = search(text);
    list.replaceChildren(
      ...matches.map((option, i) => {
        const li = document.createElement("li");
        li.id = `${list.id}-${i}`;
        li.setAttribute("role", "option");
        li.textContent = option.label;
        // mousedown keeps focus in the input; click then picks.
        li.addEventListener("mousedown", (event) => event.preventDefault());
        li.addEventListener("click", () => pick(option));
        return li;
      }),
    );
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    status.textContent = count(matches.length, text.trim());
    status.classList.toggle("shown", matches.length === 0 && text.trim() !== "");
    setActive(-1);
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    status.classList.remove("shown");
  }

  function pick(option) {
    close();
    onPick(option);
  }

  // No open on focus: tabbing through should not announce the whole list.
  input.addEventListener("input", () => open());
  input.addEventListener("click", () => { if (list.hidden) open(); });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) return open();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + matches.length) % matches.length);
    } else if (event.key === "Enter" && !list.hidden && (active >= 0 || matches.length === 1)) {
      // A single match ("viet") is picked by Enter without arrowing to it.
      event.preventDefault();
      pick(matches[Math.max(active, 0)]);
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      close();
    }
  });
  return { close };
}
