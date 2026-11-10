# Interactive Video design system

This is the shared look of Interactive Video's user interface, starting with the **side panels**: the drawers
that open beside the video (`.iv-sidebar`), such as Playlist, Transcript, Reaction, Resources, Concept and Tasks.
Follow it when you build or change a panel, so every panel looks and behaves the same.

The CSS lives in `styles.css`, in the section "Design system: side panels". The shared markup is the
`mod_interactivevideo/sidepanel_head` template.

Interactive Video and its plugins support Moodle 4.0 to 5.x, so everything here works on **Bootstrap 4 and
Bootstrap 5**. See [Bootstrap 4 and 5](#bootstrap-4-and-5).

## Tokens

Panels get their colours and sizes from CSS custom properties defined on `.iv-sidebar`. Use the tokens, not
hard-coded colours, so dark mode works without extra rules.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--iv-panel-bg` | `#fff` | `rgba(0,0,0,.95)` | Panel background |
| `--iv-panel-fg` | `#1d2125` | `#fff` | Text and icons |
| `--iv-panel-muted` | `var(--ivgray)` | `rgba(255,255,255,.6)` | Meta text, placeholders, search icon |
| `--iv-panel-border` | `#dee2e6` | `rgba(255,255,255,.12)` | The divider under the head |
| `--iv-panel-hover` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.1)` | Hover and focus tint of ghost buttons |
| `--iv-panel-control` | `var(--ivlight)` | `var(--ivdark)` | Fill of search, select, segments, badges, progress track |
| `--iv-panel-accent` | `var(--ivprimary)` | `#8ec5ff` | Pressed toggles, active segment, focus ring |
| `--iv-panel-on-accent` | `#fff` | `#000` | Text on the accent |
| `--iv-panel-pad-x` | `1rem` | | Horizontal padding of the head |
| `--iv-panel-header-h` | `52px` | | Minimum height of the header row |
| `--iv-panel-gap` | `6px` | | Gap between head items |

The dark values apply in two cases:

* `.iv-sidebar.darkmode`: Interactive Video adds `darkmode` to panels in distraction-free mode.
* `[data-bs-theme="dark"]`: the theme is in dark mode (Bootstrap 5.3 themes).

## Anatomy

```
┌───────────────────────────────────────────────┐ .iv-sidebar.iv-panel
│ .iv-panel-head                                │
│ ┌───────────────────────────────────────────┐ │
│ │ (i) Title…            meta  [act]  [ X ]  │ │ .iv-panel-header (52px)
│ └───────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────┐ │
│ │ ( 🔍 Search …            )  [tog] [tog]   │ │ .iv-panel-toolbar (optional)
│ └───────────────────────────────────────────┘ │
├───────────────────────────────────────────────┤ one divider
│ .iv-panel-body                                │
│ scrolls on its own                            │
└───────────────────────────────────────────────┘
```

* **Header** (`.iv-panel-header`): the leading icon and title, then optional meta, then optional action
  buttons, then **always the close button last**.
* **Toolbar** (`.iv-panel-toolbar`): optional, one row. It holds a search, a select, a segment, ghost toggles
  or a progress bar.
* **Body** (`.iv-panel-body`): fills the rest of the panel and scrolls. Style its content as you like.

`.iv-panel-head` draws the only divider. Don't add another border or background to the header or toolbar.

## Components

### Title

```html
<h5 class="iv-panel-title" id="myplugin-heading">
    <i class="bi bi-lightbulb" aria-hidden="true"></i>
    <span>Concept</span>
</h5>
```

The title truncates with an ellipsis. Use the item's title when the panel belongs to an interaction, and the
plugin name otherwise.

### Meta and badge

```html
<span class="iv-panel-meta">3 entries</span>
<span class="iv-panel-badge">20 XP</span>
<span class="iv-panel-badge iv-panel-badge-success">Done</span>
```

Keep meta short: a count or a score.

### Ghost icon button

```html
<button type="button" class="btn iv-panel-btn" id="myplugin-refresh"
    title="Refresh" aria-label="Refresh">
    <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
</button>
```

A 32px circle with no fill. Hover and focus show the hover tint.

* A toggle sets `aria-pressed="true"` or `"false"` (or the class `active`); pressed shows the accent colour.
* A dropdown trigger adds `dropdown-toggle`; the caret is hidden (also on selects and segment items).
* Every icon-only button has both `title` and `aria-label`.

### Search

```html
<div class="iv-panel-search">
    <i class="bi bi-search" aria-hidden="true"></i>
    <input type="search" class="form-control" placeholder="Search"
        aria-label="Search">
</div>
```

### Select

A pill trigger for a dropdown, such as the playlist section or a language.

```html
<div class="dropdown">
    <button type="button" class="btn iv-panel-select dropdown-toggle"
        data-toggle="dropdown" data-bs-toggle="dropdown" aria-expanded="false">
        <span>Section 1: Introduction</span>
        <i class="bi bi-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="dropdown-menu">...</div>
</div>
```

### Segment

Equal-width pill toggles (a grid, so a dropdown can be one of the items). The pressed one is filled with the accent.

```html
<div class="iv-panel-segment" role="group" aria-label="Show">
    <button type="button" class="btn iv-panel-segment-item" aria-pressed="true">Comments</button>
    <button type="button" class="btn iv-panel-segment-item" aria-pressed="false">Notes</button>
</div>
```

### Progress

```html
<div class="iv-panel-toolbar">
    <div class="progress iv-panel-progress">
        <div class="progress-bar" style="width: 40%"></div>
    </div>
    <span class="iv-panel-meta">2 of 5</span>
</div>
```

## Build a panel

1. Give the panel the classes `iv-sidebar iv-panel`, and `p-0`.
2. Extend `mod_interactivevideo/sidepanel_head` for the head.
3. Put the content in `.iv-panel-body`.

```mustache
<div class="iv-sidebar iv-panel p-0 myplugin-panel" id="myplugin-panel"
    aria-labelledby="myplugin-heading">
    {{< mod_interactivevideo/sidepanel_head }}
        {{$meta}}<span class="iv-panel-meta">{{count}}</span>{{/meta}}
        {{$toolbar}}
            <div class="iv-panel-toolbar">
                <div class="iv-panel-search">
                    <i class="bi bi-search" aria-hidden="true"></i>
                    <input type="search" class="form-control myplugin-search"
                        placeholder="{{#str}} search {{/str}}" aria-label="{{#str}} search {{/str}}">
                </div>
            </div>
        {{/toolbar}}
    {{/ mod_interactivevideo/sidepanel_head }}
    <div class="iv-panel-body">...</div>
</div>
```

Render it with the context `{icon, title, headingid, closeid or closeclass}`; see the template's doc block.
The blocks are `icon`, `title`, `meta`, `actions`, `close` and `toolbar`.

## Rules

Do:

* Use the tokens for every colour in the head, so light, dark and distraction-free modes all work.
* Keep the close button last, as a ghost `bi-x-lg` button.
* Use pills (search, select, segment, badge) and circles (buttons) only.
* Keep existing ids and classes your JavaScript uses; add the design-system classes beside them.

Don't:

* Use filled square buttons (`btn-secondary`, `btn-light`, `btn-dark`) in a panel head.
* Write `.darkmode` overrides for head controls. The tokens already switch.
* Add a second divider, or a background colour to the head.
* Put more than one toolbar row in the head. Move extra filters into the body.

## Bootstrap 4 and 5

Use only classes both versions have, or Interactive Video's own helpers.

| Need | Use | Don't use alone |
| --- | --- | --- |
| Dropdown | `data-toggle="dropdown" data-bs-toggle="dropdown"` | either attribute alone |
| Screen reader text | `sr-only visually-hidden` | `visually-hidden` |
| Spacing at the start or end | `iv-ml-*`, `iv-mr-*`, `iv-pl-*`, or the design-system classes | `ms-*`, `me-*`, `ps-*`, `pe-*` |
| Bold | `font-weight-bold fw-bold`, or `iv-font-weight-bold` | `fw-*` |
| Gaps | the design-system classes, or flex with margins | `gap-*` |
| Pills | the design-system classes, or `border-radius: 50rem` in CSS | `rounded-pill` |
| Close button | `btn iv-panel-btn` with `bi-x-lg` | `btn-close` |
| Select | `custom-select form-select` | `form-select` |

Safe in both: `btn`, `form-control`, `dropdown`, `dropdown-menu`, `dropdown-item`, `d-*`, `flex-*`,
`align-items-*`, `justify-content-*`, `text-truncate`, `text-muted`, `p-*`, `m-*` with `t`, `b`, `x` or `y`.

## Right to left

The design-system CSS uses logical properties (`padding-inline`, `inset-inline-start`), so the head mirrors in
right-to-left languages without extra rules. Do the same in plugin CSS, or add `.dir-rtl` rules.
