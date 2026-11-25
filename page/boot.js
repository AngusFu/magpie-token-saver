(async () => {
  const DEFAULT_PORT = 48766;
  let port = DEFAULT_PORT;
  let service = "";

  try {
    await window.magpie?.ready;
  } catch { /* noop */ }

  try {
    const s = window.magpie?.service;
    if (typeof s === "string" && s.trim()) service = new URL(s, location.href).href;
  } catch { /* noop */ }

  try {
    const o = await window.magpie?.options?.get?.();
    if (o && Number.isFinite(Number(o.port)) && Number(o.port) > 0) port = Number(o.port);
  } catch { /* noop */ }

  const base = (service || `http://127.0.0.1:${port}`).replace(/\/+$/, "");

  setTimeout(() => {
    const said = document.getElementById("said");
    if (!said) return;
    said.textContent = "";
    const p = document.createElement("p");
    p.textContent = `控制台未在 ${base} 运行。请确认插件已启用并重载 Magpie。`;
    said.appendChild(p);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "重试";
    btn.addEventListener("click", () => location.reload());
    said.appendChild(btn);
  }, 8000);

  location.replace(base + "/");
})();
