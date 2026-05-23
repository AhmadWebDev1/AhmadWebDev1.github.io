let projectsData = [];
let currentLang = document.documentElement.lang || "de";
let currentTheme = localStorage.getItem("portfolio-theme") || "dark";
let activeFilter = "all";
let emblaApi = null;

function loadProfileAvatar() {
  const avatarImg = document.getElementById("profile-avatar");
  if (!avatarImg) return;

  avatarImg.addEventListener("error", function() {
    avatarImg.src = "https://picsum.photos/id/91/600/600";
  }, { once: true });

  if (avatarImg.complete && avatarImg.naturalHeight === 0) {
    avatarImg.dispatchEvent(new Event("error"));
  }
}

function loadProjectsFromDOM() {
  const cards = document.querySelectorAll(".project-card");
  if (cards.length === 0) return false;

  projectsData = [];
  cards.forEach(card => {
    const id = parseInt(card.getAttribute("data-id"), 10) || 0;
    const category = card.getAttribute("data-category") || "frontend";
    
    const title = {
      en: card.getAttribute("data-title-en") || "",
      ar: card.getAttribute("data-title-ar") || "",
      de: card.getAttribute("data-title-de") || ""
    };

    const description = {
      en: card.getAttribute("data-desc-en") || "",
      ar: card.getAttribute("data-desc-ar") || "",
      de: card.getAttribute("data-desc-de") || ""
    };

    const image = card.getAttribute("data-image") || "";
    const imagesStr = card.getAttribute("data-images") || "";
    const images = imagesStr ? imagesStr.split(",").map(t => t.trim()).filter(t => t !== "") : [];
    
    const tagsStr = card.getAttribute("data-tags") || "";
    const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(t => t !== "") : [];
    
    const demoLink = card.getAttribute("data-demo-link") || "";
    const repoLink = card.getAttribute("data-repo-link") || "";

    // Read project body content from script template tag
    const contentScript = document.getElementById(`project-content-${id}`);
    const bodyContent = contentScript ? contentScript.textContent.trim() : "";

    const longDescription = { en: "", ar: "", de: "" };
    
    // Parse longDescription languages from markdown body if structured
    for (const section of bodyContent.split(/(?=##\s+(?:EN|AR|DE))/i)) {
      const trimmedSection = section.trim();
      if (!trimmedSection) continue;
      const match = trimmedSection.match(/^##\s+(EN|AR|DE)\b([\s\S]*)$/i);
      if (match) {
        longDescription[match[1].toLowerCase()] = match[2].trim();
      }
    }
    
    if (bodyContent && !longDescription.en && !longDescription.ar && !longDescription.de) {
      longDescription.en = bodyContent;
      longDescription.ar = bodyContent;
      longDescription.de = bodyContent;
    }

    projectsData.push({ id, category, title, description, image, images, tags, demoLink, repoLink, longDescription });
  });

  projectsData.sort((a, b) => a.id - b.id);
  return true;
}

function renderProjects() {
  const grid = document.getElementById("projects-grid");
  if (!grid) return;

  grid.innerHTML = "";
  const filtered = activeFilter === "all" ? projectsData : projectsData.filter(p => p.category === activeFilter);
  const activeLang = currentLang;

  // Detect masonry layout from the DOM element class (compiled statically by Jekyll layout)
  const isMasonry = grid.classList.contains("columns-1");

  const titleClass = isMasonry ? "text-xs font-bold text-zinc-900 dark:text-white mb-1.5 leading-snug tracking-tight" : "text-xs font-bold text-zinc-900 dark:text-white mb-1.5 leading-snug tracking-tight line-clamp-2 h-8";
  const descClass = isMasonry ? "text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4" : "text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4 h-9";
  const tagsClass = isMasonry ? "flex flex-wrap gap-1 mb-4" : "flex flex-wrap gap-1 mb-4 h-5 overflow-hidden";

  let detailsTitle = "Details";
  if (activeLang === "ar") detailsTitle = "تفاصيل";
  else if (activeLang === "de") detailsTitle = "Details";

  filtered.forEach((project, idx) => {
    const title = project.title[activeLang] || project.title["de"] || project.title["en"] || "";
    const desc = project.description[activeLang] || project.description["de"] || project.description["en"] || "";
    
    const card = document.createElement("div");
    if (isMasonry) {
      card.className = "group border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950/40 p-4 rounded flex flex-col justify-between transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-700 hover:shadow-lg dark:hover:shadow-zinc-900/50 hover:-translate-y-1 relative overflow-hidden opacity-0 cursor-pointer break-inside-avoid w-full mb-6";
    } else {
      card.className = "group border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950/40 p-4 rounded flex flex-col justify-between transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-700 hover:shadow-lg dark:hover:shadow-zinc-900/50 hover:-translate-y-1 relative overflow-hidden opacity-0 cursor-pointer h-full";
    }

    // Bind click listener that invokes openProjectModal(project.id)
    card.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button") || e.target.closest(".filter-btn")) {
        return;
      }
      openProjectModal(project.id);
    });

    const tagsHTML = project.tags.map(tag =>
      `<span class="px-2 py-0.5 text-[9px] font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-sm border border-zinc-200/40 dark:border-zinc-800/40">${tag}</span>`
    ).join("");

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between text-[9px] font-mono text-zinc-400 dark:text-zinc-500 mb-2">
          <span>[PRJ-0${project.id}]</span>
          <span class="uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-sm">
            ${project.category}
          </span>
        </div>
        <div class="overflow-hidden rounded-sm mb-4 relative aspect-[16/10] bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/40">
          <img src="${project.image}" alt="${title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] filter grayscale hover:grayscale-0 group-hover:grayscale-0">
          <div class="absolute inset-0 bg-black/5 dark:bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
        <h3 class="${titleClass}">${title}</h3>
        <p class="${descClass}">${desc}</p>
      </div>
      <div>
        <div class="${tagsClass}">${tagsHTML}</div>
        <div class="flex items-center justify-between w-full">
          <div class="group/link inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white hover:opacity-80 transition-opacity">
            <span>${detailsTitle}</span>
            <span class="inline-block transition-transform duration-200 ltr:group-hover/link:translate-x-1 rtl:group-hover/link:-translate-x-1">${activeLang === 'ar' ? '←' : '→'}</span>
          </div>
          <div class="flex items-center gap-2 relative z-10">
            ${project.repoLink ? `
              <a href="${project.repoLink}" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="GitHub Repository">
                <i class="fa-brands fa-github text-sm"></i>
              </a>
            ` : ''}
            ${project.demoLink ? `
              <a href="${project.demoLink}" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors" aria-label="Live Demo">
                <i class="fa-regular fa-external-link text-sm"></i>
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    grid.appendChild(card);

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(card, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, delay: idx * 0.08, ease: "power2.out" });
    } else {
      card.classList.remove("opacity-0");
    }
  });
}

function setupEventListeners() {
  const menuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
      mobileMenu.classList.toggle("flex");
    });
    mobileMenu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        mobileMenu.classList.add("hidden");
        mobileMenu.classList.remove("flex");
      });
    });
  }

  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => setTheme(currentTheme === "dark" ? "light" : "dark"));
  }

  const filters = document.querySelectorAll(".filter-btn");
  filters.forEach(btn => {
    btn.addEventListener("click", () => {
      filters.forEach(b => b.classList.remove("bg-zinc-200", "dark:bg-zinc-800", "text-zinc-900", "dark:text-white"));
      filters.forEach(b => b.classList.add("text-zinc-500", "dark:text-zinc-400"));
      btn.classList.add("bg-zinc-200", "dark:bg-zinc-800", "text-zinc-900", "dark:text-white");
      btn.classList.remove("text-zinc-500", "dark:text-zinc-400");
      activeFilter = btn.getAttribute("data-filter");
      renderProjects();
    });
  });

  const modal = document.getElementById("project-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeProjectModal();
    });
  }
}

window.openProjectModal = function(id) {
  const project = projectsData.find(p => p.id === id);
  if (!project) return;

  const modal = document.getElementById("project-modal");
  if (!modal) return;

  const activeLang = currentLang;
  const title = project.title[activeLang] || project.title["de"] || project.title["en"] || "";
  const longDesc = project.longDescription[activeLang] || project.longDescription["de"] || project.longDescription["en"] || "";

  document.getElementById("modal-project-title").textContent = title;
  document.getElementById("modal-project-desc").textContent = longDesc;

  const container = document.getElementById("carousel-container");
  container.innerHTML = "";
  const images = project.images && project.images.length > 0 ? project.images : [project.image];
  images.forEach(imgUrl => {
    const slide = document.createElement("div");
    slide.className = "embla__slide relative aspect-[16/10] bg-zinc-100 dark:bg-zinc-900";
    slide.innerHTML = `<img src="${imgUrl}" alt="${title}" class="w-full h-full object-cover rounded-sm">`;
    container.appendChild(slide);
  });

  const demoBtn = document.getElementById("modal-demo-link");
  const repoBtn = document.getElementById("modal-repo-link");

  if (demoBtn) {
    if (project.demoLink && project.demoLink.trim() !== "") {
      demoBtn.href = project.demoLink;
      demoBtn.classList.remove("hidden");
    } else {
      demoBtn.classList.add("hidden");
    }
  }

  if (repoBtn) {
    if (project.repoLink && project.repoLink.trim() !== "") {
      repoBtn.href = project.repoLink;
      repoBtn.classList.remove("hidden");
    } else {
      repoBtn.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";

  const emblaNode = document.getElementById("embla-viewport");
  if (typeof EmblaCarousel !== 'undefined' && emblaNode) {
    emblaApi = EmblaCarousel(emblaNode, { loop: true });
    const prevBtn = document.getElementById("carousel-prev");
    const nextBtn = document.getElementById("carousel-next");
    if (prevBtn && nextBtn) {
      prevBtn.onclick = activeLang === "ar" ? () => emblaApi.scrollNext() : () => emblaApi.scrollPrev();
      nextBtn.onclick = activeLang === "ar" ? () => emblaApi.scrollPrev() : () => emblaApi.scrollNext();
    }
  }

  if (typeof gsap !== 'undefined') {
    gsap.fromTo("#modal-box", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
  }
};

window.closeProjectModal = function() {
  const modal = document.getElementById("project-modal");
  if (!modal) return;

  if (emblaApi) { emblaApi.destroy(); emblaApi = null; }

  if (typeof gsap !== 'undefined') {
    gsap.to("#modal-box", {
      opacity: 0, y: 10, duration: 0.2,
      onComplete: () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        document.body.style.overflow = "";
      }
    });
  } else {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.style.overflow = "";
  }
};

function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("portfolio-theme", theme);
  const html = document.documentElement;
  const sunIcon = document.getElementById("theme-sun");
  const moonIcon = document.getElementById("theme-moon");

  if (theme === "dark") {
    html.classList.add("dark");
    if (sunIcon && moonIcon) { sunIcon.classList.remove("hidden"); moonIcon.classList.add("hidden"); }
  } else {
    html.classList.remove("dark");
    if (sunIcon && moonIcon) { sunIcon.classList.add("hidden"); moonIcon.classList.remove("hidden"); }
  }
}

function initMouseFollower() {
  if (window.innerWidth <= 1024) return;

  const follower = document.createElement("div");
  follower.id = "mouse-follower";
  follower.className = "fixed top-0 left-0 w-5 h-5 border border-zinc-400 dark:border-zinc-600 pointer-events-none z-50 rounded transition-opacity duration-300 opacity-0";
  document.body.appendChild(follower);

  let mouseX = 0, mouseY = 0;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    follower.classList.remove("opacity-0");
  });

  if (typeof gsap !== 'undefined') {
    gsap.ticker.add(() => {
      gsap.to(follower, { x: mouseX - 10, y: mouseY - 10, duration: 0.4, ease: "power2.out" });
    });

    document.querySelectorAll("a, button, input, textarea, .filter-btn, [role='button']").forEach(el => {
      el.addEventListener("mouseenter", () => {
        gsap.to(follower, {
          scale: 1.25, rotation: 45,
          backgroundColor: "rgba(120, 120, 120, 0.08)",
          borderColor: currentTheme === "dark" ? "#e4e4e7" : "#18181b",
          duration: 0.25, ease: "power1.out"
        });
      });
      el.addEventListener("mouseleave", () => {
        gsap.to(follower, {
          scale: 1.0, rotation: 0,
          backgroundColor: "transparent",
          borderColor: currentTheme === "dark" ? "#52525b" : "#a1a1aa",
          duration: 0.25, ease: "power1.out"
        });
      });
    });
  }
}

const skillCategories = {
  frontend: {
    "html5": "Advanced",
    "css3": "Advanced",
    "tailwind_css": "Fluent",
    "javascript": "ES6 / Asynchronous",
    "react_js": "Hooks / Context / SPA"
  },
  backend: {
    "node_js": "Runtime Environment",
    "express_js": "REST APIs / Middleware",
    "rest_api": "Integration & Design"
  },
  tools: {
    "git_github": "Version Control",
    "gsap": "High-Performance Motion",
    "aos": "Scroll-Triggered Reveals",
    "embla_carousel": "Custom Slider Systems"
  }
};

window.switchSkillTab = function(category) {
  ["frontend", "backend", "tools"].forEach(tab => {
    const tabBtn = document.getElementById(`tab-${tab}`);
    if (tabBtn) {
      if (tab === category) {
        tabBtn.classList.add("bg-white", "dark:bg-zinc-950", "text-zinc-800", "dark:text-zinc-200", "font-bold", "border-b-transparent");
        tabBtn.classList.remove("text-zinc-400", "dark:text-zinc-500");
      } else {
        tabBtn.classList.remove("bg-white", "dark:bg-zinc-950", "text-zinc-800", "dark:text-zinc-200", "font-bold", "border-b-transparent");
        tabBtn.classList.add("text-zinc-400", "dark:text-zinc-500");
      }
    }
  });

  const contentDiv = document.getElementById("skills-code-content");
  if (!contentDiv) return;

  const data = skillCategories[category];
  let html = `<span class="syntax-punct">{</span><br>`;
  const entries = Object.entries(data);
  entries.forEach(([key, val], idx) => {
    const isLast = idx === entries.length - 1;
    html += `&nbsp;&nbsp;<span class="syntax-key">"${key}"</span><span class="syntax-punct">:</span> <span class="syntax-val">"${val}"</span>${isLast ? "" : `<span class="syntax-punct">,</span>`}<br>`;
  });
  html += `<span class="syntax-punct">}</span>`;
  contentDiv.innerHTML = html;
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("projects-grid")) {
    loadProjectsFromDOM();
    renderProjects();
  }

  setTheme(currentTheme);

  if (document.getElementById("profile-avatar")) {
    loadProfileAvatar();
  }

  if (document.getElementById("skills-code-content")) {
    switchSkillTab("frontend");
  }

  setupEventListeners();

  if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, once: true, offset: 100 });
  }

  initMouseFollower();
});
