/**
 * Makes the settings panel a modal sheet on phones (bottom sheet in
 * portrait, side drawer in landscape) while leaving it a plain sidebar on
 * desktop. Which one applies is decided by the same media query the CSS
 * uses, so behaviour and layout can't disagree.
 */
export const DESKTOP_QUERY = "(min-width: 900px) and (min-height: 560px)";

export class Sheet {
  /**
   * @param {HTMLElement} panel
   * @param {HTMLElement} scrim
   * @param {object} p
   * @param {HTMLElement} p.opener   button that toggles the sheet
   * @param {HTMLElement} p.closer   close button inside the sheet
   */
  constructor(panel, scrim, { opener, closer }){
    Object.assign(this, { panel, scrim, opener, isOpen:false });
    this.desktop = matchMedia(DESKTOP_QUERY);

    opener.addEventListener("click", () => this.toggle());
    closer.addEventListener("click", () => this.close());
    scrim.addEventListener("click", () => this.close());
    document.addEventListener("keydown", e => { if(e.key === "Escape" && this.isOpen) this.close(); });
    this.desktop.addEventListener("change", () => { if(this.desktop.matches) this.close(); this.#sync(); });
    this.#sync();
  }

  get isModal(){ return !this.desktop.matches; }

  open(){
    if(!this.isModal) return;
    this.isOpen = true;
    this.#sync();
    this.panel.querySelector("button, input, summary")?.focus({ preventScroll:true });
  }

  close(){
    if(!this.isOpen) return;
    this.isOpen = false;
    this.#sync();
    this.opener.focus({ preventScroll:true });
  }

  toggle(){ this.isOpen ? this.close() : this.open(); }

  #sync(){
    const modal = this.isModal, open = modal && this.isOpen;
    this.panel.classList.toggle("is-open", open);
    /* a closed sheet is off-screen: keep it out of tab order and the a11y tree */
    this.panel.inert = modal && !open;
    if(modal){ this.panel.setAttribute("role", "dialog"); this.panel.setAttribute("aria-modal", String(open)); }
    else { this.panel.removeAttribute("role"); this.panel.removeAttribute("aria-modal"); }
    this.scrim.hidden = !open;
    requestAnimationFrame(() => this.scrim.classList.toggle("is-open", open));
    this.opener.setAttribute("aria-expanded", String(open));
  }
}
