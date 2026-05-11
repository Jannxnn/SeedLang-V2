(function () {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const words = ["Web 页面构建", "动态接口联动", "Seed 转译 JS", "运行时性能优化", "AI 原生开发"];
  let wi = 0;

  function typeWriter(element, text, speed) {
    if (!speed) speed = 80;
    let i = 0;
    element.textContent = '';
    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      }
    }
    type();
  }

  setInterval(() => {
    wi = (wi + 1) % words.length;
    const n = q("#dynamicWord");
    if (!n) return;
    n.style.opacity = "0";
    n.style.transform = "translateY(-10px)";
    setTimeout(() => {
      n.textContent = words[wi];
      n.style.opacity = "1";
      n.style.transform = "translateY(0)";
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

  function animateNumber(el, target, duration) {
    if (!duration) duration = 1200;
    const start = 0;
    const startTime = performance.now();
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * easeOut);
      el.textContent = String(current);
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    
    requestAnimationFrame(update);
  }

  const numberObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const target = Number(e.target.getAttribute("data-count") || "0");
        animateNumber(e.target, target);
        numberObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  qa("[data-count]").forEach((el) => numberObserver.observe(el));

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("show");
        e.target.style.animation = "slideIn 0.6s ease-out forwards";
      }
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
      d.style.opacity = String(0.3 + Math.random() * 0.4);
      d.style.width = String(8 + Math.random() * 12) + "px";
      d.style.height = d.style.width;
      box.appendChild(d);
    }
  }

  let mouseX = 0, mouseY = 0;
  let currentX = 0, currentY = 0;
  
  document.addEventListener("pointermove", (ev) => {
    mouseX = (ev.clientX / window.innerWidth - 0.5) * 20;
    mouseY = (ev.clientY / window.innerHeight - 0.5) * 20;
  });

  function animateGlasses() {
    currentX += (mouseX - currentX) * 0.08;
    currentY += (mouseY - currentY) * 0.08;
    
    qa(".glass").forEach((n) => {
      n.style.transform = "translate(" + (currentX * 0.18) + "px," + (currentY * 0.18) + "px)";
    });
    
    requestAnimationFrame(animateGlasses);
  }
  animateGlasses();

  qa(".card").forEach((card) => {
    card.addEventListener("mouseenter", function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.style.setProperty("--mouse-x", x + "px");
      this.style.setProperty("--mouse-y", y + "px");
    });
  });

  qa(".btn").forEach((btn) => {
    btn.addEventListener("click", function(e) {
      const ripple = document.createElement("span");
      ripple.style.cssText = `
        position: absolute;
        background: rgba(255,255,255,0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
      `;
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left = (e.clientX - rect.left - size/2) + "px";
      ripple.style.top = (e.clientY - rect.top - size/2) + "px";
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  const style = document.createElement("style");
  style.textContent = `
    @keyframes ripple {
      to { transform: scale(4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  let lastScrollY = 0;
  const nav = q(".nav");
  
  window.addEventListener("scroll", () => {
    const currentScrollY = window.scrollY;
    if (nav) {
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        nav.style.transform = "translateY(-100%)";
        nav.style.opacity = "0";
      } else {
        nav.style.transform = "translateY(0)";
        nav.style.opacity = "1";
      }
    }
    lastScrollY = currentScrollY;
  }, { passive: true });

  qa('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function(e) {
      const href = this.getAttribute("href");
      if (href && href.length > 1) {
        e.preventDefault();
        const target = q(href);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });

  qa(".code").forEach((code) => {
    code.addEventListener("mouseenter", function() {
      this.style.transform = "scale(1.02)";
    });
    code.addEventListener("mouseleave", function() {
      this.style.transform = "scale(1)";
    });
  });

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (prefersReducedMotion.matches) {
    qa(".orb").forEach((orb) => {
      orb.style.animation = "none";
    });
  }
})();
