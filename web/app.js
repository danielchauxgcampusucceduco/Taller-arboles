"use strict";

const state = {
  tree: null,
  stats: null,
  nodesByPath: new Map(),
  currentPath: "/home/alex",
  selectedPath: null,
  expandedPaths: new Set(["/", "/home", "/home/alex"]),
  searchTimer: null,
  toastTimer: null,
};

const elements = {
  treeNavigation: document.querySelector("#tree-navigation"),
  fileList: document.querySelector("#file-list"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  totalStorage: document.querySelector("#total-storage"),
  directoryCount: document.querySelector("#directory-count"),
  fileCount: document.querySelector("#file-count"),
  entryCount: document.querySelector("#entry-count"),
  searchInput: document.querySelector("#search-input"),
  searchResults: document.querySelector("#search-results"),
  createDialog: document.querySelector("#create-dialog"),
  createForm: document.querySelector("#create-form"),
  parentPath: document.querySelector("#parent-path"),
  entryName: document.querySelector("#entry-name"),
  sizeFields: document.querySelector("#size-fields"),
  fileSize: document.querySelector("#file-size"),
  sizeUnit: document.querySelector("#size-unit"),
  formMessage: document.querySelector("#form-message"),
  submitCreateButton: document.querySelector("#submit-create-button"),
  toast: document.querySelector("#toast"),
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "No fue posible completar la operación.");
  }
  return payload;
}

async function loadTree(preferredPath = state.currentPath) {
  const payload = await requestJson("/api/tree");
  state.tree = payload.tree;
  state.stats = payload.stats;
  state.nodesByPath.clear();
  indexTree(state.tree);
  if (!state.nodesByPath.get(preferredPath)?.is_directory) {
    state.currentPath = state.nodesByPath.has("/home/alex") ? "/home/alex" : "/";
  } else {
    state.currentPath = preferredPath;
  }
  renderAll();
}

function indexTree(node) {
  state.nodesByPath.set(node.path, node);
  node.children.forEach(indexTree);
}

function renderAll() {
  renderTreeNavigation();
  renderOverview();
  renderBreadcrumbs();
  renderListing();
}

function renderTreeNavigation() {
  if (!state.tree) return;
  const rootList = document.createElement("ul");
  rootList.className = "tree-list";
  rootList.append(createTreeItem(state.tree));
  elements.treeNavigation.replaceChildren(rootList);
}

function createTreeItem(node) {
  const item = document.createElement("li");
  item.className = "tree-item";
  const row = document.createElement("div");
  row.className = `tree-row${state.currentPath === node.path ? " active" : ""}`;

  if (node.is_directory && node.children.length > 0) {
    const toggle = document.createElement("button");
    toggle.className = "tree-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", `${state.expandedPaths.has(node.path) ? "Contraer" : "Expandir"} ${node.name}`);
    toggle.setAttribute("aria-expanded", String(state.expandedPaths.has(node.path)));
    toggle.textContent = state.expandedPaths.has(node.path) ? "⌄" : "›";
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.expandedPaths.has(node.path)) state.expandedPaths.delete(node.path);
      else state.expandedPaths.add(node.path);
      renderTreeNavigation();
    });
    row.append(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "tree-toggle-spacer";
    row.append(spacer);
  }

  const select = document.createElement("button");
  select.className = "tree-select";
  select.type = "button";
  select.title = node.path;
  const glyph = document.createElement("span");
  glyph.className = "tree-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = node.path === "/" ? "⌂" : "▰";
  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = node.name;
  select.append(glyph, name);
  select.addEventListener("click", () => {
    state.currentPath = node.path;
    state.selectedPath = null;
    renderAll();
  });
  row.append(select);
  item.append(row);

  if (node.is_directory && node.children.length > 0 && state.expandedPaths.has(node.path)) {
    const children = document.createElement("ul");
    children.className = "tree-children";
    node.children.filter((child) => child.is_directory).forEach((child) => {
      children.append(createTreeItem(child));
    });
    item.append(children);
  }
  return item;
}

function renderOverview() {
  elements.totalStorage.textContent = formatSize(state.stats.total_size_bytes);
  elements.directoryCount.textContent = String(state.stats.directory_count);
  elements.fileCount.textContent = String(state.stats.file_count);
  const categories = [
    ["documents", "/home/alex/documents"],
    ["projects", "/home/alex/projects"],
    ["downloads", "/home/alex/downloads"],
  ];
  let categorized = 0;
  categories.forEach(([name, path]) => {
    const node = state.nodesByPath.get(path);
    const size = node?.size_bytes || 0;
    categorized += size;
    setStorageSegment(name, size);
  });
  setStorageSegment("other", Math.max(0, state.stats.total_size_bytes - categorized));
}

function setStorageSegment(name, size) {
  const segment = document.querySelector(`#segment-${name}`);
  const total = state.stats.total_size_bytes;
  segment.style.width = total > 0 ? `${(size / total) * 100}%` : "0%";
}

function renderBreadcrumbs() {
  const parts = state.currentPath === "/" ? [] : state.currentPath.split("/").filter(Boolean);
  const crumbs = [{ name: "/", path: "/" }];
  let current = "";
  parts.forEach((part) => {
    current += `/${part}`;
    crumbs.push({ name: part, path: current });
  });

  const fragment = document.createDocumentFragment();
  crumbs.forEach((crumb, index) => {
    if (index > 0) {
      const divider = document.createElement("span");
      divider.className = "crumb-divider";
      divider.textContent = "›";
      fragment.append(divider);
    }
    const button = document.createElement("button");
    button.className = `breadcrumb${index === crumbs.length - 1 ? " current" : ""}`;
    button.type = "button";
    button.textContent = crumb.name;
    button.setAttribute("aria-current", index === crumbs.length - 1 ? "page" : "false");
    button.addEventListener("click", () => {
      state.currentPath = crumb.path;
      state.selectedPath = null;
      renderAll();
    });
    fragment.append(button);
  });
  elements.breadcrumbs.replaceChildren(fragment);
}

function renderListing() {
  const directory = state.nodesByPath.get(state.currentPath);
  if (!directory?.is_directory) return;
  const children = [...directory.children].sort((left, right) => {
    if (left.is_directory !== right.is_directory) return left.is_directory ? -1 : 1;
    return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
  });

  if (children.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = "Este directorio está vacío";
    const detail = document.createElement("span");
    detail.textContent = "Crea una carpeta o un archivo para continuar.";
    cell.append(title, detail);
    row.append(cell);
    elements.fileList.replaceChildren(row);
    elements.entryCount.textContent = "0 elementos en este directorio";
    return;
  }

  const rows = children.map(createFileRow);
  elements.fileList.replaceChildren(...rows);
  elements.entryCount.textContent = `${children.length} ${children.length === 1 ? "elemento" : "elementos"} en este directorio`;
}

function createFileRow(node) {
  const row = document.createElement("tr");
  row.className = `file-row${node.path === state.selectedPath ? " selected" : ""}`;
  row.tabIndex = 0;

  const nameCell = document.createElement("td");
  const nameContent = document.createElement("div");
  nameContent.className = "entry-name-cell";
  const icon = document.createElement("span");
  icon.className = `entry-icon ${node.is_directory ? "directory" : "file"}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = node.is_directory ? "▰" : fileGlyph(node.name);
  const copy = document.createElement("span");
  copy.className = "entry-copy";
  const name = document.createElement("strong");
  name.textContent = node.name;
  const path = document.createElement("small");
  path.textContent = node.path;
  copy.append(name, path);
  nameContent.append(icon, copy);
  nameCell.append(nameContent);

  const typeCell = document.createElement("td");
  const type = document.createElement("span");
  type.className = `type-pill${node.is_directory ? "" : " file-type"}`;
  type.textContent = node.is_directory ? "Directorio" : "Archivo";
  typeCell.append(type);

  const sizeCell = document.createElement("td");
  const size = document.createElement("span");
  size.className = "size-value";
  size.textContent = formatSize(node.size_bytes);
  sizeCell.append(size);

  const actionsCell = document.createElement("td");
  actionsCell.className = "row-actions-cell";
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-row-button";
  deleteButton.type = "button";
  deleteButton.title = "Eliminar elemento";
  deleteButton.setAttribute("aria-label", `Eliminar ${node.name}`);
  deleteButton.textContent = "×";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteNode(node);
  });
  actionsCell.append(deleteButton);
  row.append(nameCell, typeCell, sizeCell, actionsCell);

  row.addEventListener("click", () => {
    state.selectedPath = node.path;
    if (node.is_directory) {
      state.currentPath = node.path;
      state.expandedPaths.add(node.path);
      renderAll();
    } else {
      renderListing();
    }
  });
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      row.click();
    }
  });
  return row;
}

function fileGlyph(name) {
  const extension = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(extension)) return "▧";
  if (["py", "js", "html", "css", "json"].includes(extension)) return "⌘";
  if (["zip", "gz", "tar"].includes(extension)) return "⬡";
  return "▤";
}

function formatSize(bytes) {
  if (bytes === 0) return "0 bytes";
  const units = ["bytes", "KiB", "MiB", "GiB", "TiB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(value)} ${units[unitIndex]}`;
}

function openCreateDialog(kind = "directory") {
  const current = state.nodesByPath.get(state.currentPath);
  if (!current?.is_directory) {
    showToast("Selecciona un directorio para crear un elemento.", true);
    return;
  }
  elements.parentPath.value = state.currentPath;
  elements.entryName.value = "";
  elements.formMessage.textContent = "";
  elements.createForm.querySelector(`input[name="kind"][value="${kind}"]`).checked = true;
  updateKindSelection();
  elements.createDialog.showModal();
  window.setTimeout(() => elements.entryName.focus(), 30);
}

function updateKindSelection() {
  const selectedKind = elements.createForm.querySelector("input[name='kind']:checked").value;
  document.querySelectorAll(".kind-option").forEach((option) => {
    option.classList.toggle("selected", option.dataset.kind === selectedKind);
  });
  elements.sizeFields.hidden = selectedKind !== "file";
}

async function createNode(event) {
  event.preventDefault();
  const formData = new FormData(elements.createForm);
  const kind = formData.get("kind");
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    elements.formMessage.textContent = "Escribe un nombre para el elemento.";
    elements.entryName.focus();
    return;
  }

  let sizeBytes = 0;
  if (kind === "file") {
    const amount = Number(elements.fileSize.value);
    if (!Number.isFinite(amount) || amount < 0) {
      elements.formMessage.textContent = "El tamaño debe ser un número igual o mayor que cero.";
      elements.fileSize.focus();
      return;
    }
    sizeBytes = Math.round(amount * Number(elements.sizeUnit.value));
    if (!Number.isSafeInteger(sizeBytes)) {
      elements.formMessage.textContent = "El tamaño supera el límite admitido.";
      return;
    }
  }

  elements.submitCreateButton.disabled = true;
  elements.formMessage.textContent = "";
  try {
    const result = await requestJson("/api/nodes", {
      method: "POST",
      body: JSON.stringify({
        parent_path: state.currentPath,
        name,
        kind,
        size_bytes: sizeBytes,
      }),
    });
    elements.createDialog.close();
    await loadTree(state.currentPath);
    state.selectedPath = result.path;
    renderListing();
    showToast(`Se creó ${kind === "directory" ? "la carpeta" : "el archivo"} «${name}».`);
  } catch (error) {
    elements.formMessage.textContent = error.message;
  } finally {
    elements.submitCreateButton.disabled = false;
  }
}

async function deleteNode(node) {
  const detail = node.is_directory
    ? `También se borrarán todos los elementos que contiene.`
    : `El archivo dejará de pertenecer al árbol.`;
  if (!window.confirm(`¿Eliminar «${node.name}»?\n${detail}`)) return;
  try {
    await requestJson(`/api/nodes?path=${encodeURIComponent(node.path)}`, { method: "DELETE" });
    state.selectedPath = null;
    await loadTree(state.currentPath);
    showToast(`Se eliminó «${node.name}» y se actualizó su directorio.`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function searchNodes(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    elements.searchResults.hidden = true;
    elements.searchResults.replaceChildren();
    return;
  }
  try {
    const payload = await requestJson(`/api/search?q=${encodeURIComponent(trimmed)}`);
    renderSearchResults(payload.results);
  } catch (error) {
    renderSearchMessage(error.message);
  }
}

function renderSearchResults(results) {
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = false;
  if (results.length === 0) {
    renderSearchMessage("No hay coincidencias para esta búsqueda.");
    return;
  }
  results.forEach((result) => {
    const button = document.createElement("button");
    button.className = "search-result";
    button.type = "button";
    const icon = document.createElement("span");
    icon.className = "search-result-icon";
    icon.textContent = result.is_directory ? "▰" : fileGlyph(result.name);
    const copy = document.createElement("span");
    copy.className = "search-result-copy";
    const name = document.createElement("strong");
    name.textContent = result.name;
    const path = document.createElement("small");
    path.textContent = result.path;
    copy.append(name, path);
    button.append(icon, copy);
    button.addEventListener("click", () => {
      if (result.is_directory) {
        state.currentPath = result.path;
        state.selectedPath = result.path;
      } else {
        const pathParts = result.path.split("/").filter(Boolean);
        pathParts.pop();
        state.currentPath = pathParts.length ? `/${pathParts.join("/")}` : "/";
        state.selectedPath = result.path;
      }
      state.expandedPaths.add(state.currentPath);
      elements.searchInput.value = "";
      elements.searchResults.hidden = true;
      renderAll();
    });
    elements.searchResults.append(button);
  });
}

function renderSearchMessage(message) {
  elements.searchResults.replaceChildren();
  const result = document.createElement("div");
  result.className = "search-empty";
  result.textContent = message;
  elements.searchResults.append(result);
  elements.searchResults.hidden = false;
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function bindEvents() {
  document.querySelector("#new-folder-button").addEventListener("click", () => openCreateDialog("directory"));
  document.querySelector("#new-file-button").addEventListener("click", () => openCreateDialog("file"));
  document.querySelector("#refresh-button").addEventListener("click", () => refreshTree());
  document.querySelector("#view-refresh-button").addEventListener("click", () => refreshTree());
  document.querySelector("#close-dialog-button").addEventListener("click", () => elements.createDialog.close());
  document.querySelector("#cancel-dialog-button").addEventListener("click", () => elements.createDialog.close());
  elements.createForm.addEventListener("submit", createNode);
  elements.createForm.querySelectorAll("input[name='kind']").forEach((input) => {
    input.addEventListener("change", updateKindSelection);
  });
  elements.searchInput.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => searchNodes(elements.searchInput.value), 180);
  });
  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") elements.searchResults.hidden = true;
    if (event.key === "Enter") {
      const firstResult = elements.searchResults.querySelector(".search-result");
      if (firstResult) firstResult.click();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) elements.searchResults.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.searchInput.focus();
    }
  });
}

async function refreshTree() {
  try {
    await loadTree(state.currentPath);
    showToast("El árbol se actualizó correctamente.");
  } catch (error) {
    showToast(error.message, true);
  }
}

bindEvents();
loadTree().catch((error) => {
  elements.treeNavigation.textContent = "No se pudo cargar el árbol.";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.className = "empty-state";
  const title = document.createElement("strong");
  title.textContent = "Sin conexión con el servidor";
  const detail = document.createElement("span");
  detail.textContent = error.message;
  cell.append(title, detail);
  row.append(cell);
  elements.fileList.replaceChildren(row);
  elements.entryCount.textContent = "Revisa que la aplicación esté en ejecución.";
});
