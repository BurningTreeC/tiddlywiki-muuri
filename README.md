# tiddlywiki-muuri

## About

**tiddlywiki-muuri** is a Drag & Drop–enabled plugin for [TiddlyWiki5](https://tiddlywiki.com) that adds a **Muuri-based grid storyview** (a “board”/“masonry” style story river). It supports **connected grids** (drag cards between multiple storyviews), **attribute-driven configuration**, and a set of **practical fixes** for real-world wiki content (late-loading images, embedded iframes/editors, and resize/layout stability).

Demo: https://burningtreec.github.io/tiddlywiki-muuri

> Tip: The plugin works best with the **TiddlyWiki CodeMirror** plugin installed, because it improves the editor experience inside draggable tiles.

---

## Features

- **Muuri grid storyview**: story tiddlers shown as draggable “cards” in a responsive grid.
- **Drag & Drop reordering** with persistence to the story list (configurable story list target/field).
- **Connected grids**: drag items between multiple Muuri storyviews (e.g., columns/lanes).
- **Optional drop actions**: run TiddlyWiki action strings on cross-grid drops (e.g., tag/status changes).
- **Touch support** with long-press gating to prevent accidental drags while scrolling.
- **Robust layout stability**:
  - reacts to **late-loading images/media**
  - uses **ResizeObserver** (with fallback) to keep layout correct
  - avoids common **iframe/editor issues** during drag by safely detaching/restoring iframes
- **Filtering** via a “search tiddler” (type-to-filter behavior) that integrates with list filters.
- **Works on classic + modern builds** (dev/master compatible constructor resolution).

---

## Installation

You can install the tiddlywiki-muuri plugin in two ways:

### NodeJs

Clone this repo to your `TIDDLYWIKI_PLUGIN_PATH` (see https://tiddlywiki.com/#Environment%20Variables%20on%20Node.js):

```bash
git clone --depth=1 git@github.com:BurningTreeC/tiddlywiki-muuri.git "$TIDDLYWIKI_PLUGIN_PATH"
