# BooruTagger

Local Tauri app for tagging LoRA dataset images. Sidecar files are `image.ext` plus `image.txt` of comma-separated booru tags. The product is tags only.

`design/` holds old HTML mocks. The live style is `src/App.css`. Do not restyle the app to match a mock.

## Writing code

Apply DRY, KISS, YAGNI, and SOLID to every change.

- **DRY.** One function for a rule that already exists. Tag identity goes through `normTag` and `parseTags`. Filter presets, folder memory, and config share the same tag cleaning.
- **KISS.** The smallest change that does the job. Prefer a prop and an existing control over a new component, mode, or dependency.
- **YAGNI.** Do not add settings, counts, or abstractions for a case nobody asked for. Preset rows do not count matching images.
- **SOLID.** Each module owns one reason to change. UI calls the API; Rust checks paths. Extend a command or component instead of branching a new copy. Depend on the existing types in `settings.ts` and `tags.ts`.

Match the surrounding file. Do not refactor unrelated code.

## Comments

Prefer one line. Two lines is the maximum.

If an explanation needs more than that, put it in `docs/` and leave the code without the essay. Do not restate what the code already says.

## UI style

Fluent 2 Wine, dark only. No theme picker. No letter icons in boxes. Reuse the classes and tokens in `src/App.css`. Do not add a second palette, radius, or font.

### Tokens

| Token | Use |
| --- | --- |
| `--bg-3` | Window, title bar, left pane |
| `--bg-2` | Gallery, inputs, chips |
| `--bg-1` | Dialogs, menus |
| `--bg-hover` | Hover on ghost controls |
| `--fg-1` / `--fg-2` / `--fg-3` | Primary, secondary, quiet text |
| `--stroke` / `--stroke-2` | Control borders, then hairline splits |
| `--brand` | Selected text, slider, focus |
| `--brand-subtle` | Selected fill |
| `--brand-strong` | Primary filled action, used rarely |
| `--warning` | Delete and remove actions |
| `--sans` | UI copy, 14px, line-height 1.4 |
| `--mono` | Tags, paths, counts, field values |
| `--radius` | 4px on controls, menus, and dialogs |
| `--titlebar` | 32px |

### Chrome

- Custom title bar. Drag on `[data-tauri-drag-region]`. Double-click toggles maximize.
- Minimize, maximize, and close stay clickable above every popup. The scrim starts at `--titlebar` and does not cover the bar.
- Open folder and Settings are disabled while a popup is open. They look disabled with the shared `button:disabled` opacity.
- Window edge resize stays available.
- Popups are non-modal dialogs plus `.scrim`. Do not use `showModal()`.
- Settings is `80vw` by `80vh`, centered. Smaller dialogs stay content-sized. Zoom fills the area under the title bar.
- Escape closes the top popup and does not clear the gallery selection.
- The native context menu never appears. A custom `.menu` opens only on a target that has actions.

### Layout

Three columns when a folder is open: working set `212px`, gallery, caption sheet `372px`. The right pane uses `scrollbar-gutter: stable`.

New controls go in the pane that already owns that job. Switching a label into an editor keeps the same box, padding, and row height. Edited tag filters keep that preset highlighted. A compact row shows Save, which updates it, and Save as new, which asks for a name. With no preset selected, only Save is shown, and it creates a new preset.

Section labels are `.kicker`. Splits are `.filters .split` or `border-bottom: 1px solid var(--stroke-2)`.

### Controls

- Ghost actions use `.preset`, `.quiet`, or `.icon-btn`: transparent, 1px transparent border, `--fg-2`, hover `--bg-hover`.
- Selected state is `aria-pressed="true"`: fill `--brand-subtle`, text `--brand`.
- Title-bar icon buttons are 28px, borderless. Window buttons are `.win-btn`.
- Text fields: `--bg-2`, 1px `--stroke`, `--mono` at 12px, placeholder in `--sans`.
- Counts from 0 to 20 are sliders, with the number beside the label. 0 hides that list.
- Danbooru `tag_(name)` is stored as `tag \(name\)` and shown as `tag (name)`. Other underscores stay, including trigger words.
- Chips and filter chips use the existing chip styles. Do not invent a new pill.
- Quiet lists do not show a count unless the row is All images or Untagged.

### Copy

Short labels. “Has tag”, “Without tag”, “Untagged”, “Selected image”. Do not say “Missing tag” or “1 image”.
