// One filter bar for every board in the Studio (VeroNati): period (7 dias, 30 dias, or a range picked on the calendar)
// and ambiente ("Todos" or one), active filters as removable chips with "Limpar filtros", and the state in the URL so a
// link or the browser's back button brings the same view. The pure helpers are tested; createFilterBar owns the DOM.

export const DEFAULT_FILTERS = Object.freeze({ periodo: "7d", de: "", ate: "", ambiente: "todos" });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ["periodo", "de", "ate", "ambiente"];

// URL query -> complete, valid filters; a custom range needs both dates in order, else it falls back to 7 dias.
export function parseFilters(search = "") {
  const params = new URLSearchParams(search);
  const periodo = ["7d", "30d", "custom"].includes(params.get("periodo")) ? params.get("periodo") : "7d";
  const ambiente = /^[\w-]{1,64}$/.test(params.get("ambiente") ?? "") ? params.get("ambiente") : "todos";
  const de = ISO_DATE.test(params.get("de") ?? "") ? params.get("de") : "";
  const ate = ISO_DATE.test(params.get("ate") ?? "") ? params.get("ate") : "";
  if (periodo === "custom" && (!de || !ate || de > ate)) return { ...DEFAULT_FILTERS, ambiente };
  return { periodo, de: periodo === "custom" ? de : "", ate: periodo === "custom" ? ate : "", ambiente };
}

// The query the board route takes (only what differs from the defaults).
export function filtersQuery(filters) {
  const params = new URLSearchParams();
  for (const key of KEYS) if (filters[key] && filters[key] !== DEFAULT_FILTERS[key]) params.set(key, filters[key]);
  return params.toString();
}

// The page URL with these filters, other parameters untouched.
export function withFilters(href, filters) {
  const url = new URL(href);
  for (const key of KEYS) url.searchParams.delete(key);
  for (const [key, value] of new URLSearchParams(filtersQuery(filters))) url.searchParams.set(key, value);
  return url.toString();
}

const brDate = (iso) => (ISO_DATE.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export function periodLabel(filters) {
  if (filters.periodo === "30d") return "Últimos 30 dias";
  if (filters.periodo === "custom") return `${brDate(filters.de)} a ${brDate(filters.ate)}`;
  return "Últimos 7 dias";
}

// Chips for the filters that are not the default, each with the filters it leaves when removed.
export function filterChips(filters, ambientes = []) {
  const chips = [];
  if (filters.periodo !== DEFAULT_FILTERS.periodo) chips.push({ key: "periodo", label: periodLabel(filters), without: { ...filters, periodo: "7d", de: "", ate: "" } });
  if (filters.ambiente !== "todos") chips.push({ key: "ambiente", label: `Ambiente: ${ambientes.find((item) => item.id === filters.ambiente)?.name ?? "desconhecido"}`, without: { ...filters, ambiente: "todos" } });
  return chips;
}

// deps: { root, esc, svg, ambientes() -> [{ id, name, count }], get() -> filters, set(filters) }
export function createFilterBar(deps) {
  const { root, esc, svg } = deps;
  let picking = false;

  function render() {
    const filters = deps.get();
    const ambientes = deps.ambientes();
    const chips = filterChips(filters, ambientes);
    const preset = (value, label) => `<button type="button" class="fb-seg" data-periodo="${value}" aria-pressed="${filters.periodo === value}">${label}</button>`;
    root.innerHTML = `
      <div class="fb-group" role="group" aria-label="Período">
        ${preset("7d", "7 dias")}${preset("30d", "30 dias")}
        <button type="button" class="fb-seg" data-pick aria-pressed="${filters.periodo === "custom"}" aria-expanded="${picking}">${svg("i-calendar")}<span>${filters.periodo === "custom" ? esc(periodLabel(filters)) : "Selecionar"}</span></button>
      </div>
      ${picking ? `<form class="fb-range" data-range>
        <label><span>De</span><input type="date" name="de" value="${esc(filters.de)}" required /></label>
        <label><span>Até</span><input type="date" name="ate" value="${esc(filters.ate)}" required /></label>
        <button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary">Aplicar</button>
      </form>` : ""}
      <label class="fb-select"><span>Ambiente</span><select data-fb-ambiente aria-label="Ambiente">
        <option value="todos"${filters.ambiente === "todos" ? " selected" : ""}>Todos</option>
        ${ambientes.map((item) => `<option value="${esc(item.id)}"${filters.ambiente === item.id ? " selected" : ""}>${esc(item.name)}${item.count ? ` (${item.count})` : ""}</option>`).join("")}
      </select></label>
      ${chips.length ? `<div class="fb-chips">${chips.map((chip) => `<button type="button" class="fb-chip" data-chip="${chip.key}" title="Remover filtro">${esc(chip.label)}${svg("i-x")}</button>`).join("")}<button type="button" class="fb-clear" data-clear>Limpar filtros</button></div>` : ""}`;
  }

  root.addEventListener("click", (event) => {
    const filters = deps.get();
    const periodo = event.target.closest("[data-periodo]")?.dataset.periodo;
    if (periodo) {
      picking = false;
      deps.set({ ...filters, periodo, de: "", ate: "" });
    } else if (event.target.closest("[data-pick]")) {
      picking = !picking;
      render();
      root.querySelector('[name="de"]')?.focus();
    } else if (event.target.closest("[data-cancel]")) {
      picking = false;
      render();
    } else if (event.target.closest("[data-chip]")) {
      const chip = filterChips(filters, deps.ambientes()).find((item) => item.key === event.target.closest("[data-chip]").dataset.chip);
      if (chip) deps.set(chip.without);
    } else if (event.target.closest("[data-clear]")) {
      picking = false;
      deps.set({ ...DEFAULT_FILTERS });
    }
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target.closest("[data-range]");
    const de = form?.elements.de.value ?? "";
    const ate = form?.elements.ate.value ?? "";
    if (!ISO_DATE.test(de) || !ISO_DATE.test(ate) || de > ate) {
      form?.elements.ate.setCustomValidity("A data final vem depois da inicial.");
      form?.reportValidity();
      return;
    }
    picking = false;
    deps.set({ ...deps.get(), periodo: "custom", de, ate });
  });
  root.addEventListener("input", (event) => event.target.setCustomValidity?.(""));
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-fb-ambiente]")) deps.set({ ...deps.get(), ambiente: event.target.value });
  });

  return { render };
}
