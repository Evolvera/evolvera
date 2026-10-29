// Ambientes: folders the user creates in the Studio, each one a box in the sidebar holding its conversations (like the
// project folders of the Claude app). Only the list lives here (pi-studio-data/ambientes.json); the conversations stay
// PI sessions of that folder, and removing an ambiente never touches the folder or its sessions.
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const AMBIENTES_MAX = 100;
const NAME_MAX = 60;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// A folder name Windows, macOS and Linux all accept: no reserved characters, no trailing dot/space, no device names.
export function folderName(name) {
  const clean = String(name ?? "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, NAME_MAX);
  if (!clean || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean)) return "";
  return clean;
}

export function ambienteName(name) {
  const clean = String(name ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (!clean) throw httpError(400, "Dê um nome ao ambiente");
  return clean;
}

// Where a new ambiente lives: the folder the user chose (absolute, no ".."), or <home>/PI Ambientes/<name>.
export function ambienteFolder({ name, cwd, home }) {
  if (cwd !== undefined && cwd !== null && String(cwd).trim()) {
    const raw = String(cwd).trim();
    if (!path.isAbsolute(raw) || /(^|[\\/])\.\.([\\/]|$)/.test(raw) || /[\r\n\0]/.test(raw)) throw httpError(400, "A pasta precisa ser um caminho completo, sem ..");
    if (/^[\\/]{2}/.test(raw)) throw httpError(400, "Pastas de rede não podem ser ambientes");
    const resolved = path.resolve(raw);
    if (path.parse(resolved).root === resolved) throw httpError(400, "Escolha uma pasta, não a raiz do disco");
    return resolved;
  }
  const folder = folderName(name);
  if (!folder) throw httpError(400, "Esse nome não serve como nome de pasta");
  return path.join(home, "PI Ambientes", folder);
}

// `allowFolder(realPath)`: the server's trust boundary for a folder the user named (known project, under a project root
// or the ambientes home, or an Orca worktree). A named folder must already exist; only <home>/PI Ambientes/<nome> is created.
export function createAmbientes({ storeFile, home, now = Date.now, key = (cwd) => path.resolve(cwd).toLowerCase(), allowFolder = async () => true }) {
  let cache = null;

  async function list() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(await readFile(storeFile, "utf8"));
      cache = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.cwd === "string" && typeof item.name === "string").slice(0, AMBIENTES_MAX) : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  async function save(items) {
    await mkdir(path.dirname(storeFile), { recursive: true });
    const temp = `${storeFile}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(items, null, 2), "utf8");
    await rename(temp, storeFile);
    cache = items;
  }

  return {
    list,
    async create({ name, cwd } = {}) {
      const clean = ambienteName(name);
      const folder = ambienteFolder({ name: clean, cwd, home });
      const items = await list();
      if (items.length >= AMBIENTES_MAX) throw httpError(409, "Limite de ambientes atingido");
      if (items.some((item) => key(item.cwd) === key(folder))) throw httpError(409, "Essa pasta já é um ambiente");
      const named = cwd !== undefined && cwd !== null && String(cwd).trim() !== "";
      let real = folder;
      try {
        const info = await stat(folder);
        if (!info.isDirectory()) throw httpError(409, "Já existe um arquivo com esse nome");
        real = await realpath(folder);
      } catch (error) {
        if (error.statusCode) throw error;
        if (named) throw httpError(400, "Essa pasta não existe. Deixe o campo vazio para o Studio criar uma.");
        await mkdir(folder, { recursive: true });
      }
      // The resolved folder (links followed) must sit inside the server's boundary; links out of it are refused too.
      if (named && !(await allowFolder(real))) throw httpError(403, "Essa pasta fica fora das raízes de projeto do Studio. Deixe o campo vazio para criar em PI Ambientes, ou abra a pasta como projeto antes.");
      const ambiente = { id: randomUUID(), name: clean, cwd: folder, createdAt: now() };
      await save([...items, ambiente]);
      return ambiente;
    },
    async rename(id, name) {
      const clean = ambienteName(name);
      const items = await list();
      if (!items.some((item) => item.id === id)) throw httpError(404, "Ambiente não encontrado");
      await save(items.map((item) => (item.id === id ? { ...item, name: clean } : item)));
      return (await list()).find((item) => item.id === id);
    },
    // Only leaves the list: the folder and its conversations stay where they are.
    async remove(id) {
      const items = await list();
      if (!items.some((item) => item.id === id)) throw httpError(404, "Ambiente não encontrado");
      await save(items.filter((item) => item.id !== id));
    },
  };
}
