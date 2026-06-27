const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".site-nav");
const config = window.ONCLINIC_CONFIG || {};

menuButton?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

if (config.contactEmail) {
  const subject = encodeURIComponent(config.reservationSubject || "オンライン診療予約");

  document.querySelectorAll("[data-config-reservation]").forEach((link) => {
    if (config.lineOfficialUrl) {
      link.href = config.lineOfficialUrl;
      link.target = "_blank";
      link.rel = "noopener";
    } else {
      link.href = `mailto:${config.contactEmail}?subject=${subject}`;
    }
  });

  document.querySelectorAll("[data-config-contact-form]").forEach((form) => {
    form.action = `mailto:${config.contactEmail}`;
  });
}

const noteNewsRoot = document.querySelector("[data-note-news]");

if (noteNewsRoot && config.noteNewsJsonUrl) {
  fetch(config.noteNewsJsonUrl, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((items) => {
      if (!Array.isArray(items) || items.length === 0) return;

      noteNewsRoot.innerHTML = items.slice(0, 5).map((item) => {
        const date = item.date || "";
        const displayDate = date.replaceAll("-", ".");
        const title = escapeHtml(item.title || "note更新");
        const url = safeExternalUrl(item.url);

        return `
          <article>
            <time datetime="${date}">${displayDate}</time>
            <p><strong>note</strong><br><a href="${url}" target="_blank" rel="noopener">${title}</a></p>
          </article>
        `;
      }).join("");
    })
    .catch(() => {});
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}
