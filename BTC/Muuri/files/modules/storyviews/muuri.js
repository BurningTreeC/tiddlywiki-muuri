/*\
title: $:/plugins/BTC/Muuri/modules/storyviews/muuri.js
type: application/javascript
module-type: storyview

Muuri storyview for TiddlyWiki - Simplified implementation

Works in coordination with the list widget subclass:
- Storyview handles visual drag/drop reordering via Muuri
- Sets _muuriHandledReorder flag to signal list widget
- List widget skips DOM rebuild for pure reorders

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/* ----------------------------- Muuri loading ----------------------------- */

function ensureMuuriLoaded() {
	if (typeof window === "undefined") return;

	var testElement = document.body;
	if (testElement && !("animate" in testElement)) {
		require("$:/plugins/BTC/Muuri/library/web-animations-polyfill.js");
	}

	if (!window.MuuriModule) {
		window.MuuriModule = require("$:/plugins/BTC/Muuri/library/muuri.min.js");
	}

	if ($tw.Grids === undefined) $tw.Grids = [];
}
ensureMuuriLoaded();

/* ------------------------------- Helpers -------------------------------- */

function parseBool(value, defaultValue) {
	if (value === undefined || value === null || value === "") return defaultValue;
	var v = String(value).toLowerCase();
	if (v === "yes" || v === "true" || v === "1") return true;
	if (v === "no" || v === "false" || v === "0") return false;
	return defaultValue;
}

function parseIntSafe(value, defaultValue) {
	var n = parseInt(value, 10);
	return Number.isFinite(n) ? n : defaultValue;
}

function isRightClickLike(e) {
	return !!(
		(e && e.which === 3) ||
		(e && e.button === 2) ||
		(e && typeof e.buttons === "number" && (e.buttons & 2) === 2)
	);
}

function isPrimaryButtonOnly(srcEvent) {
	if (!srcEvent) return true;
	if (typeof srcEvent.buttons === "number") return srcEvent.buttons === 1;
	if (typeof srcEvent.button === "number") return srcEvent.button === 0;
	if (typeof srcEvent.which === "number") return srcEvent.which === 1;
	return true;
}

function isRightClickOrNonPrimaryPointer(e) {
	if (!e) return false;
	var se = e.srcEvent || e;
	if (isRightClickLike(se)) return true;
	return !isPrimaryButtonOnly(se);
}

function getMuuriGridElement(grid) {
	if (!grid) return null;
	if (typeof grid.getElement === "function") return grid.getElement();
	return grid._element || grid.element || null;
}

// Get first element DOM node from widget (skip text nodes)
function firstElementDomNode(widget) {
	if (!widget || typeof widget.findFirstDomNode !== "function") return null;
	var n = widget.findFirstDomNode();
	while (n && n.nodeType === Node.TEXT_NODE) n = n.nextSibling;
	return (n && n.nodeType === Node.ELEMENT_NODE) ? n : null;
}

// Resolve Muuri Grid constructor from module
function resolveGridCtor(MuuriModule) {
	if (!MuuriModule) return null;
	if (MuuriModule.Grid && typeof MuuriModule.Grid === "function") return MuuriModule.Grid;

	var candidates = [];
	if (typeof MuuriModule === "function") candidates.push(MuuriModule);
	if (MuuriModule.default && typeof MuuriModule.default === "function") candidates.push(MuuriModule.default);
	if (MuuriModule.Muuri && typeof MuuriModule.Muuri === "function") candidates.push(MuuriModule.Muuri);

	for (var k in MuuriModule) {
		if (Object.prototype.hasOwnProperty.call(MuuriModule, k) && typeof MuuriModule[k] === "function") {
			candidates.push(MuuriModule[k]);
		}
	}

	function looksLikeGridCtor(fn) {
		var p = fn && fn.prototype;
		return !!(p && typeof p.getItems === "function" && typeof p.on === "function" && typeof p.layout === "function");
	}

	for (var i = 0; i < candidates.length; i++) {
		if (looksLikeGridCtor(candidates[i])) return candidates[i];
	}
	return null;
}

/* ------------------------------ Storyview -------------------------------- */

class MuuriStoryView {
	constructor(listWidget) {
		this.listWidget = listWidget;

		this.MuuriNS = (typeof window !== "undefined") ? window.MuuriModule : null;
		this.MuuriGridCtor = resolveGridCtor(this.MuuriNS);

		// State
		this.itemTitlesArray = [];
		this.connectedGrids = [];
		this.dragStartData = new Map();

		// Flag to signal list widget that we handled the reorder
		this._muuriHandledReorder = false;

		// Resize observation
		this._resizeObserver = null;
		this._resizeFallbackMap = new Map();
		this._itemResizeHandlers = new Map();
		this._layoutRAF = null;

		// Mutation observer
		this.observer = null;

		this.collectAttributes();

		this.muuri = this.createMuuriGrid();
		if (this.muuri) {
			this.unleashMuuriGrid();
		} else {
			setTimeout(() => {
				this.muuri = this.createMuuriGrid();
				if (this.muuri) this.unleashMuuriGrid();
			}, $tw.utils.getAnimationDuration());
		}
	}

	/* ---------------- Fast Lookup Helpers ---------------- */

	_getMuuriItemByElement(el) {
		if (!this.muuri || !el || typeof this.muuri.getItems !== "function") return null;
		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			if (items[i] && items[i].element === el) return items[i];
		}
		return null;
	}

	/* ---------------- Attribute Configuration ---------------- */

	collectAttributes() {
		var lw = this.listWidget;
		this.animationDuration = $tw.utils.getAnimationDuration();
		this.attachEvent = lw.document.attachEvent;

		this.itemTemplate = lw.getAttribute("template");
		this.itemEditTemplate = lw.getAttribute("editTemplate");

		this.noDragTags = ["input", "INPUT", "textarea", "TEXTAREA", "button", "BUTTON", "select", "SELECT", "a", "A"];

		this.containerClass = lw.getAttribute("muuri-container-class") || "tc-muuri-river";
		var itemClassAttr = lw.getAttribute("muuri-item-class") || "tc-tiddler-frame";

		if (!itemClassAttr || itemClassAttr === "*") {
			this.itemSelector = "*";
			this.itemClass = "tc-muuri-item";
		} else {
			var classes = itemClassAttr.split(/\s+/).filter(Boolean);
			this.itemSelector = "." + classes[0];
			this.itemClass = classes[0];
		}

		this.dragEnabled = parseBool(lw.getAttribute("muuri-drag-enabled"), true);
		this.dragHandle = lw.getAttribute("muuri-drag-handle") || null;

		this.dragSortAction = lw.getAttribute("muuri-drag-sort-action") || "move";
		this.dragSortThreshold = parseIntSafe(lw.getAttribute("muuri-drag-sort-threshold"), 40);
		this.dragSortHeuristicsInterval = parseIntSafe(lw.getAttribute("muuri-drag-sort-heuristics-interval"), 100);

		this.dragDeltaTime = parseIntSafe(lw.getAttribute("muuri-drag-deltatime"), 100);
		this.dragDistance = parseIntSafe(lw.getAttribute("muuri-drag-distance"), 10);

		this.dragAutoScrollAxis = lw.getAttribute("muuri-drag-autoscroll-axis") || null;

		this.horizontal = parseBool(lw.getAttribute("muuri-layout-horizontal"), false);
		this.alignRight = parseBool(lw.getAttribute("muuri-align-right"), true);
		this.alignBottom = parseBool(lw.getAttribute("muuri-align-bottom"), false);

		this.connectionSelector = lw.getAttribute("muuri-connection-selector") || null;
		this.dropActions = lw.getAttribute("muuri-drop-actions") || null;

		this.storyListTitle =
			lw.getAttribute("muuri-storylist") ||
			lw.getVariable("tv-muuri-story-list") ||
			lw.getVariable("tv-story-list") ||
			null;

		this.storyListField = lw.getAttribute("muuri-storylist-field") || "list";
		this.filterTiddler = lw.getAttribute("muuri-filter-tiddler") || null;

		this.dragContainer = this.resolveDragContainer(lw.getAttribute("muuri-drag-container"));
	}

	resolveDragContainer(selector) {
		if (!selector) return null;
		var doc = this.listWidget.document;
		var candidates = Array.prototype.slice.call(doc.documentElement.querySelectorAll(selector));
		if (!candidates.length) return null;

		var node = this.listWidget.parentDomNode;
		while (node) {
			for (var i = 0; i < candidates.length; i++) {
				if (node === candidates[i]) return candidates[i];
			}
			node = node.parentNode;
		}
		return candidates[0] || null;
	}

	/* ---------------- Grid Creation ---------------- */

	createMuuriGrid() {
		if (!this.MuuriGridCtor) {
			console.error("Muuri grid ctor not found.");
			return false;
		}
		if (!this.listWidget.parentDomNode || !this.listWidget.parentDomNode.isConnected) return false;

		var domNode = this.listWidget.parentDomNode;
		domNode.setAttribute("data-grid", "muuri");

		var options = this.collectOptions();
		try {
			var grid = new this.MuuriGridCtor(domNode, options);
			if (!grid || typeof grid.getItems !== "function") return false;
			return grid;
		} catch (e) {
			console.error("Muuri grid creation failed:", e);
			return false;
		}
	}

	collectOptions() {
		var self = this;
		var Muuri = this.MuuriNS;

		this.dragStartData = new Map();

		var axis = self.dragAutoScrollAxis;
		if (!axis) axis = self.horizontal ? "x" : "y";

		return {
			items: self.itemSelector,
			dragContainer: self.dragContainer,
			dragEnabled: !!self.dragEnabled,
			dragHandle: self.dragHandle,

			dragSortPredicate: { action: self.dragSortAction, threshold: self.dragSortThreshold },
			dragSortHeuristics: { sortInterval: self.dragSortHeuristicsInterval },

			layout: {
				fillGaps: false,
				horizontal: self.horizontal,
				alignRight: self.alignRight,
				alignBottom: self.alignBottom,
				rounding: false
			},
			layoutEasing: EASING,

			dragCssProps: {
				touchAction: "auto",
				userSelect: "none",
				userDrag: "none",
				tapHighlightColor: "rgba(0, 0, 0, 0)",
				touchCallout: "none",
				contentZooming: "none"
			},

			dragStartPredicate: function (item, e) {
				var items = self.muuri.getItems();
				for (var i = 0; i < items.length; i++) $tw.utils.removeClass(items[i].element, "tc-active");
				$tw.utils.addClass(item.element, "tc-active");

				if (!self.dragEnabled) return undefined;
				if (e.pointerType !== "touch") {
					if (isRightClickOrNonPrimaryPointer(e)) return false;
				}

				if (
					(e.target && e.target.tagName &&
						(self.noDragTags.indexOf(e.target.tagName) > -1 || self.lookupDragTarget(e.target))) ||
					self.detectWithinCodemirror(e) ||
					!self.detectGridWithinGrid(e.target)
				) {
					return false;
				}

				if ((e.deltaTime > self.dragDeltaTime) && (e.distance > self.dragDistance)) {
					if (Muuri && Muuri.ItemDrag && Muuri.ItemDrag.defaultStartPredicate) {
						return Muuri.ItemDrag.defaultStartPredicate(item, e);
					}
					return true;
				}
				return undefined;
			},

			dragSort: function () {
				self.detectConnectedGrids();
				return self.connectedGrids;
			},

			dragRelease: {
				duration: self.animationDuration,
				easing: EASING,
				useDragContainer: true
			},

			dragAutoScroll: {
				axis: axis,
				targets: function (item) {
					var scrollContainers = [];
					var options = [];
					var node = self.getItemGridElement(item);
					if (!node) node = item.element;

					while (node && node.nodeType === 1) {
						var sc = self.getScrollContainer(node);
						if (sc && scrollContainers.indexOf(sc) === -1) $tw.utils.pushTop(scrollContainers, sc);
						node = node.parentNode;
					}

					for (var i = 0; i < scrollContainers.length; i++) {
						var obj = {};
						$tw.utils.extend(obj, { element: scrollContainers[i], priority: i });
						$tw.utils.pushTop(options, obj);
					}
					return options;
				},
				handle: (Muuri && Muuri.AutoScroller && Muuri.AutoScroller.pointerHandle)
					? Muuri.AutoScroller.pointerHandle(100)
					: null,
				sortDuringScroll: false,
				smoothStop: false,
				threshold: 50
			},

			translate3d: false,
			showDuration: self.animationDuration,
			layoutDuration: self.animationDuration,
			layoutOnResize: true,
			layoutOnInit: true,

			containerClass: self.containerClass,
			itemClass: self.itemClass,

			itemDraggingClass: "tc-muuri-dragging",
			itemReleasingClass: "tc-muuri-releasing",
			itemPositioningClass: "tc-muuri-positioning"
		};
	}

	getGridElement(grid) {
		return getMuuriGridElement(grid || this.muuri);
	}

	getItemGridElement(item) {
		if (!item || typeof item.getGrid !== "function") return null;
		return this.getGridElement(item.getGrid());
	}

	/* ---------------- Resize/Layout ---------------- */

	setupResizeObservation() {
		var self = this;
		if (typeof ResizeObserver !== "undefined") {
			this._resizeObserver = new ResizeObserver(function () {
				self._requestLayout(false);
			});
		} else {
			this._resizeObserver = null;
		}
	}

	_requestLayout(instant) {
		if (!this.muuri) return;
		if (this._layoutRAF) return;

		var win = this.listWidget.document.defaultView;
		var self = this;

		this._layoutRAF = win.requestAnimationFrame(function () {
			self._layoutRAF = null;
			self.refreshMuuriGrid(!!instant);
		});
	}

	refreshMuuriGrid(instant) {
		if (!this.muuri) return;
		this.muuri.refreshItems();
		this.muuri.layout(!!instant);
		this.updateZIndices();
	}

	observeElementResize(element, fn) {
		if (!element) return;
		this._itemResizeHandlers.set(element, fn);

		if (this._resizeObserver) {
			try { this._resizeObserver.observe(element); } catch (e) {}
		}
	}

	unobserveElementResize(element) {
		if (!element) return;

		if (this._resizeObserver) {
			try { this._resizeObserver.unobserve(element); } catch (e) {}
		}

		this._itemResizeHandlers.delete(element);
	}

	/* ---------------- Grid Connectivity ---------------- */

	updateGlobalGrids() {
		var foundGridElements = this.listWidget.document.documentElement.querySelectorAll('[data-grid="muuri"]');
		for (var i = 0; i < $tw.Grids.length; i++) {
			var globalGridElement = $tw.Grids[i].element;
			var found = false;
			for (var k = 0; k < foundGridElements.length; k++) {
				if (globalGridElement === foundGridElements[k]) { found = true; break; }
			}
			if (!found) { $tw.Grids.splice(i, 1); i--; }
		}
	}

	detectConnectedGrids() {
		var sel = this.connectionSelector;
		var connectedGrids = [];

		this.updateGlobalGrids();

		if (sel) {
			var connectedGridElements = this.listWidget.document.documentElement.querySelectorAll(sel);
			for (var i = 0; i < $tw.Grids.length; i++) {
				for (var k = 0; k < connectedGridElements.length; k++) {
					if ($tw.Grids[i].element === connectedGridElements[k]) {
						connectedGrids.push($tw.Grids[i]);
						break;
					}
				}
			}
		}

		var selfEl = this.getGridElement();
		if (selfEl && !connectedGrids.some(function (g) { return g.element === selfEl; })) {
			connectedGrids.push(this.muuri);
		}

		connectedGrids.sort(function (a, b) { return a._id - b._id; });
		this.connectedGrids = connectedGrids;
	}

	addSelfToGlobalGrids() {
		var selfEl = this.getGridElement();
		if (!selfEl) return;
		this.muuri.element = selfEl;
		var exists = $tw.Grids.some(function (g) { return g.element === selfEl; });
		if (!exists) $tw.utils.pushTop($tw.Grids, this.muuri);
	}

	findMuuriWidget() {
		var gridEl = this.getGridElement();
		var widget = this.listWidget;
		while (widget) {
			if (gridEl && widget.domNodes && widget.domNodes[0] === gridEl) return widget;
			widget = widget.parentWidget;
		}
		return this.listWidget.parentWidget;
	}

	/* ---------------- Item/Title Mapping ---------------- */

	findListWidget(element) {
		if (!this.connectedGrids || !this.connectedGrids.length) {
			try { this.detectConnectedGrids(); } catch (e0) {}
		}

		for (var i = 0; i < this.connectedGrids.length; i++) {
			var lw = this.connectedGrids[i].listWidget;
			if (!lw || !lw.children) continue;
			var children = lw.children;
			for (var k = 0; k < children.length; k++) {
				var listElement = firstElementDomNode(children[k]);
				if (listElement && listElement === element) return children[k];
			}
		}
		return null;
	}

	getItemTitle(item) {
		var widget = this.findListWidget(item.element);
		return widget ? widget.parseTreeNode.itemTitle : null;
	}

	refreshItemTitlesArray() {
		if (!this.muuri) return;

		try { if (typeof this.muuri.synchronize === "function") this.muuri.synchronize(); } catch (e0) {}
		try { this.muuri.refreshItems(); } catch (e1) {}

		var items = (typeof this.muuri.getItems === "function") ? this.muuri.getItems() : [];
		this.itemTitlesArray = [];

		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			if (!it || !it.element) continue;
			var title = this.getItemTitle(it);
			this.itemTitlesArray.push(title);
		}
	}

	/* ---------------- Synchronize Grid -> StoryList ---------------- */

	synchronizeGrid() {
		if (!this.muuri) return;

		this.refreshItemTitlesArray();

		var hasChanged = (this.itemTitlesArray.length !== this.listWidget.list.length);
		if (!hasChanged) {
			for (var i = 0; i < this.itemTitlesArray.length; i++) {
				if (this.itemTitlesArray[i] !== this.listWidget.list[i]) { hasChanged = true; break; }
			}
		}

		if (
			this.storyListTitle &&
			hasChanged &&
			this.itemTitlesArray.indexOf(undefined) === -1 &&
			this.itemTitlesArray.indexOf(null) === -1
		) {
			// Signal to the list widget that we've handled the reorder visually
			// When it processes the storylist change, it can skip DOM manipulation
			this._muuriHandledReorder = true;
			
			// Write the new order to the storylist tiddler
			this.listWidget.wiki.setText(this.storyListTitle, this.storyListField, undefined, this.itemTitlesArray);
		}
	}

	/* ---------------- Insert/Remove Lifecycle ---------------- */

	insert(widget) {
		var targetElement = firstElementDomNode(widget);
		if (!targetElement) return;
		if (!this.muuri) return;

		var itemTitle = widget.parseTreeNode.itemTitle;

		// Check if element is already in Muuri
		var existingItem = this._getMuuriItemByElement(targetElement);
		if (existingItem) {
			if (!this._itemResizeHandlers.has(targetElement)) {
				this.observeElementResize(targetElement, this._makeRefreshHandler());
			}
			this._requestLayout(false);
			return;
		}

		// Add new element to Muuri with show animation
		var targetIndex = this.listWidget.findListItem(0, itemTitle);
		if (targetIndex === undefined || targetIndex === null) targetIndex = -1;

		try { 
			// Add with layout: false, then show with animation, then layout
			this.muuri.add([targetElement], { index: targetIndex, active: true, layout: false }); 
			
			// Get the newly added item and trigger show animation
			var newItem = this._getMuuriItemByElement(targetElement);
			if (newItem) {
				// Show with animation (uses showDuration from settings)
				this.muuri.show([newItem], {
					onFinish: function() {
						// Layout after show animation completes
					}
				});
			}
			
			// Layout with animation
			this.muuri.layout();
		} catch (e1) { 
			try { 
				this.muuri.add(targetElement, { index: targetIndex, layout: true }); 
			} catch (e2) {}
		}

		this.observeElementResize(targetElement, this._makeRefreshHandler());
	}

	remove(widget) {
		var targetElement = firstElementDomNode(widget);
		if (!targetElement) return;
		if (!this.muuri) {
			// TW removes DOM nodes
			try { if (widget) widget.removeChildDomNodes(); } catch (e) {}
			this.unobserveElementResize(targetElement);
			return;
		}

		var existingItem = this._getMuuriItemByElement(targetElement);
		if (!existingItem) {
			// TW removes DOM nodes
			try { if (widget) widget.removeChildDomNodes(); } catch (e) {}
			this.unobserveElementResize(targetElement);
			return;
		}

		this.unobserveElementResize(targetElement);

		var self = this;
		
		// Hide with animation, then remove
		try {
			this.muuri.hide([existingItem], {
				onFinish: function(items) {
					// After hide animation completes, remove from Muuri
					try {
						self.muuri.remove(items, { removeElements: false, layout: true });
					} catch (e3) {}
					
					// TW removes DOM nodes
					try { if (widget) widget.removeChildDomNodes(); } catch (e4) {}
				}
			});
		} catch (e1) {
			// Fallback: remove immediately
			try { 
				this.muuri.remove([existingItem], { removeElements: false, layout: true }); 
			} catch (e2) {}
			// TW removes DOM nodes
			try { if (widget) widget.removeChildDomNodes(); } catch (e5) {}
		}
	}

	/* ---------------- Drag Release Handler ---------------- */

	onDragReleaseEnd(item) {
		if (!this.muuri) return;

		if (item && item.element && item.element.style) {
			item.element.style.width = "";
		}

		// Synchronize Muuri's order to the storylist
		this.detectConnectedGrids();

		for (var k = 0; k < this.connectedGrids.length; k++) {
			var g = this.connectedGrids[k];
			if (!g) continue;

			try { if (typeof g.synchronize === "function") g.synchronize(); } catch (e1) {}
			try { g.refreshItems(); } catch (e2) {}

			if (typeof g.synchronizeGrid === "function") {
				g.synchronizeGrid();
			}
		}

		// Update z-indices after drag release
		this.updateZIndices();
	}

	/* ---------------- Grid Setup ---------------- */

	unleashMuuriGrid() {
		var self = this;
		this.muuri.listWidget = this.listWidget;

		var gridEl = this.getGridElement();
		if (!gridEl) {
			try { this.muuri.destroy(true); } catch (e) {}
			this.findMuuriWidget().refreshSelf();
			return;
		}

		this.setupResizeObservation();

		// Listen for image/media loads to trigger relayout
		this._imageLoadListener = function (ev) {
			var t = ev && ev.target;
			if (!t) return;

			if (t.tagName === "IMG" || t.tagName === "VIDEO" || t.tagName === "IFRAME") {
				self._requestLayout(false);
			}
		};
		gridEl.addEventListener("load", this._imageLoadListener, true);
		gridEl.addEventListener("error", this._imageLoadListener, true);

		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			var element = items[i].element;
			this.itemTitlesArray.push(this.getItemTitle(items[i]));
			this.observeElementResize(element, this._makeRefreshHandler());
		}
		this.observeElementResize(gridEl, this._makeRefreshHandler());

		this.muuri.synchronizeGrid = function () { self.synchronizeGrid(); };

		// Drag events
		this.muuri.on("dragInit", function (item) {
			// Ensure dragged item is always on top
			if (item && item.element && item.element.style) {
				item.element.style.zIndex = "10000";
			}
		});

		this.muuri.on("dragEnd", function (item, event) {
			item.event = event;
		});

		this.muuri.on("dragReleaseEnd", function (item) {
			self.onDragReleaseEnd(item);
			self._requestLayout(true);
		});

		// Update z-indices after every layout completes
		this.muuri.on("layoutEnd", function () {
			self.updateZIndices();
		});

		this.muuri.on("destroy", function () {
			self.removeAllListeners();
		});

		this.addSelfToGlobalGrids();

		this.observer = new MutationObserver(function () {});
		this.observer.observe(gridEl, { attributes: true, childList: true, characterData: true });

		// Initial z-index update
		this.updateZIndices();

		this.refreshEnd();
	}

	_makeRefreshHandler() {
		var self = this;
		return function () { self.refreshMuuriGrid(); };
	}

	removeAllListeners() {
		if (!this.muuri) return;

		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			this.unobserveElementResize(items[i].element);
		}

		var gridEl = this.getGridElement();
		if (gridEl) this.unobserveElementResize(gridEl);

		if (gridEl && this._imageLoadListener) {
			try { gridEl.removeEventListener("load", this._imageLoadListener, true); } catch (e2) {}
			try { gridEl.removeEventListener("error", this._imageLoadListener, true); } catch (e3) {}
		}
		this._imageLoadListener = null;

		if (this._resizeObserver) {
			try { this._resizeObserver.disconnect(); } catch (e6) {}
			this._resizeObserver = null;
		}

		if (this.observer) {
			try { this.observer.disconnect(); } catch (e7) {}
			this.observer = null;
		}
	}

	/* ---------------- Filtering ---------------- */

	filterItems() {
		if (!this.filterTiddler || !this.muuri) return;

		var self = this;
		this.muuri.filter(function (item) {
			var listWidget = item.getGrid().listWidget;
			var listWidgetFilter = listWidget.getAttribute("filter") || "";
			var q = listWidget.wiki.getTiddlerText(self.filterTiddler) || "";
			var searchFilter = listWidgetFilter + " " + "+[search[" + q + "]]";
			var foundTiddlers = listWidget.wiki.filterTiddlers(searchFilter, listWidget);
			var itemTitle = self.getItemTitle(item);
			return foundTiddlers.indexOf(itemTitle) !== -1;
		});
	}

	/* ---------------- Z-Index Management ---------------- */

	updateZIndices() {
		if (!this.muuri) return;

		var items = this.muuri.getItems();
		if (!items.length) return;

		// Collect items with their positions
		var itemsWithPos = [];
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			if (!item || !item.element) continue;
			itemsWithPos.push({
				item: item,
				left: item.left || 0,
				top: item.top || 0
			});
		}

		// Sort: top-left first (highest z-index), bottom-right last (lowest z-index)
		// Primary sort by top (ascending), secondary by left (ascending)
		itemsWithPos.sort(function(a, b) {
			if (a.top !== b.top) return a.top - b.top;
			return a.left - b.left;
		});

		// Assign z-index: first item (top-left) gets highest, last gets lowest
		var baseZIndex = itemsWithPos.length;
		for (var j = 0; j < itemsWithPos.length; j++) {
			var element = itemsWithPos[j].item.element;
			if (element && element.style) {
				element.style.zIndex = String(baseZIndex - j);
			}
		}
	}

	/* ---------------- Misc Helpers ---------------- */

	detectWithinCodemirror(event) {
		var node = event.target;
		while (node) {
			if (node.classList &&
				(node.classList.contains("CodeMirror-scroll") ||
					node.classList.contains("cm-scroller") ||
					node.classList.contains("CodeMirror") ||
					node.classList.contains("cm-editor") ||
					node.classList.contains("cm-content"))) {
				return true;
			}
			node = node.parentNode;
		}
		return false;
	}

	detectGridWithinGrid(element) {
		var firstItem = this.muuri.getItems()[0];
		var gridNode = firstItem ? this.getItemGridElement(firstItem) : null;
		if (!gridNode) return true;

		var elementChildNodes = element ? element.childNodes : [];
		var isCurrentGrid = false;
		var foundGrid = false;
		if (!elementChildNodes || elementChildNodes.length === 0) return true;

		$tw.utils.each(elementChildNodes, function (node) {
			while (node && !foundGrid) {
				if (node.nodeType !== Node.TEXT_NODE && node.getAttribute && node.getAttribute("data-grid") === "muuri") {
					foundGrid = true;
					isCurrentGrid = (node === gridNode);
				}
				node = node.parentNode;
			}
		});

		return isCurrentGrid;
	}

	lookupDragTarget(element) {
		var count = 0;
		var node = element ? element.parentNode : null;
		while (node && count < 10) {
			if (this.noDragTags.indexOf(node.tagName) > -1) return true;
			node = node.parentNode;
			count++;
		}
		return false;
	}

	getScrollContainer(element, includeHidden) {
		var doc = element.ownerDocument;
		var style = getComputedStyle(element);
		var excludeStaticParent = style.position === "absolute";
		var overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;

		if (style.position === "fixed") {
			if ("scrollingElement" in doc) return doc.scrollingElement;
			if (navigator.userAgent.indexOf("WebKit") !== -1) return doc.body;
			return doc.documentElement;
		}

		for (var parent = element; (parent = parent.parentElement);) {
			style = getComputedStyle(parent);
			if (excludeStaticParent && style.position === "static") continue;
			if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) return parent;
		}

		if ("scrollingElement" in doc) return doc.scrollingElement;
		if (navigator.userAgent.indexOf("WebKit") !== -1) return doc.body;
		return doc.documentElement;
	}

	/* ---------------- Refresh Lifecycle ---------------- */

	refreshStart(changedTiddlers, changedAttributes) {
		var before = {
			containerClass: this.containerClass,
			itemClass: this.itemClass,
			itemSelector: this.itemSelector
		};

		this.collectAttributes();

		if (this.muuri && changedTiddlers["$:/config/AnimationDuration"]) {
			this.animationDuration = $tw.utils.getAnimationDuration();
			this.muuri.updateSettings({
				showDuration: this.animationDuration,
				layoutDuration: this.animationDuration,
				dragRelease: { duration: this.animationDuration, easing: EASING, useDragContainer: true }
			});
		}

		var structuralChange =
			(before.containerClass !== this.containerClass) ||
			(before.itemClass !== this.itemClass) ||
			(before.itemSelector !== this.itemSelector);

		if (this.muuri) {
			this.muuri.updateSettings({
				dragContainer: this.dragContainer,
				dragHandle: this.dragHandle,
				dragEnabled: !!this.dragEnabled,
				dragSortPredicate: { action: this.dragSortAction, threshold: this.dragSortThreshold },
				dragSortHeuristics: { sortInterval: this.dragSortHeuristicsInterval },
				layout: {
					horizontal: this.horizontal,
					alignRight: this.alignRight,
					alignBottom: this.alignBottom,
					fillGaps: false,
					rounding: false
				},
				showDuration: this.animationDuration,
				layoutDuration: this.animationDuration
			});
		}

		if (this.muuri && this.filterTiddler && changedTiddlers[this.filterTiddler]) {
			this.detectConnectedGrids();
			this.filterItems();
		}

		if (
			structuralChange ||
			changedAttributes.filter ||
			changedAttributes.template ||
			changedAttributes.editTemplate ||
			changedAttributes.emptyMessage ||
			changedAttributes.storyview ||
			changedAttributes.history
		) {
			if (this.observer) { try { this.observer.disconnect(); } catch (e) {} }
		}

		if (structuralChange) {
			if (this.observer) { try { this.observer.disconnect(); } catch (e2) {} }
			this.removeAllListeners();
			this.findMuuriWidget().refreshSelf();
		}

		return true;
	}

	refreshEnd() {
		if (this.filterTiddler) {
			this.detectConnectedGrids();
			this.filterItems();
		}
		
		// Clear the reorder flag after refresh cycle completes
		this._muuriHandledReorder = false;
	}

	navigateTo(historyInfo) {
		if (!this.muuri || !historyInfo || !historyInfo.title) {
			return;
		}
		var duration = $tw.utils.getAnimationDuration()
		var listElementIndex = this.listWidget.findListItem(0,historyInfo.title);
		if(listElementIndex === undefined) {
			return;
		}
		var listItemWidget = this.listWidget.children[listElementIndex],
			targetElement = listItemWidget.findFirstDomNode();
		// Abandon if the list entry isn't a DOM element (it might be a text node)
		if(!targetElement || targetElement.nodeType === Node.TEXT_NODE) {
			return;
		}
		// Scroll the node into view
		this.listWidget.dispatchEvent({type: "tm-scroll", target: targetElement});
	};
}

exports.muuri = MuuriStoryView;