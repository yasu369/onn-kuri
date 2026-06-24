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
    link.href = `mailto:${config.contactEmail}?subject=${subject}`;
  });

  document.querySelectorAll("[data-config-contact-form]").forEach((form) => {
    form.action = `mailto:${config.contactEmail}`;
  });
}
