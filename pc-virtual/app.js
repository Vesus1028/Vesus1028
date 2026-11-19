/* =========================================================
   PC Virtual (VesusOS) — um desktop que roda no navegador.
   Tudo é salvo no localStorage do navegador.
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.append(c instanceof Node ? c : document.createTextNode(c));
    }
    return node;
  };

  /* ---------------- Armazenamento ---------------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("vos:" + key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("vos:" + key, JSON.stringify(value)); } catch { /* sem storage */ }
    },
  };

  /* ---------------- Sistema de arquivos virtual ---------------- */
  const HOME = "/home/usuario";
  const defaultFS = () => ({
    type: "dir", children: {
      home: { type: "dir", children: {
        usuario: { type: "dir", children: {
          Documentos: { type: "dir", children: {
            "leia-me.txt": { type: "file", content:
              "Bem-vindo ao seu PC Virtual!\n\n" +
              "- Clique duas vezes nos ícones para abrir os apps.\n" +
              "- Clique com o botão direito na área de trabalho para mais opções.\n" +
              "- Digite 'help' no Terminal para ver os comandos.\n" +
              "- Tudo fica salvo no seu navegador." },
          }},
          Imagens: { type: "dir", children: {} },
          Downloads: { type: "dir", children: {} },
          "notas.txt": { type: "file", content: "Minhas anotações...\n" },
        }},
      }},
    },
  });
  let fsRoot = store.get("fs", null) || defaultFS();
  const saveFS = () => store.set("fs", fsRoot);

  const fs = {
    normalize(path, cwd = HOME) {
      if (!path) return cwd;
      if (path === "~") path = HOME;
      else if (path.startsWith("~/")) path = HOME + path.slice(1);
      const parts = (path.startsWith("/") ? path : cwd + "/" + path).split("/");
      const out = [];
      for (const p of parts) {
        if (!p || p === ".") continue;
        if (p === "..") out.pop(); else out.push(p);
      }
      return "/" + out.join("/");
    },
    get(path) {
      let node = fsRoot;
      for (const p of path.split("/").filter(Boolean)) {
        if (node.type !== "dir" || !node.children[p]) return null;
        node = node.children[p];
      }
      return node;
    },
    parent(path) {
      const parts = path.split("/").filter(Boolean);
      const name = parts.pop();
      return { dir: this.get("/" + parts.join("/")), name };
    },
    write(path, content) {
      const { dir, name } = this.parent(path);
      if (!dir || dir.type !== "dir") throw new Error("diretório não existe");
      const existing = dir.children[name];
      if (existing && existing.type === "dir") throw new Error("é um diretório");
      dir.children[name] = { type: "file", content };
      saveFS(); emit("fs");
    },
    mkdir(path) {
      const { dir, name } = this.parent(path);
      if (!dir || dir.type !== "dir") throw new Error("diretório não existe");
      if (dir.children[name]) throw new Error("já existe");
      dir.children[name] = { type: "dir", children: {} };
      saveFS(); emit("fs");
    },
    remove(path) {
      const { dir, name } = this.parent(path);
      if (!dir || !dir.children[name]) throw new Error("não encontrado");
      delete dir.children[name];
      saveFS(); emit("fs");
    },
    rename(path, newName) {
      const { dir, name } = this.parent(path);
      if (!dir || !dir.children[name]) throw new Error("não encontrado");
      if (dir.children[newName]) throw new Error("já existe");
      dir.children[newName] = dir.children[name];
      delete dir.children[name];
      saveFS(); emit("fs");
    },
    uniqueName(dirPath, base, ext = "") {
      const dir = this.get(dirPath);
      let name = base + ext, i = 2;
      while (dir.children[name]) name = `${base} (${i++})${ext}`;
      return name;
    },
  };

  /* Eventos simples para atualizar janelas quando algo muda */
  const listeners = {};
  const on = (evt, fn) => ((listeners[evt] ||= new Set()).add(fn), () => listeners[evt].delete(fn));
  const emit = (evt, data) => listeners[evt]?.forEach((fn) => fn(data));

  /* ---------------- Gerenciador de janelas ---------------- */
  const windowsEl = $("#windows");
  const taskList = $("#task-list");
  let zTop = 10, winCount = 0;
  const wins = new Map();

  function openWindow({ title, icon = "🗔", width = 560, height = 400, content, onClose }) {
    const id = ++winCount;
    const offset = (wins.size % 8) * 28;
    const desk = $("#desktop").getBoundingClientRect();
    width = Math.min(width, desk.width - 20);
    height = Math.min(height, desk.height - 20);

    const titleEl = el("span", { class: "title" }, `${icon} ${title}`);
    const body = el("div", { class: "win-body" });
    const win = el("div", { class: "window", style:
      `left:${Math.max(10, (desk.width - width) / 2 - 80 + offset)}px;` +
      `top:${Math.max(10, (desk.height - height) / 2 - 40 + offset)}px;` +
      `width:${width}px;height:${height}px;` },
      el("div", { class: "titlebar" },
        titleEl,
        el("button", { title: "Minimizar", onclick: (e) => { e.stopPropagation(); minimize(id); } }, "—"),
        el("button", { title: "Maximizar", onclick: (e) => { e.stopPropagation(); win.classList.toggle("maximized"); } }, "▢"),
        el("button", { class: "close", title: "Fechar", onclick: (e) => { e.stopPropagation(); close(id); } }, "✕"),
      ),
      body,
    );
    const task = el("button", { class: "task", onclick: () => {
      const w = wins.get(id);
      if (w.win.classList.contains("minimized")) focus(id);
      else if (w.win.classList.contains("focused")) minimize(id);
      else focus(id);
    } }, `${icon} ${title}`);

    const w = { id, win, task, onClose, setTitle(t) { titleEl.textContent = `${icon} ${t}`; task.textContent = `${icon} ${t}`; } };
    wins.set(id, w);
    windowsEl.append(win);
    taskList.append(task);
    win.addEventListener("pointerdown", () => focus(id));
    makeDraggable(win, win.querySelector(".titlebar"));
    win.querySelector(".titlebar").addEventListener("dblclick", () => win.classList.toggle("maximized"));
    content(body, w);
    focus(id);
    return w;
  }

  function focus(id) {
    for (const w of wins.values()) { w.win.classList.remove("focused"); w.task.classList.remove("active"); }
    const w = wins.get(id);
    if (!w) return;
    w.win.classList.remove("minimized");
    w.win.classList.add("focused");
    w.task.classList.add("active");
    w.win.style.zIndex = ++zTop;
  }
  function minimize(id) {
    const w = wins.get(id);
    w.win.classList.add("minimized");
    w.win.classList.remove("focused");
    w.task.classList.remove("active");
  }
  function close(id) {
    const w = wins.get(id);
    if (!w) return;
    if (w.onClose && w.onClose() === false) return;
    w.win.remove(); w.task.remove(); wins.delete(id);
  }

  function makeDraggable(win, handle) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || win.classList.contains("maximized")) return;
      const startX = e.clientX - win.offsetLeft, startY = e.clientY - win.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        win.style.left = `${ev.clientX - startX}px`;
        win.style.top = `${Math.max(0, ev.clientY - startY)}px`;
      };
      const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  /* ---------------- Apps ---------------- */
  const apps = {
    explorer: { name: "Arquivos", icon: "📁", open: (path) => Explorer(path) },
    notepad: { name: "Bloco de Notas", icon: "📝", open: (path) => Notepad(path) },
    calc: { name: "Calculadora", icon: "🧮", open: () => Calculator() },
    terminal: { name: "Terminal", icon: "💻", open: () => Terminal() },
    paint: { name: "Paint", icon: "🎨", open: () => Paint() },
    browser: { name: "Navegador", icon: "🌐", open: () => Browser() },
    velha: { name: "Jogo da Velha", icon: "❌", open: () => TicTacToe() },
    settings: { name: "Configurações", icon: "⚙️", open: () => Settings() },
    about: { name: "Sobre este PC", icon: "ℹ️", open: () => About() },
  };

  function openFile(path) {
    const node = fs.get(path);
    if (!node) return;
    if (node.type === "dir") return Explorer(path);
    if (/\.png$/i.test(path)) return ImageViewer(path);
    return Notepad(path);
  }

  /* --- Explorador de arquivos --- */
  function Explorer(startPath = HOME) {
    let cwd = startPath;
    openWindow({ title: "Arquivos", icon: "📁", width: 620, height: 420, content(body, w) {
      const pathEl = el("span", { class: "path" });
      const files = el("div", { class: "files" });
      const refresh = () => {
        const dir = fs.get(cwd);
        if (!dir) { cwd = HOME; return refresh(); }
        pathEl.textContent = cwd;
        w.setTitle(`Arquivos — ${cwd.split("/").pop() || "/"}`);
        files.replaceChildren();
        const entries = Object.entries(dir.children)
          .sort(([a, x], [b, y]) => (x.type === y.type ? a.localeCompare(b) : x.type === "dir" ? -1 : 1));
        if (!entries.length) files.append(el("div", { class: "empty" }, "Pasta vazia"));
        for (const [name, node] of entries) {
          const full = (cwd === "/" ? "" : cwd) + "/" + name;
          const item = el("div", { class: "file", title: name,
            ondblclick: () => node.type === "dir" ? (cwd = full, refresh()) : openFile(full),
            oncontextmenu: (e) => {
              e.preventDefault(); e.stopPropagation();
              contextMenu(e.clientX, e.clientY, [
                ["Abrir", () => node.type === "dir" ? (cwd = full, refresh()) : openFile(full)],
                ["Renomear", () => {
                  const n = prompt("Novo nome:", name);
                  if (n && n !== name) try { fs.rename(full, n); } catch (err) { alert(err.message); }
                }],
                ["Excluir", () => { if (confirm(`Excluir "${name}"?`)) fs.remove(full); }],
              ]);
            },
          }, el("span", { class: "emoji" }, iconFor(name, node)), name);
          files.append(item);
        }
      };
      files.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        contextMenu(e.clientX, e.clientY, [
          ["Nova pasta", () => newFolder(cwd)],
          ["Novo arquivo de texto", () => newTextFile(cwd)],
        ]);
      });
      body.append(el("div", { class: "explorer" },
        el("div", { class: "toolbar" },
          el("button", { title: "Voltar", onclick: () => { cwd = fs.normalize("..", cwd); refresh(); } }, "⬆"),
          el("button", { title: "Início", onclick: () => { cwd = HOME; refresh(); } }, "🏠"),
          pathEl,
          el("button", { onclick: () => newFolder(cwd) }, "+ Pasta"),
          el("button", { onclick: () => newTextFile(cwd) }, "+ Arquivo"),
        ),
        files,
      ));
      const off = on("fs", refresh);
      w.onClose = off;
      refresh();
    } });
  }

  function iconFor(name, node) {
    if (node.type === "dir") return "📁";
    if (/\.png$/i.test(name)) return "🖼️";
    return "📄";
  }
  function newFolder(dirPath) {
    const name = prompt("Nome da pasta:", fs.uniqueName(dirPath, "Nova pasta"));
    if (name) try { fs.mkdir(fs.normalize(name, dirPath)); } catch (e) { alert(e.message); }
  }
  function newTextFile(dirPath) {
    const name = prompt("Nome do arquivo:", fs.uniqueName(dirPath, "Novo documento", ".txt"));
    if (name) try { fs.write(fs.normalize(name, dirPath), ""); } catch (e) { alert(e.message); }
  }

  /* --- Bloco de notas --- */
  function Notepad(path = null) {
    openWindow({ title: "Bloco de Notas", icon: "📝", width: 600, height: 420, content(body, w) {
      let dirty = false;
      const ta = el("textarea", { spellcheck: false, value: path ? fs.get(path)?.content ?? "" : "" });
      const updateTitle = () => w.setTitle(`${dirty ? "● " : ""}${path ? path.split("/").pop() : "Sem título"} — Bloco de Notas`);
      ta.addEventListener("input", () => { dirty = true; updateTitle(); });
      const save = (as = false) => {
        if (!path || as) {
          const name = prompt("Salvar como (caminho):", path || HOME + "/Documentos/" + fs.uniqueName(HOME + "/Documentos", "documento", ".txt"));
          if (!name) return;
          path = fs.normalize(name);
        }
        try { fs.write(path, ta.value); dirty = false; updateTitle(); } catch (e) { alert(e.message); }
      };
      ta.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      });
      w.onClose = () => !dirty || confirm("Fechar sem salvar?");
      body.append(el("div", { class: "fill notepad" },
        el("div", { class: "toolbar" },
          el("button", { onclick: () => save() }, "💾 Salvar"),
          el("button", { onclick: () => save(true) }, "Salvar como…"),
          el("button", { onclick: () => {
            const blob = new Blob([ta.value], { type: "text/plain" });
            const a = el("a", { href: URL.createObjectURL(blob), download: path ? path.split("/").pop() : "documento.txt" });
            a.click(); URL.revokeObjectURL(a.href);
          } }, "⬇ Baixar"),
        ),
        ta,
      ));
      updateTitle();
      setTimeout(() => ta.focus());
    } });
  }

  /* --- Calculadora --- */
  function safeCalc(expr) {
    const clean = String(expr).replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".");
    if (!/^[0-9+\-*/%.() ]+$/.test(clean)) throw new Error("expressão inválida");
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict";return (${clean})`)();
    if (typeof r !== "number" || !isFinite(r)) throw new Error("erro");
    return Math.round(r * 1e10) / 1e10;
  }
  function Calculator() {
    openWindow({ title: "Calculadora", icon: "🧮", width: 300, height: 440, content(body) {
      let expr = "";
      const hist = el("small");
      const out = el("span", {}, "0");
      const render = () => { out.textContent = expr || "0"; };
      const press = (k) => {
        if (k === "C") { expr = ""; hist.textContent = ""; }
        else if (k === "⌫") expr = expr.slice(0, -1);
        else if (k === "=") {
          try { const r = safeCalc(expr); hist.textContent = expr + " ="; expr = String(r); }
          catch { hist.textContent = "Erro"; }
        } else expr += k;
        render();
      };
      const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "⌫", "0", ".", "="];
      const root = el("div", { class: "calc", tabIndex: 0 },
        el("div", { class: "display" }, hist, out),
        el("div", { class: "keys" }, keys.map((k) => el("button", {
          class: k === "=" ? "eq" : /[÷×\-+()C⌫]/.test(k) ? "op" : "", onclick: () => press(k),
        }, k))),
      );
      root.addEventListener("keydown", (e) => {
        if (/^[0-9.()+\-]$/.test(e.key)) press(e.key);
        else if (e.key === "*") press("×");
        else if (e.key === "/") { e.preventDefault(); press("÷"); }
        else if (e.key === "Enter" || e.key === "=") press("=");
        else if (e.key === "Backspace") press("⌫");
        else if (e.key === "Escape") press("C");
      });
      body.append(root);
      setTimeout(() => root.focus());
    } });
  }

  /* --- Terminal --- */
  function Terminal() {
    openWindow({ title: "Terminal", icon: "💻", width: 640, height: 400, content(body, w) {
      let cwd = HOME;
      const history = [];
      let hIdx = 0;
      const term = el("div", { class: "terminal" });
      const promptEl = el("span", { class: "prompt" });
      const input = el("input", { autocomplete: "off", spellcheck: false });
      const row = el("div", { class: "input-row" }, promptEl, input);
      const setPrompt = () => { promptEl.textContent = `usuario@vesus:${cwd.replace(HOME, "~")}$`; };
      const print = (text = "") => { term.insertBefore(el("div", { class: "line" }, text), row); };
      term.append(row);
      term.addEventListener("click", () => input.focus());

      const commands = {
        help: () => print(
          "Comandos disponíveis:\n" +
          "  ls [dir]         lista arquivos\n" +
          "  cd <dir>         muda de pasta\n" +
          "  pwd              mostra a pasta atual\n" +
          "  cat <arq>        mostra o conteúdo\n" +
          "  echo <txt> [> arq]  escreve texto (ou salva em arquivo)\n" +
          "  touch <arq>      cria arquivo vazio\n" +
          "  mkdir <dir>      cria pasta\n" +
          "  rm <caminho>     remove arquivo/pasta\n" +
          "  mv <de> <para>   renomeia\n" +
          "  open <app|arq>   abre um app ou arquivo\n" +
          "  calc <expr>      calcula (ex: calc 2*(3+4))\n" +
          "  date, whoami, neofetch, clear, exit"),
        ls: ([p]) => {
          const path = fs.normalize(p, cwd), node = fs.get(path);
          if (!node) return print(`ls: ${p}: não encontrado`);
          if (node.type === "file") return print(p);
          print(Object.entries(node.children).map(([n, c]) => c.type === "dir" ? n + "/" : n).join("  ") || "");
        },
        cd: ([p]) => {
          const path = fs.normalize(p || "~", cwd), node = fs.get(path);
          if (!node || node.type !== "dir") return print(`cd: ${p}: não é uma pasta`);
          cwd = path;
        },
        pwd: () => print(cwd),
        cat: ([p]) => {
          const node = fs.get(fs.normalize(p, cwd));
          if (!node) return print(`cat: ${p}: não encontrado`);
          if (node.type === "dir") return print(`cat: ${p}: é uma pasta`);
          print(node.content);
        },
        echo: (args, raw) => {
          const m = raw.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)$/);
          if (m) {
            const path = fs.normalize(m[3], cwd);
            const prev = m[2] === ">>" ? (fs.get(path)?.content ?? "") : "";
            try { fs.write(path, prev + m[1].replace(/^["']|["']$/g, "") + "\n"); } catch (e) { print("echo: " + e.message); }
          } else print(args.join(" "));
        },
        touch: ([p]) => { const path = fs.normalize(p, cwd); if (!fs.get(path)) try { fs.write(path, ""); } catch (e) { print("touch: " + e.message); } },
        mkdir: ([p]) => { try { fs.mkdir(fs.normalize(p, cwd)); } catch (e) { print("mkdir: " + e.message); } },
        rm: ([p]) => { try { fs.remove(fs.normalize(p, cwd)); } catch (e) { print("rm: " + e.message); } },
        mv: ([a, b]) => {
          try {
            const from = fs.normalize(a, cwd), to = fs.normalize(b, cwd);
            const node = fs.get(from);
            if (!node) throw new Error("não encontrado");
            const { dir, name } = fs.parent(to);
            if (!dir || dir.type !== "dir") throw new Error("destino inválido");
            const src = fs.parent(from);
            dir.children[name] = node; delete src.dir.children[src.name];
            saveFS(); emit("fs");
          } catch (e) { print("mv: " + e.message); }
        },
        open: ([t]) => {
          if (!t) return print("uso: open <app|arquivo>");
          if (apps[t]) return apps[t].open();
          const path = fs.normalize(t, cwd);
          if (fs.get(path)) return openFile(path);
          print(`open: ${t}: não encontrado. Apps: ${Object.keys(apps).join(", ")}`);
        },
        calc: (args) => { try { print(String(safeCalc(args.join(" ")))); } catch (e) { print("calc: " + e.message); } },
        date: () => print(new Date().toLocaleString("pt-BR")),
        whoami: () => print("usuario"),
        neofetch: () => print(
          "   ▣▣▣▣▣      usuario@vesus\n" +
          "  ▣     ▣     -------------\n" +
          "  ▣  ▣  ▣     SO: VesusOS 1.0 (navegador)\n" +
          "  ▣     ▣     Kernel: JavaScript\n" +
          "   ▣▣▣▣▣      Shell: vsh\n" +
          `              Resolução: ${innerWidth}x${innerHeight}\n` +
          `              Navegador: ${navigator.userAgent.split(" ").pop()}`),
        clear: () => { [...term.querySelectorAll(".line")].forEach((l) => l.remove()); },
        exit: () => close(w.id),
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const raw = input.value.trim();
          print(`${promptEl.textContent} ${raw}`);
          input.value = "";
          if (raw) {
            history.push(raw); hIdx = history.length;
            const [cmd, ...args] = raw.split(/\s+/);
            if (commands[cmd]) commands[cmd](args, raw);
            else print(`${cmd}: comando não encontrado (digite 'help')`);
          }
          setPrompt();
          term.scrollTop = term.scrollHeight;
        } else if (e.key === "ArrowUp") {
          if (hIdx > 0) input.value = history[--hIdx]; e.preventDefault();
        } else if (e.key === "ArrowDown") {
          input.value = hIdx < history.length - 1 ? history[++hIdx] : (hIdx = history.length, ""); e.preventDefault();
        } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); commands.clear(); }
      });

      print("VesusOS Terminal — digite 'help' para ver os comandos.");
      setPrompt();
      body.append(term);
      body.style.background = "#0c0c0c";
      setTimeout(() => input.focus());
    } });
  }

  /* --- Paint --- */
  function Paint() {
    openWindow({ title: "Paint", icon: "🎨", width: 700, height: 500, content(body) {
      const canvas = el("canvas");
      const color = el("input", { type: "color", value: "#1e1e1e" });
      const size = el("input", { type: "range", min: 1, max: 40, value: 4, style: "width:90px" });
      let eraser = false;
      const eraserBtn = el("button", { onclick: () => { eraser = !eraser; eraserBtn.style.background = eraser ? "var(--accent)" : ""; } }, "🧽 Borracha");
      const ctx = canvas.getContext("2d");

      const fit = () => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const snapshot = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        canvas.width = r.width; canvas.height = r.height;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (snapshot) ctx.putImageData(snapshot, 0, 0);
      };
      new ResizeObserver(fit).observe(canvas);

      let drawing = false, last = null;
      canvas.addEventListener("pointerdown", (e) => { drawing = true; last = [e.offsetX, e.offsetY]; canvas.setPointerCapture(e.pointerId); draw(e); });
      canvas.addEventListener("pointermove", (e) => drawing && draw(e));
      canvas.addEventListener("pointerup", () => { drawing = false; });
      function draw(e) {
        ctx.strokeStyle = eraser ? "#fff" : color.value;
        ctx.lineWidth = +size.value; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke();
        last = [e.offsetX, e.offsetY];
      }

      body.append(el("div", { class: "paint" },
        el("div", { class: "toolbar" }, color, size, eraserBtn,
          el("button", { onclick: () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); } }, "🗑 Limpar"),
          el("button", { onclick: () => {
            const name = prompt("Salvar em Imagens como:", fs.uniqueName(HOME + "/Imagens", "desenho", ".png"));
            if (name) try { fs.write(fs.normalize(name, HOME + "/Imagens"), canvas.toDataURL("image/png")); } catch (e) { alert(e.message); }
          } }, "💾 Salvar"),
          el("button", { onclick: () => el("a", { href: canvas.toDataURL("image/png"), download: "desenho.png" }).click() }, "⬇ Baixar"),
        ),
        canvas,
      ));
    } });
  }

  function ImageViewer(path) {
    openWindow({ title: path.split("/").pop(), icon: "🖼️", width: 600, height: 440, content(body) {
      body.style.cssText += "display:flex;align-items:center;justify-content:center;background:#111";
      body.append(el("img", { src: fs.get(path).content, style: "max-width:100%;max-height:100%" }));
    } });
  }

  /* --- Navegador --- */
  function Browser() {
    openWindow({ title: "Navegador", icon: "🌐", width: 800, height: 520, content(body) {
      const frame = el("iframe", { sandbox: "allow-scripts allow-forms allow-same-origin allow-popups", referrerPolicy: "no-referrer" });
      const url = el("input", { type: "text", value: "https://pt.wikipedia.org" });
      const go = () => {
        let u = url.value.trim();
        if (!/^https?:\/\//.test(u)) u = u.includes(".") && !u.includes(" ") ? "https://" + u : "https://duckduckgo.com/html/?q=" + encodeURIComponent(u);
        url.value = u; frame.src = u;
      };
      url.addEventListener("keydown", (e) => e.key === "Enter" && go());
      body.append(el("div", { class: "browser" },
        el("div", { class: "toolbar" }, url, el("button", { onclick: go }, "Ir"),
          el("button", { title: "Abrir em nova aba", onclick: () => window.open(url.value, "_blank", "noopener") }, "↗")),
        frame,
        el("div", { style: "font-size:11px;color:var(--muted);padding:4px 8px" },
          "Alguns sites bloqueiam ser abertos dentro de outra página. Se ficar em branco, use ↗."),
      ));
      go();
    } });
  }

  /* --- Jogo da velha --- */
  function TicTacToe() {
    openWindow({ title: "Jogo da Velha", icon: "❌", width: 320, height: 400, content(body) {
      let board, turn, over;
      const status = el("div");
      const cells = Array.from({ length: 9 }, (_, i) => el("button", { onclick: () => play(i) }));
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const winner = (b) => { for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return b.every(Boolean) ? "empate" : null; };
      const reset = () => { board = Array(9).fill(null); turn = "X"; over = false; render(); };
      const render = () => {
        cells.forEach((c, i) => (c.textContent = board[i] === "X" ? "❌" : board[i] === "O" ? "⭕" : ""));
        const w = winner(board);
        status.textContent = w === "empate" ? "Empate!" : w ? (w === "X" ? "Você venceu! 🎉" : "O computador venceu!") : "Sua vez (❌)";
      };
      const play = (i) => {
        if (over || board[i] || turn !== "X") return;
        board[i] = "X";
        if (winner(board)) { over = true; return render(); }
        // Jogada simples do computador: vencer > bloquear > centro > aleatório
        const free = board.map((v, k) => (v ? null : k)).filter((k) => k !== null);
        const tryMove = (p) => free.find((k) => { const b = [...board]; b[k] = p; return winner(b) === p; });
        let m = tryMove("O") ?? tryMove("X") ?? (board[4] ? undefined : 4);
        if (m === undefined) m = free[Math.floor(Math.random() * free.length)];
        board[m] = "O";
        if (winner(board)) over = true;
        render();
      };
      body.append(el("div", { class: "game" }, status, el("div", { class: "board" }, cells), el("button", { class: "", onclick: reset, style: "padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:#2f3647" }, "Novo jogo")));
      reset();
    } });
  }

  /* --- Configurações --- */
  const wallpapers = [
    "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
    "linear-gradient(135deg, #42275a, #734b6d)",
    "linear-gradient(135deg, #134e5e, #71b280)",
    "linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)",
    "linear-gradient(135deg, #000428, #004e92)",
    "linear-gradient(135deg, #232526, #414345)",
  ];
  const accents = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

  function applySettings() {
    const s = store.get("settings", {});
    document.documentElement.style.setProperty("--wallpaper", s.wallpaper || wallpapers[0]);
    document.documentElement.style.setProperty("--accent", s.accent || accents[0]);
    $(".start-header span:last-child").textContent = s.user || "Usuário";
  }

  function Settings() {
    openWindow({ title: "Configurações", icon: "⚙️", width: 460, height: 420, content(body) {
      const s = store.get("settings", {});
      const update = (patch) => { Object.assign(s, patch); store.set("settings", s); applySettings(); render(); };
      const root = el("div", { class: "settings" });
      const render = () => {
        root.replaceChildren(
          el("div", {}, el("h3", {}, "Papel de parede"),
            el("div", { class: "swatches" }, wallpapers.map((w) =>
              el("button", { class: (s.wallpaper || wallpapers[0]) === w ? "on" : "", style: `background:${w}`, onclick: () => update({ wallpaper: w }) })))),
          el("div", {}, el("h3", {}, "Imagem de fundo (URL)"),
            el("input", { type: "text", placeholder: "https://…/imagem.jpg", onchange: (e) => e.target.value && update({ wallpaper: `url("${e.target.value.replace(/"/g, "")}") center/cover` }) })),
          el("div", {}, el("h3", {}, "Cor de destaque"),
            el("div", { class: "swatches" }, accents.map((c) =>
              el("button", { class: (s.accent || accents[0]) === c ? "on" : "", style: `background:${c};width:40px`, onclick: () => update({ accent: c }) })))),
          el("div", {}, el("h3", {}, "Nome de usuário"),
            el("input", { type: "text", value: s.user || "", placeholder: "Usuário", onchange: (e) => update({ user: e.target.value }) })),
          el("div", {}, el("h3", {}, "Restaurar"),
            el("button", { style: "padding:6px 12px;border-radius:4px;border:1px solid var(--border);background:#5a1d1d", onclick: () => {
              if (confirm("Apagar TODOS os arquivos e configurações?")) {
                fsRoot = defaultFS(); saveFS(); store.set("settings", {}); applySettings(); emit("fs"); Object.keys(s).forEach((k) => delete s[k]); render();
              }
            } }, "Restaurar padrão de fábrica")),
        );
      };
      render();
      body.append(root);
    } });
  }

  function About() {
    openWindow({ title: "Sobre este PC", icon: "ℹ️", width: 400, height: 300, content(body) {
      body.append(el("div", { class: "about" },
        el("div", { class: "big" }, "▣"),
        el("strong", {}, "VesusOS 1.0"), el("br"),
        "Um PC virtual que roda direto no navegador.", el("br"),
        `Tela: ${innerWidth}×${innerHeight}`, el("br"),
        `Núcleos (do seu PC real): ${navigator.hardwareConcurrency || "?"}`, el("br"),
        "Arquivos salvos localmente no navegador.",
      ));
    } });
  }

  /* ---------------- Área de trabalho ---------------- */
  const desktopIcons = ["explorer", "notepad", "terminal", "calc", "paint", "browser", "velha", "settings"];
  const iconsEl = $("#icons");
  for (const key of desktopIcons) {
    const app = apps[key];
    const icon = el("div", { class: "icon", tabIndex: 0,
      ondblclick: () => app.open(),
      onkeydown: (e) => e.key === "Enter" && app.open(),
      onclick: () => {
        iconsEl.querySelectorAll(".selected").forEach((i) => i.classList.remove("selected"));
        icon.classList.add("selected");
      },
    }, el("span", { class: "emoji" }, app.icon), app.name);
    // Toque único abre em telas sensíveis ao toque
    icon.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") app.open(); });
    iconsEl.append(icon);
  }

  $("#desktop").addEventListener("contextmenu", (e) => {
    if (e.target.closest(".window")) return;
    e.preventDefault();
    contextMenu(e.clientX, e.clientY, [
      ["📁 Abrir Arquivos", () => Explorer()],
      ["💻 Abrir Terminal", () => Terminal()],
      ["📝 Novo arquivo de texto", () => newTextFile(HOME)],
      ["🖼️ Personalizar", () => Settings()],
      ["🔄 Atualizar", () => location.reload()],
    ]);
  });
  $("#desktop").addEventListener("pointerdown", (e) => {
    if (e.target === $("#desktop") || e.target === iconsEl) iconsEl.querySelectorAll(".selected").forEach((i) => i.classList.remove("selected"));
  });

  /* ---------------- Menu de contexto ---------------- */
  const ctxEl = $("#context-menu");
  function contextMenu(x, y, items) {
    ctxEl.replaceChildren(...items.map(([label, fn]) => el("button", { onclick: () => { hideCtx(); fn(); } }, label)));
    ctxEl.hidden = false;
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.min(x, innerWidth - r.width - 4) + "px";
    ctxEl.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
  }
  const hideCtx = () => (ctxEl.hidden = true);
  document.addEventListener("pointerdown", (e) => { if (!ctxEl.contains(e.target)) hideCtx(); });

  /* ---------------- Menu iniciar ---------------- */
  const startMenu = $("#start-menu"), startBtn = $("#start-btn");
  $("#start-apps").append(...Object.values(apps).map((a) =>
    el("button", { onclick: () => { toggleStart(false); a.open(); } }, el("span", {}, a.icon), a.name)));
  function toggleStart(force) {
    const show = force ?? startMenu.hidden;
    startMenu.hidden = !show;
    startBtn.classList.toggle("active", show);
  }
  startBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleStart(); });
  document.addEventListener("pointerdown", (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target) && e.target !== startBtn) toggleStart(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Meta" || (e.key === "Escape" && !startMenu.hidden)) toggleStart(e.key === "Meta" ? undefined : false); });

  $("#btn-shutdown").addEventListener("click", () => {
    toggleStart(false);
    for (const id of [...wins.keys()]) close(id);
    document.body.replaceChildren(el("div", { style: "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#000" },
      el("div", { style: "font-size:18px;color:#888" }, "O PC foi desligado."),
      el("button", { style: "padding:10px 20px;border-radius:6px;border:1px solid #444;background:#111", onclick: () => location.reload() }, "⏻ Ligar novamente")));
  });

  /* ---------------- Relógio ---------------- */
  const clock = $("#clock");
  const tick = () => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "\n" + d.toLocaleDateString("pt-BR");
  };
  tick(); setInterval(tick, 10_000);

  /* ---------------- Boot ---------------- */
  applySettings();
  setTimeout(() => $("#boot").classList.add("hide"), 1800);
  setTimeout(() => $("#boot").remove(), 2400);
})();
