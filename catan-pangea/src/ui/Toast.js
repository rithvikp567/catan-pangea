/**
 * Short, non-blocking messages ("Someone just took that colour").
 */
import { h } from "./dom.js";

export class Toast {
  constructor(parent = document.body){
    this.el = h("div", { class:"toast", role:"status", "aria-live":"polite", hidden:true });
    parent.append(this.el);
    this.timer = null;
  }

  show(message, { ms = 2600 } = {}){
    this.el.textContent = message;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("is-on"));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.remove("is-on");
      this.timer = setTimeout(() => { this.el.hidden = true; }, 220);
    }, ms);
  }
}
