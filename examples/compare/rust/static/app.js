(function () {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const words = ["Web 页面构建", "动态接口联动", "Seed 转译 JS", "运行时性能优化"];
  let wi = 0;

  setInterval(() => {
    wi = (wi + 1) % words.length;
    const n = q("#dynamicWord");
    if (!n) return;
    n.style.opacity = "0";
    setTimeout(() => {
      n.textContent = words[wi];
      n.style.opacity = "1";
    }, 220);
  }, 2600);

  function tick() {
    const d = new Date();
    const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
    const n = q("#liveClock");
    if (n) n.textContent = t;
  }

  tick();
  setInterval(tick, 1000);

  qa("[data-count]").forEach((el) => {
    const target = Number(el.getAttribute("data-count") || "0");
    let cur = 0;
    const step = Math.max(1, Math.floor(target / 46));
    const timer = setInterval(() => {
      cur += step;
      if (cur >= target) {
        cur = target;
        clearInterval(timer);
      }
      el.textContent = String(cur);
    }, 26);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("show");
    });
  }, { threshold: 0.16 });
  qa(".reveal").forEach((n) => io.observe(n));

  const box = q("#orbs");
  if (box) {
    for (let i = 0; i < 24; i += 1) {
      const d = document.createElement("span");
      d.className = "orb";
      d.style.left = String(Math.random() * 100) + "vw";
      d.style.top = String(50 + Math.random() * 70) + "vh";
      d.style.animationDelay = String(Math.random() * 10) + "s";
      d.style.animationDuration = String(10 + Math.random() * 10) + "s";
      box.appendChild(d);
    }
  }

  document.addEventListener("pointermove", (ev) => {
    const x = (ev.clientX / window.innerWidth - 0.5) * 20;
    const y = (ev.clientY / window.innerHeight - 0.5) * 20;
    qa(".glass").forEach((n) => {
      n.style.transform = "translate(" + (x * 0.18) + "px," + (y * 0.18) + "px)";
    });
  });
})();