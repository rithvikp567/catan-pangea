/**
 * Season wins: each profile's wins for a calendar year. First place wears
 * a crown and everyone else gets a turd (ui/badges.js) — once anyone has
 * won that season.
 *
 * Under the standings, the same width, a calendar — one month at a time,
 * swiped sideways (or ‹ ›, under it) to other months: each day shows who
 * won that day; tap the day for everyone's points at that win (a pop-up
 * that fades in and out; × or a tap outside it closes it). The music is
 * put away while this screen is up (App).
 */
import { h } from "../dom.js";
import { crown, turd } from "../badges.js";
import { Screen } from "./Screen.js";
import { seasonOf } from "../../game/rules.js";
import { selectField, icon, inkOn, ICONS } from "./widgets.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];   /* Sunday first */
const SWIPE_PX = 50;
const CHIPS = 2;                        /* winners shown in a day; more read "+1" */
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Months as one number (year × 12 + month), so ± 1 crosses years. */
const monthOf = d => d.getFullYear() * 12 + d.getMonth();
const yearOfMonth = m => Math.floor(m / 12);
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const fmt = {
  month:new Intl.DateTimeFormat(undefined, { month:"long", year:"numeric" }),
  day:new Intl.DateTimeFormat(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" }),
  time:new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }),
};

export class WinsScreen extends Screen {
  constructor(deps){ super("wins", "Season wins", deps); }

  build(){
    this.season = seasonOf(Date.now());
    this.month = monthOf(new Date());
    this.history = [];
    this.calKey = null;

    this.select = h("select", { class:"season-select", "aria-label":"Season", onChange:e => this.#pickSeason(Number(e.target.value)) });
    this.list = h("ol", { class:"wins-list" });
    const standings = h("section", { class:"card wins-card" },
      h("div", { class:"card-title-row" }, h("h2", { class:"card-title" }, "Standings"), selectField(this.select)), this.list);

    /* the calendar: weekday names, the month's days, then ‹ month › */
    this.calView = h("div", { class:"cal-view" });
    this.calLabel = h("span", { class:"cal-label", "aria-live":"polite" });
    this.prevBtn = h("button", { type:"button", class:"icon-btn cal-nav", "aria-label":"Previous month", onClick:() => this.#go(-1) });
    this.prevBtn.innerHTML = ICONS.chevronLeft;     /* static, trusted markup */
    this.nextBtn = h("button", { type:"button", class:"icon-btn cal-nav", "aria-label":"Next month", onClick:() => this.#go(1) });
    this.nextBtn.innerHTML = ICONS.chevronRight;
    const calendar = h("section", { class:"card cal-card" },
      h("div", { class:"card-title-row" }, h("h2", { class:"card-title" }, "Calendar")),
      h("div", { class:"cal-weekdays", "aria-hidden":"true" }, WEEKDAYS.map(d => h("span", {}, d.slice(0, 1)))),
      this.calView,
      h("div", { class:"cal-foot" }, this.prevBtn, this.calLabel, this.nextBtn));
    this.wireSwipe(this.calView);

    /* the day's pop-up: everyone's points at each win that day */
    this.popTitle = h("h2", { class:"wins-pop-title", id:"winsPopTitle" });
    this.popBody = h("div", { class:"wins-pop-body" });
    this.popClose = h("button", { type:"button", class:"icon-btn", "aria-label":"Close", onClick:() => this.closeDay() });
    this.popClose.innerHTML = ICONS.close;
    this.pop = h("div", { class:"wins-pop", hidden:true, role:"dialog", "aria-modal":"true", "aria-labelledby":"winsPopTitle",
      onClick:e => { if(e.target === this.pop) this.closeDay(); } },
      h("div", { class:"wins-pop-card" }, h("header", { class:"wins-pop-head" }, this.popTitle, this.popClose), this.popBody));
    this.pop.addEventListener("keydown", e => { if(e.key === "Escape"){ e.stopPropagation(); this.closeDay(); } });
    document.body.append(this.pop);

    this.body.append(standings, calendar);
  }

  /* opened from the top bar; back returns where you were */
  onBack(){ this.router.back(); }

  hide(opts){ this.closeDay(true); super.hide(opts); }

  render(state){
    if(!state) return;
    const seasons = state.seasons();
    if(!seasons.includes(this.season)) this.season = seasons[0];
    this.select.replaceChildren(...seasons.map(y => h("option", { value:y, selected:y === this.season }, `${y} season`)));
    this.history = state.winHistory();
    this.#renderStandings(state);
    this.#renderCalendar();
  }

  #renderStandings(state){
    const rows = state.winsFor(this.season);
    const meId = this.game.me?.id;
    const badges = rows.some(r => r.leader);
    /* unchanged standings aren't redrawn, so the badges' animations run on undisturbed */
    const key = JSON.stringify([this.season, meId, rows.map(r => [r.profile.id, r.profile.name, r.wins, r.leader])]);
    if(key === this.listKey) return;
    this.listKey = key;
    this.list.toggleAttribute("data-badges", badges);
    this.list.replaceChildren(...rows.map((r, i) =>
      h("li", { class:"wins-row", "data-me":String(r.profile.id === meId) },
        h("span", { class:"wins-rank" }, String(i + 1)),
        badges ? (r.leader ? crown() : turd()) : null,
        h("span", { class:"wins-name" }, r.profile.name),
        h("span", { class:"wins-count" }, String(r.wins), h("small", {}, r.wins === 1 ? " win" : " wins")))));
    if(!rows.length) this.list.append(h("li", { class:"empty" }, "No players yet."));
  }

  /* ---------- the calendar ---------- */

  /** From the first month with a win (or this January) to this month. */
  get #range(){
    const now = new Date(), first = this.history[0];
    const lo = Math.min(first ? monthOf(new Date(first.at)) : Infinity, now.getFullYear() * 12);
    return { lo, hi:monthOf(now) };
  }

  /** The season picked: the calendar goes to its last month (this month, for this season). */
  #pickSeason(season){
    this.season = season;
    const { lo, hi } = this.#range;
    this.month = Math.max(lo, Math.min(hi, season * 12 + 11));
    this.render(this.game.state);
  }

  /** A month back (−1) or on (+1); into another year, the standings follow that season. */
  #go(delta){
    const { lo, hi } = this.#range, next = Math.max(lo, Math.min(hi, this.month + delta));
    if(next === this.month){ this.#nudge(delta); return; }
    this.month = next;
    const year = yearOfMonth(next), state = this.game.state;
    if(year !== this.season && state?.seasons().includes(year)){ this.season = year; this.render(state); }
    this.#renderCalendar(delta);
  }

  /** Nowhere further to go: a little bump that way. */
  #nudge(delta){
    if(reducedMotion()) return;
    this.calView.firstChild?.animate([{ transform:"none" }, { transform:`translateX(${-delta * 10}px)` }, { transform:"none" }], { duration:220, easing:"ease-out" });
  }

  #renderCalendar(dir = 0){
    const { lo, hi } = this.#range;
    this.month = Math.max(lo, Math.min(hi, this.month));
    const y = yearOfMonth(this.month), m = this.month % 12;
    const byDay = new Map();
    for(const w of this.history){
      const d = new Date(w.at);
      if(d.getFullYear() !== y || d.getMonth() !== m) continue;
      const k = dayKey(d);
      if(!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(w);
    }
    const today = dayKey(new Date());
    const key = JSON.stringify([this.month, today, [...byDay].map(([k, ws]) => [k, ws.map(w => [w.id, w.profile.name, w.colorHex, w.scores.map(s => [s.profile.name, s.vp])])])]);
    this.prevBtn.disabled = this.month <= lo;
    this.nextBtn.disabled = this.month >= hi;
    const label = fmt.month.format(new Date(y, m, 1));
    this.calLabel.textContent = label;
    if(key === this.calKey && !dir) return;
    this.calKey = key;
    this.byDay = byDay;

    const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for(let i = 0; i < lead; i++) cells.push(h("span", { class:"cal-day is-blank", "aria-hidden":"true" }));
    for(let d = 1; d <= days; d++){
      const date = new Date(y, m, d), k = dayKey(date), wins = byDay.get(k) ?? [];
      const attrs = { class:"cal-day", "data-today":String(k === today), "data-wins":String(wins.length) };
      const num = h("span", { class:"cal-date" }, String(d));
      if(!wins.length){ cells.push(h("span", attrs, num)); continue; }
      const names = wins.map(w => w.profile.name);
      const chips = wins.slice(0, wins.length > CHIPS ? CHIPS - 1 : CHIPS).map(w => {
        const c = w.colorHex;
        return h("span", { class:"cal-win", style:c ? `--c:${c};--c-ink:${inkOn(c)}` : null, "data-colored":String(!!c) }, w.profile.name);
      });
      if(wins.length > CHIPS) chips.push(h("span", { class:"cal-win is-more" }, `+${wins.length - CHIPS + 1}`));
      cells.push(h("button", { ...attrs, type:"button",
        "aria-label":`${fmt.day.format(date)}: ${names.join(", ")} won${wins.length > 1 ? ` (${wins.length} games)` : ""}. Show the points.`,
        onClick:e => this.openDay(date, wins, e.currentTarget) }, num, h("span", { class:"cal-wins" }, chips)));
    }
    const grid = h("div", { class:"cal-grid", role:"group", "aria-label":label }, cells);
    this.calView.replaceChildren(grid);
    if(dir && !reducedMotion()){
      grid.animate([{ transform:`translateX(${dir * 36}px)`, opacity:0 }, { transform:"none", opacity:1 }],
        { duration:240, easing:"cubic-bezier(.2,.8,.2,1)" });
    }
  }

  /** Swipe the calendar sideways for the next / previous month; it follows the finger a little. */
  wireSwipe(zone){                    /* not #private: build() runs inside the base constructor */
    let g = null;
    zone.addEventListener("pointerdown", e => {
      if(e.button) return;
      g = { id:e.pointerId, x:e.clientX, y:e.clientY, dir:null };
    });
    zone.addEventListener("pointermove", e => {
      if(!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if(!g.dir && Math.hypot(dx, dy) > 10){
        g.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if(g.dir === "x") try{ zone.setPointerCapture(e.pointerId); }catch{}
      }
      if(g.dir === "x" && zone.firstChild) zone.firstChild.style.transform = `translateX(${dx * .45}px)`;
    });
    const end = e => {
      if(!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, swiped = g.dir === "x";
      g = null;
      if(zone.firstChild) zone.firstChild.style.transform = "";
      if(!swiped) return;
      this.swallowClick = true;                    /* the tap that ends a swipe doesn't open a day */
      setTimeout(() => { this.swallowClick = false; }, 0);
      if(Math.abs(dx) >= SWIPE_PX) this.#go(dx < 0 ? 1 : -1);
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", () => { g = null; if(zone.firstChild) zone.firstChild.style.transform = ""; });
    zone.addEventListener("click", e => { if(this.swallowClick){ e.stopPropagation(); e.preventDefault(); } }, true);
  }

  /* ---------- the day's pop-up ---------- */

  /** Everyone's points at each win that day; fades in. */
  openDay(date, wins, from = null){
    this.popFrom = from;
    this.popTitle.textContent = fmt.day.format(date);
    this.popBody.replaceChildren(...wins.map(w => this.#game(w, wins.length > 1)));
    clearTimeout(this.popTimer);
    this.pop.hidden = false;
    void this.pop.offsetWidth;                     /* start the fade from transparent */
    this.pop.dataset.open = "";
    this.popClose.focus({ preventScroll:true });
  }

  /** Fades out (× , a tap outside it, Esc); `now` skips the fade (the screen is going). */
  closeDay(now = false){
    if(this.pop.hidden) return;
    delete this.pop.dataset.open;
    clearTimeout(this.popTimer);
    const done = () => { this.pop.hidden = true; };
    if(now || reducedMotion()) done(); else this.popTimer = setTimeout(done, 220);
    if(!now) this.popFrom?.focus?.({ preventScroll:true });
  }

  #game(w, several){
    const head = h("p", { class:"wins-pop-game" },
      icon(ICONS.trophy, "wins-pop-trophy"),
      h("b", {}, w.profile.name), " won",
      several || w.source === "game" ? h("span", { class:"wins-pop-time" }, ` · ${fmt.time.format(new Date(w.at))}`) : null);
    if(!w.scores.length){
      return h("section", { class:"wins-pop-entry" }, head, h("p", { class:"empty" },
        w.source === "admin" ? "Added by an admin — no points to show." : "Points weren't saved for this win (it's from before the calendar)."));
    }
    return h("section", { class:"wins-pop-entry" }, head,
      h("ol", { class:"wins-pop-scores" }, w.scores.map(sc => h("li", { "data-winner":String(sc.winner) },
        h("span", { class:"seat-dot", style:sc.colorHex ? `--c:${sc.colorHex}` : "--c:var(--line)" }),
        h("span", { class:"wins-pop-name" }, sc.profile.name, sc.winner ? h("small", {}, " winner") : null),
        h("span", { class:"wins-pop-vp" }, String(sc.vp), h("small", {}, " VP"))))));
  }
}
