/**
 * The settings form. Primary choices up front; coastline, optimiser and
 * seed replay tucked under "Advanced". Emits patches — it never owns
 * state, so App stays the single source of truth.
 */
import { h } from "./dom.js";
import { SegmentedControl, Stepper, field } from "./controls.js";
import { PLAYER_COUNTS, PROFILES, SHIP_RULES, COASTLINES, QUALITIES } from "../app/Settings.js";
import { MIN_TILES, Smax } from "../engine/index.js";

export class SettingsPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} p
   * @param {import("../app/Settings.js").Settings} p.settings
   * @param {(patch:object) => void} p.onChange
   * @param {(seed:string) => void} p.onReplaySeed
   */
  constructor(root, { settings, onChange, onReplaySeed }){
    this.players = new SegmentedControl({
      label:"Players", value:settings.players,
      options:PLAYER_COUNTS.map(n => ({ value:n, label:String(n) })),
      onChange:players => onChange({ players }),
    });
    this.tiles = new Stepper({
      label:"Land tiles", value:settings.tiles, min:MIN_TILES, max:settings.generator.maxTiles,
      onChange:tiles => onChange({ tiles }),
    });
    this.profile = new SegmentedControl({
      label:"Game", value:settings.profile, options:PROFILES,
      onChange:profile => onChange({ profile }),
    });
    this.shipRule = new SegmentedControl({
      label:"Ship to port", value:settings.shipRule, options:SHIP_RULES,
      onChange:shipRule => onChange({ shipRule }),
    });
    this.coastline = new SegmentedControl({
      label:"Coastline", value:settings.coastline, options:COASTLINES,
      onChange:coastline => onChange({ coastline }),
    });
    this.quality = new SegmentedControl({
      label:"Optimiser", value:settings.quality, options:QUALITIES,
      onChange:quality => onChange({ quality }),
    });

    this.coastHint = h("p", { class:"field-hint" });
    this.shipField = field("Ship to port", this.shipRule.el,
      h("p", { class:"field-hint" }, "Flat: any ship reaches any port. Per hop: water distance matters."));

    const seedInput = h("input", {
      type:"text", inputmode:"text", autocomplete:"off", autocapitalize:"off", spellcheck:"false",
      placeholder:"e.g. cinder-4821", "aria-label":"Seed to replay", enterkeyhint:"go",
    });
    const replay = () => { const v = seedInput.value.trim(); if(v) onReplaySeed(v); };
    seedInput.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); replay(); } });

    root.replaceChildren(
      h("div", { class:"group" },
        field("Players", this.players.el),
        field("Land tiles", this.tiles.el, null, { inline:true }),
        field("Game", this.profile.el),
        this.shipField),
      h("details", { class:"advanced" },
        h("summary", {}, "Advanced"),
        h("div", { class:"group" },
          field("Coastline", this.coastline.el, this.coastHint),
          field("Optimiser", this.quality.el,
            h("p", { class:"field-hint" }, "Thorough balances a little better but takes longer on a phone.")),
          field("Replay a seed",
            h("div", { class:"seed-row" }, seedInput, h("button", { type:"button", class:"btn", onClick:replay }, "Replay")),
            h("p", { class:"field-hint" }, "Same seed + same settings = the identical board.")))),
    );
    this.sync(settings);
  }

  /** Reflect settings into the controls. */
  sync(settings){
    this.players.set(settings.players);
    this.tiles.setBounds(MIN_TILES, settings.generator.maxTiles);
    this.tiles.set(settings.tiles);
    this.profile.set(settings.profile);
    this.shipRule.set(settings.shipRule);
    this.coastline.set(settings.coastline);
    this.quality.set(settings.quality);
    this.shipField.hidden = !settings.generator.usesShipRule;

    const gen = settings.generator, A = settings.tiles;
    const floor = gen.effectiveFloor(settings.compactness);
    const S = Math.round(Smax(A) * floor);
    const adjusted = Math.abs(floor - settings.compactness) > 1e-9;
    this.coastHint.textContent =
      `Aims for S ≥ ${S} of ${Smax(A)} — at least ${S - A + 1} three-resource spots.` +
      (adjusted ? ` ${gen.name} aims ${floor.toFixed(2)} (0.05 lower, never under 0.80).` : "");
  }
}
