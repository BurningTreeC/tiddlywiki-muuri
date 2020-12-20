# tiddlywiki-muuri

## About

**tiddlywiki-muuri** is a Drag&Drop enabled plugin for [TiddlyWiki5](https://tiddlywiki.com) that adds a gridded storyview based on the [muuri library](https://muuri.dev)

You can see a Demo [here](https://burningtreec.github.io/tiddlywiki-muuri)

Note that the plugin works best with the TiddlyWiki CodeMirror plugin installed

## Installation

You can install the tiddlywiki-muuri plugin in two ways:

### NodeJs

clone this repo to your `TIDDLYWIKI_PLUGIN_PATH` (see https://tiddlywiki.com/#Environment%20Variables%20on%20Node.js)

```
git clone --depth=1 git@github.com:BurningTreeC/tiddlywiki-muuri.git $TIDDLYWIKI_PLUGIN_PATH
```

enable the plugin in your tiddlywiki.info file (see https://tiddlywiki.com/#tiddlywiki.info%20Files)

```
"plugins": [
	"plugins/first-plugin",
	"plugins/second-plugin",
	"BTC/Muuri"
	]
```

### The TiddlyWiki SingleFile way

- go to https://burningtreec.github.io/tiddlywiki-muuri
- open the "More" Tab in the Sidebar
- open the "Plugins" Tab in the "More" Submenu
- locate the plugin titled "A gridded storyview"
- drag the link to the Wiki where you want to install it
- save your Wiki and reload

