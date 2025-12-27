/*\
title: $:/plugins/BTC/Muuri/modules/storyviews/muuri.js
type: application/javascript
module-type: storyview

Views the story as a Muuri grid (attribute-driven config, dev/master compatible)
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/* ----------------------------- Muuri loading ----------------------------- */

function ensureMuuriLoaded() {
	if (typeof window === "undefined") return;

	// Web Animations polyfill (Muuri drag animations)
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

function nextTickSafe(fn) {
	if ($tw && $tw.utils && typeof $tw.utils.nextTick === "function") return $tw.utils.nextTick(fn);
	return setTimeout(fn, 0);
}

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
	// Allow if no event info (safety) -> let Muuri decide
	if (!srcEvent) return true;

	// Pointer events: buttons bitmask (1 = primary/left)
	// During move, "button" can be -1, so "buttons" is the reliable one.
	if (typeof srcEvent.buttons === "number") {
		return srcEvent.buttons === 1;
	}

	// MouseEvent fallback: button (0 = left)
	if (typeof srcEvent.button === "number") {
		return srcEvent.button === 0;
	}

	// Old fallback: which (1 = left)
	if (typeof srcEvent.which === "number") {
		return srcEvent.which === 1;
	}

	return true;
}

function getMuuriGridElement(grid) {
	if (!grid) return null;
	if (typeof grid.getElement === "function") return grid.getElement();
	return grid._element || grid.element || null;
}

function isRightClickOrNonPrimaryPointer(e) {
	// Hard fail if right click, or if any non-primary buttons are held.
	// We use both helpers for robustness across event types.
	if (!e) return false;
	var se = e.srcEvent || e;
	if (isRightClickLike(se)) return true;
	return !isPrimaryButtonOnly(se);
}

// TW widgets often yield a leading TEXT_NODE (whitespace/newlines). Resolve first *element* node.
function firstElementDomNode(widget) {
	if (!widget || typeof widget.findFirstDomNode !== "function") return null;
	var n = widget.findFirstDomNode();
	while (n && n.nodeType === Node.TEXT_NODE) n = n.nextSibling;
	return (n && n.nodeType === Node.ELEMENT_NODE) ? n : null;
}

// Pick a grid constructor that actually creates instances with getItems/on/layout.
// Dev branch: MuuriModule.Grid
function resolveGridCtor(MuuriModule) {
	if (!MuuriModule) return null;

	if (MuuriModule.Grid && typeof MuuriModule.Grid === "function") return MuuriModule.Grid;

	// Older builds: module itself or default export might be the ctor
	var candidates = [];
	if (typeof MuuriModule === "function") candidates.push(MuuriModule);
	if (MuuriModule.default && typeof MuuriModule.default === "function") candidates.push(MuuriModule.default);
	if (MuuriModule.Muuri && typeof MuuriModule.Muuri === "function") candidates.push(MuuriModule.Muuri);

	// any function exports
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

		// Canonical Muuri namespace for statics (ItemDrag, AutoScroller, etc.)
		this.MuuriNS = (typeof window !== "undefined") ? window.MuuriModule : null;
		this.MuuriGridCtor = resolveGridCtor(this.MuuriNS);

		// State
		this.itemTitlesArray = [];
		this.connectedGrids = [];
		this.dragStartData = new Map();

		// Deferred sync after layout truly settles (including image loads / resizes)
		this._pendingSyncAfterLayout = false;
		this._pendingDropAction = null; // { title, modifier, srcEvent }
		this._layoutEndHandlerBound = false;

		// Debounce timer for "quiet window" settle detection
		this._settleTimer = null;

		// "quiet window" after last relevant event; minimum commit delay is max(animationDuration, settleDelay)
		this._settleDelay = 200;

		// Load/error listener for late-loading media inside items
		this._imageLoadListener = null;

		// Post-commit layout: after storylist write triggers TW refresh, wait animationDuration then layout
		this._postCommitLayoutTimer = null;
		this._postCommitLayoutInFlight = false;

		// Listener bookkeeping
		this._resizeObserver = null;
		this._resizeFallbackMap = new Map(); // element -> { obj, onResize, win, winListener }
		this._itemResizeHandlers = new Map(); // element -> fn
		this._layoutRAF = null;

		// iframe pointer-events toggle during drag
		this.iframePointerEventStyle = undefined;

		// iframe-detach fix bookkeeping: WeakMap<MuuriItem, Array<Stash>>
		this._detachedIframes = new WeakMap();

		// Mutation observer (self-heal when DOM gets weird)
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

	getGridElement(grid) {
		return getMuuriGridElement(grid || this.muuri);
	}

	getItemGridElement(item) {
		if (!item || typeof item.getGrid !== "function") return null;
		return this.getGridElement(item.getGrid());
	}

	/* ---------------- iframe detach/restore: reliable editor fix ---------------- */

	_detachIframesForItem(item) {
		if (!item || !item.element) return;
		if (this._detachedIframes.has(item)) return;

		var el = item.element;
		var iframes = el.querySelectorAll("iframe");
		if (!iframes || !iframes.length) return;

		var doc = el.ownerDocument;
		var body = doc && doc.body;
		if (!body) return;

		var stash = [];
		for (var i = 0; i < iframes.length; i++) {
			var iframe = iframes[i];
			if (!iframe || !iframe.parentNode) continue;

			var parent = iframe.parentNode;
			var nextSibling = iframe.nextSibling;

			// Placeholder keeps Muuri measurements stable.
			var placeholder = doc.createElement("div");
			placeholder.className = "tc-muuri-iframe-placeholder";

			// Lock placeholder height to current rendered height.
			var rect = iframe.getBoundingClientRect();
			var h = Math.max(50, rect.height || iframe.offsetHeight || 200);
			var w = Math.max(50, rect.width || iframe.offsetWidth || 300);

			placeholder.style.display = "block";
			placeholder.style.width = "100%";
			placeholder.style.height = h + "px";

			// Insert placeholder where iframe was.
			parent.insertBefore(placeholder, iframe);

			// Remember styles we will touch.
			var prev = {
				position: iframe.style.position || "",
				left: iframe.style.left || "",
				top: iframe.style.top || "",
				width: iframe.style.width || "",
				height: iframe.style.height || "",
				opacity: iframe.style.opacity || "",
				visibility: iframe.style.visibility || "",
				pointerEvents: iframe.style.pointerEvents || "",
				transform: iframe.style.transform || "",
				zIndex: iframe.style.zIndex || ""
			};

			// Move iframe to <body> BUT keep it "alive":
			// - NOT display:none
			// - NOT 0x0
			// - offscreen + invisible + non-interactive
			body.appendChild(iframe);
			iframe.style.position = "fixed";
			iframe.style.left = "-100000px";
			iframe.style.top = "0";
			iframe.style.width = w + "px";
			iframe.style.height = h + "px";
			iframe.style.opacity = "0";
			iframe.style.visibility = "hidden";
			iframe.style.pointerEvents = "none";
			iframe.style.transform = "none";
			iframe.style.zIndex = "-1";

			stash.push({
				iframe: iframe,
				parent: parent,
				nextSibling: nextSibling,
				placeholder: placeholder,
				prev: prev
			});
		}

		if (stash.length) this._detachedIframes.set(item, stash);
	}

	_restoreIframesForItem(item) {
		var stash = this._detachedIframes.get(item);
		if (!stash || !stash.length) return;

		for (var i = 0; i < stash.length; i++) {
			var s = stash[i];
			try {
				// Reinsert iframe where it came from.
				if (s.nextSibling && s.nextSibling.parentNode === s.parent) {
					s.parent.insertBefore(s.iframe, s.nextSibling);
				} else {
					s.parent.appendChild(s.iframe);
				}

				// Remove placeholder.
				if (s.placeholder && s.placeholder.parentNode) {
					s.placeholder.parentNode.removeChild(s.placeholder);
				}

				// Restore styles.
				var p = s.prev || {};
				s.iframe.style.position = p.position;
				s.iframe.style.left = p.left;
				s.iframe.style.top = p.top;
				s.iframe.style.width = p.width;
				s.iframe.style.height = p.height;
				s.iframe.style.opacity = p.opacity;
				s.iframe.style.visibility = p.visibility;
				s.iframe.style.pointerEvents = p.pointerEvents;
				s.iframe.style.transform = p.transform;
				s.iframe.style.zIndex = p.zIndex;

				// Kick editors that depend on resize/visibility observers.
				// (safe no-op if cross-origin)
				try {
					if (s.iframe.contentWindow) {
						s.iframe.contentWindow.dispatchEvent(new Event("resize"));
					}
				} catch (e) { }
			} catch (e2) { }
		}

		this._detachedIframes.delete(item);

		// Force Muuri to re-measure after iframe is back.
		this._requestLayout(true);
	}

	_restoreAllDetachedIframes() {
		// WeakMap not iterable; restore via current grid items
		if (!this.muuri || typeof this.muuri.getItems !== "function") return;
		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			this._restoreIframesForItem(items[i]);
		}
	}

	/* ---------------- attribute-driven configuration ---------------- */

	collectAttributes() {
		var lw = this.listWidget;
		this.animationDuration = $tw.utils.getAnimationDuration();
		this.attachEvent = lw.document.attachEvent;
		this.isIE = $tw.browser.isIE;

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

	/* ---------------- grid creation / wiring ---------------- */

	createMuuriGrid() {
		if (!this.MuuriGridCtor) {
			console.error("Muuri grid ctor not found. MuuriModule keys:", this.MuuriNS ? Object.keys(this.MuuriNS) : null);
			return false;
		}
		if (!this.listWidget.parentDomNode || !this.listWidget.parentDomNode.isConnected) return false;

		var domNode = this.listWidget.parentDomNode;
		domNode.setAttribute("data-grid", "muuri");

		var options = this.collectOptions();

		try {
			var grid = new this.MuuriGridCtor(domNode, options);
			if (!grid || typeof grid.getItems !== "function") {
				console.error("Muuri ctor produced non-grid instance:", grid);
				return false;
			}
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

				// HARD BLOCK: never start dragging from an iframe (editor)
				if (e && e.target && e.target.tagName === "IFRAME") return false;

				// Touch long-press gating
				if (self.dragEnabled && e.pointerType === "touch") {
					if (e.isFirst) {
						var contextMenuListener = function (ev) { ev.preventDefault(); };
						var touchMoveListener = function (ev) {
							var data = self.dragStartData.get(item);
							if (!data) return;

							if (data.dragAllowed) {
								ev.cancelable && ev.preventDefault();
							} else if (data.dragAllowed === undefined) {
								if (ev.cancelable && ev.timeStamp - data.startTimeStamp > 250) {
									data.dragAllowed = true;
									ev.preventDefault();
								} else {
									data.dragAllowed = false;
								}
							}
						};

						self.dragStartData.set(item, {
							dragAllowed: undefined,
							startTimeStamp: e.srcEvent.timeStamp,
							touchMoveListener: touchMoveListener,
							contextMenuListener: contextMenuListener
						});

						var parent = self.dragContainer ? self.dragContainer.parentNode : item.element.ownerDocument;
						if (parent && parent.addEventListener) {
							parent.addEventListener("touchmove", touchMoveListener, { passive: false, capture: true });
						}
						item.element.ownerDocument.defaultView.addEventListener("touchmove", touchMoveListener, { passive: false, capture: true });
						item.element.addEventListener("contextmenu", contextMenuListener);
						return undefined;
					}

					if (e.isFinal) {
						var data2 = self.dragStartData.get(item);
						if (data2) {
							var parent2 = self.dragContainer ? self.dragContainer.parentNode : item.element.ownerDocument;
							if (parent2 && parent2.removeEventListener) {
								parent2.removeEventListener("touchmove", data2.touchMoveListener, { passive: false, capture: true });
							}
							item.element.ownerDocument.defaultView.removeEventListener("touchmove", data2.touchMoveListener, { passive: false, capture: true });
							item.element.removeEventListener("contextmenu", data2.contextMenuListener);
							self.dragStartData.delete(item);
						}
						return undefined;
					}

					var data3 = self.dragStartData.get(item);
					return data3 ? data3.dragAllowed : undefined;
				}

				if (!self.dragEnabled) return undefined;

				// Desktop/mouse/pointer: only allow primary/left button.
				// Also blocks right/middle/extra buttons.
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

	unleashMuuriGrid() {
		var self = this;
		this.muuri.listWidget = this.listWidget;

		var gridEl = this.getGridElement();
		if (!gridEl) {
			try { this.muuri.destroy(true); } catch (e) { }
			this.findMuuriWidget().refreshSelf();
			return;
		}

		this.setupResizeObservation();

		// Watch for media loads inside the grid (captures late-loading images that change item size)
		this._imageLoadListener = function (ev) {
			var t = ev && ev.target;
			if (!t) return;

			if (t.tagName === "IMG" || t.tagName === "VIDEO" || t.tagName === "IFRAME") {
				// A load can change sizes -> trigger a layout
				self._requestLayout(false);

				// If we're in the middle of a drag-commit phase, push the quiet window forward
				if (self._pendingSyncAfterLayout) self._scheduleSettledSync();
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

		/* ---- Muuri events (NO chaining) ---- */

		this.muuri.on("dragInit", function (item) {
			// Reliable fix: detach iframes before Muuri starts reparenting/moving elements
			self._detachIframesForItem(item);

			// Optional: prevent interaction glitches while dragging
			self.inheritIframeEvents();

			// Preserve sizing (existing behavior)
			var style = item.element.style;
			var computed = item.element.ownerDocument.defaultView.getComputedStyle(item.element);
			style.paddingLeft = parseInt(computed.paddingLeft, 10) + "px";
			style.paddingTop = parseInt(computed.paddingTop, 10) + "px";
			style.paddingRight = parseInt(computed.paddingRight, 10) + "px";
			style.paddingBottom = parseInt(computed.paddingBottom, 10) + "px";
			style.marginBottom = parseInt(computed.marginBottom, 10) + "px";
			style.border = computed.border;
			style.width = item.width + "px";
			if ($tw.utils.hasClass(item.element, "tc-preserve-height")) style.height = item.height + "px";
		});

		this.muuri.on("dragEnd", function (item, event) {
			item.event = event;

			// Restore iframe(s) ASAP (some paths end here)
			self._restoreIframesForItem(item);

			self.restoreIframeEvents();
		});

		this.muuri.on("dragReleaseEnd", function (item) {
			// Restore again as safety net (some builds/edge cases skip dragEnd)
			self._restoreIframesForItem(item);

			self.onDragReleaseEnd(item);

			var style = item.element.style;
			style.paddingLeft = "";
			style.paddingTop = "";
			style.paddingRight = "";
			style.paddingBottom = "";
			style.marginBottom = "";
			style.border = "";
			style.width = "";
			style.height = "";

			// Ensure iframe pointer events are restored even if dragEnd didn’t run
			self.restoreIframeEvents();

			self.refreshMuuriGrid(true);
		});

		this.muuri.on("add", function () { gridEl.style.height = ""; });
		this.muuri.on("remove", function () { gridEl.style.height = ""; });

		this.muuri.on("beforeSend", function (data) {
			data.toGrid.refreshItems([data.item]);

			var toGridEl = getMuuriGridElement(data.toGrid);
			var toGridItems = data.toGrid.getItems();
			var toIndex = data.toIndex;
			var toGridItem = toGridItems[toIndex] || toGridItems[toIndex - 1] || toGridItems[toIndex + 1];

			var newWidth;
			if (toGridItem && toGridItem.isVisible()) {
				newWidth = self.listWidget.document.defaultView.getComputedStyle(toGridItem.element).width;
				data.item.element.style.width = newWidth;
			} else if (toGridEl) {
				newWidth = toGridEl.clientWidth;
				data.item.element.style.width = newWidth + "px";
			}
			data.toGrid.refreshItems([data.item]);
		});

		this.muuri.on("send", function (data) {
			data.item.fromGrid = data.fromGrid;
			data.toGrid.refreshItems([data.item]);

			var toGridEl2 = getMuuriGridElement(data.toGrid);
			var toGridItems2 = data.toGrid.getItems();
			var toIndex2 = data.toIndex;
			var toGridItem2 = toGridItems2[toIndex2];

			var newWidth;
			if (toGridItem2) {
				newWidth = self.listWidget.document.defaultView.getComputedStyle(toGridItem2.element).width;
				data.item.element.style.width = newWidth;
			} else if (toGridEl2) {
				newWidth = toGridEl2.offsetWidth;
				data.item.element.style.width = newWidth + "px";
			}
			data.toGrid.refreshItems([data.item]);
		});

		this.muuri.on("destroy", function () {
			// try to restore any detached iframes (best effort)
			try { self._restoreAllDetachedIframes(); } catch (e) { }
			self.removeAllListeners();
		});

		// One layoutEnd handler that nudges pending commits forward (debounced).
		this._bindLayoutEndCommitHandlerOnce();

		this.addSelfToGlobalGrids();

		/* ---- Mutation observer self-heal ---- */

		this.observer = new MutationObserver(function (mutations) {
			$tw.utils.each(mutations, function (mutation) {
				if (mutation.removedNodes) {
					var items2 = self.muuri.getItems();
					self.muuri.refreshItems();

					var needsRefresh = false;
					for (var i = 0; i < items2.length; i++) {
						if (items2[i].isVisible() && items2[i].width === 0 && items2[i].height === 0) {
							needsRefresh = true;
							break;
						}
					}

					if (needsRefresh) {
						try { self.observer.disconnect(); } catch (e) { }
						try { self.muuri.destroy(true); } catch (e2) { }
						self.findMuuriWidget().refreshSelf();
					}
				}
			});
		});
		this.observer.observe(gridEl, { attributes: true, childList: true, characterData: true });

		this.refreshEnd();
	}

	_makeRefreshHandler() {
		var self = this;
		return function () { self.refreshMuuriGrid(); };
	}

	/* ---------------- resize observation (modern + fallback) ---------------- */

	setupResizeObservation() {
		var self = this;
		if (typeof ResizeObserver !== "undefined") {
			this._resizeObserver = new ResizeObserver(function () {
				// Resizes should trigger a layout. If we are waiting to commit, layoutEnd will reschedule settle sync.
				self._requestLayout(false);
			});
		} else {
			this._resizeObserver = null;
		}
		this._layoutRAF = null;
	}

	_requestLayout(instant) {
		if (!this.muuri) return;
		if (this._layoutRAF) return;

		var win = this.listWidget.document.defaultView;
		var self = this;

		this._layoutRAF = win.requestAnimationFrame(function () {
			self._layoutRAF = null;
			self.refreshMuuriGrid(!!instant);
			// IMPORTANT: do NOT schedule settle-sync here.
			// We rely on real signals (layoutEnd / media load / onDragReleaseEnd) to avoid feedback loops.
		});
	}

	observeElementResize(element, fn) {
		if (!element) return;

		this._itemResizeHandlers.set(element, fn);

		if (this._resizeObserver) {
			try { this._resizeObserver.observe(element); } catch (e) { }
			return;
		}

		if (!element.__resizeListeners__) element.__resizeListeners__ = [];
		element.__resizeListeners__.push(fn);

		if (this._resizeFallbackMap.has(element)) return;

		if (this.attachEvent) {
			element.__resizeTrigger__ = element;
			var self = this;
			var onResize = function (e) { self.resizeListener(e); };
			element.attachEvent("onresize", onResize);
			this._resizeFallbackMap.set(element, { obj: null, onResize: onResize, win: null, winListener: null });
			return;
		}

		if (getComputedStyle(element).position === "static") element.style.position = "relative";
		var obj = this.listWidget.document.createElement("object");
		obj.setAttribute(
			"style",
			"display:block; position:absolute; top:0; left:0; height:100%; width:100%; overflow:hidden; pointer-events:none; z-index:-1;"
		);
		obj.__resizeElement__ = element;

		var self2 = this;
		obj.onload = function () {
			var w = obj.contentDocument && obj.contentDocument.defaultView;
			if (!w) return;
			w.__resizeTrigger__ = obj.__resizeElement__;
			var winListener = function (e) { self2.resizeListener(e); };
			w.addEventListener("resize", winListener);
			var existing = self2._resizeFallbackMap.get(element);
			if (existing) {
				existing.win = w;
				existing.winListener = winListener;
			}
		};
		obj.type = "text/html";
		obj.data = "about:blank";
		element.appendChild(obj);

		this._resizeFallbackMap.set(element, { obj: obj, onResize: null, win: null, winListener: null });
	}

	unobserveElementResize(element) {
		if (!element) return;

		if (this._resizeObserver) {
			try { this._resizeObserver.unobserve(element); } catch (e) { }
		}

		var fn = this._itemResizeHandlers.get(element);
		this._itemResizeHandlers.delete(element);

		if (element.__resizeListeners__ && fn) {
			var idx = element.__resizeListeners__.indexOf(fn);
			if (idx > -1) element.__resizeListeners__.splice(idx, 1);
		}

		var fb = this._resizeFallbackMap.get(element);
		if (fb) {
			if (this.attachEvent && fb.onResize) {
				try { element.detachEvent("onresize", fb.onResize); } catch (e) { }
			} else {
				if (fb.win && fb.winListener) {
					try { fb.win.removeEventListener("resize", fb.winListener); } catch (e2) { }
				}
				if (fb.obj && fb.obj.parentNode === element) {
					try { element.removeChild(fb.obj); } catch (e3) { }
				}
			}
			this._resizeFallbackMap.delete(element);
		}
	}

	resizeListener(e) {
		var win = e.target || e.srcElement;
		if (win.__resizeRAF__) $tw.pageScroller.cancelAnimationFrame.call(win, win.__resizeRAF__);
		win.__resizeRAF__ = $tw.pageScroller.requestAnimationFrame.call(win, function () {
			var trigger = win.__resizeTrigger__;
			if (!trigger || !trigger.__resizeListeners__) return;
			$tw.utils.each(trigger.__resizeListeners__, function (fn) { fn.call(trigger, e); });
		});
	}

	removeAllListeners() {
		if (!this.muuri) return;

		// restore any detached iframes as best effort
		try { this._restoreAllDetachedIframes(); } catch (e) { }

		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) this.unobserveElementResize(items[i].element);

		var gridEl = this.getGridElement();
		if (gridEl) this.unobserveElementResize(gridEl);

		// Remove image load listener
		if (gridEl && this._imageLoadListener) {
			try { gridEl.removeEventListener("load", this._imageLoadListener, true); } catch (e2) { }
			try { gridEl.removeEventListener("error", this._imageLoadListener, true); } catch (e3) { }
		}
		this._imageLoadListener = null;

		var win = this.listWidget && this.listWidget.document && this.listWidget.document.defaultView;

		// Clear settle timer
		if (win && this._settleTimer) {
			try { win.clearTimeout(this._settleTimer); } catch (e4) { }
		}
		this._settleTimer = null;

		// Clear post-commit layout timer
		if (win && this._postCommitLayoutTimer) {
			try { win.clearTimeout(this._postCommitLayoutTimer); } catch (e7) { }
		}
		this._postCommitLayoutTimer = null;
		this._postCommitLayoutInFlight = false;

		if (this._resizeObserver) {
			try { this._resizeObserver.disconnect(); } catch (e5) { }
			this._resizeObserver = null;
		}

		if (this.observer) {
			try { this.observer.disconnect(); } catch (e6) { }
			this.observer = null;
		}
	}

	/* ---------------- core behaviour ---------------- */

	refreshMuuriGrid(instant) {
		instant = !!instant;
		if (!this.muuri) return;
		this.muuri.refreshItems();
		this.muuri.layout(instant);
	}

	/* ---------------- global grids / connectivity ---------------- */

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

	/* ---------------- mapping items -> list widgets / titles ---------------- */

	findListWidget(element) {
		for (var i = 0; i < this.connectedGrids.length; i++) {
			var children = this.connectedGrids[i].listWidget.children;
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
		this.muuri.refreshItems();

		var items = this.muuri.getItems();
		var muuriItems = [];
		this.itemTitlesArray = [];

		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			if ((it.width !== 0 && it.height !== 0) || (it.element.offsetParent === null)) {
				this.itemTitlesArray.push(this.getItemTitle(it));
				muuriItems.push(it);
			} else {
				if (it.element && it.element.parentNode) it.element.parentNode.removeChild(it.element);
				else this.muuri.remove([it], { removeElements: true, layout: false });
			}
		}
		this.muuri.items = muuriItems;
	}

	synchronizeGrid() {
		this.refreshItemTitlesArray();
		this.muuri.synchronize();

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
			this.listWidget.wiki.setText(this.storyListTitle, this.storyListField, undefined, this.itemTitlesArray);
		}
	}

	/* ---------------- drag/drop + connected grids sync ---------------- */

	_isGridBusy() {
		if (!this.muuri || typeof this.muuri.getItems !== "function") return false;
		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			if (!it) continue;
			if (
				(it.isDragging && it.isDragging()) ||
				(it.isReleasing && it.isReleasing()) ||
				(it.isShowing && it.isShowing()) ||
				(it.isHiding && it.isHiding()) ||
				(it.isPositioning && it.isPositioning())
			) {
				return true;
			}
		}
		return false;
	}

	_schedulePostCommitLayout() {
		var self = this;
		var win = this.listWidget && this.listWidget.document && this.listWidget.document.defaultView;
		if (!win || !this.muuri) return;

		// Avoid stacking; we want the latest only.
		if (this._postCommitLayoutTimer) {
			try { win.clearTimeout(this._postCommitLayoutTimer); } catch (e) { }
			this._postCommitLayoutTimer = null;
		}

		// Prevent re-entrancy storms if multiple commits happen quickly.
		if (this._postCommitLayoutInFlight) return;
		this._postCommitLayoutInFlight = true;

		var delay = Math.max(this.animationDuration || 0, 0);

		this._postCommitLayoutTimer = win.setTimeout(function () {
			self._postCommitLayoutTimer = null;

			// Give TW one tick to finish DOM refresh / widget refresh cycle.
			nextTickSafe(function () {
				if (!self.muuri) { self._postCommitLayoutInFlight = false; return; }

				// Re-measure and layout after TW has applied DOM changes.
				self._requestLayout(false);

				// Release guard on next tick.
				nextTickSafe(function () {
					self._postCommitLayoutInFlight = false;
				});
			});
		}, delay);
	}

	_commitPendingSyncIfAny() {
		if (!this._pendingSyncAfterLayout) return;

		// If Muuri still animates/moves, don't commit yet.
		if (this._isGridBusy()) return;

		this._pendingSyncAfterLayout = false;

		this.detectConnectedGrids();

		// We assume sync/drop may trigger TW refresh; post-commit layout is cheap and stabilizes DOM changes.
		var mayHaveChangedStoryList = false;

		for (var k = 0; k < this.connectedGrids.length; k++) {
			var g = this.connectedGrids[k];
			if (g && typeof g.synchronizeGrid === "function") {
				g.synchronizeGrid();
				mayHaveChangedStoryList = true;
			}
		}

		if (this._pendingDropAction && this.dropActions) {
			var d = this._pendingDropAction;
			this._pendingDropAction = null;
			try {
				this.listWidget.invokeActionString(
					this.dropActions,
					this.listWidget,
					d.srcEvent,
					{ actionTiddler: d.title, modifier: d.modifier }
				);
				mayHaveChangedStoryList = true;
			} catch (e) { /* best effort */ }
		}

		// CRITICAL: after TW list updates, wait animationDuration, then layout.
		if (mayHaveChangedStoryList) {
			this._schedulePostCommitLayout();
		}
	}

	_scheduleSettledSync() {
		var self = this;
		var win = this.listWidget && this.listWidget.document && this.listWidget.document.defaultView;
		if (!win) return;

		// Minimum wait time after last signal:
		// - at least animationDuration (drag/layout animation)
		// - at least settleDelay (quiet window for late media/resizes)
		var delay = Math.max(this.animationDuration || 0, this._settleDelay || 0);

		if (this._settleTimer) {
			try { win.clearTimeout(this._settleTimer); } catch (e) { }
			this._settleTimer = null;
		}

		this._settleTimer = win.setTimeout(function () {
			self._settleTimer = null;

			// Next TW tick: attempt commit. If still busy or more changes come in, we will reschedule.
			nextTickSafe(function () {
				self._commitPendingSyncIfAny();
				if (self._pendingSyncAfterLayout) self._scheduleSettledSync();
			});
		}, delay);
	}

	_bindLayoutEndCommitHandlerOnce() {
		if (this._layoutEndHandlerBound) return;
		if (!this.muuri || typeof this.muuri.on !== "function") return;

		var self = this;
		this._layoutEndHandlerBound = true;

		this.muuri.on("layoutEnd", function () {
			if (!self._pendingSyncAfterLayout) return;
			// A layout finished; if there are more (due to images/resizes), we'll keep debouncing.
			self._scheduleSettledSync();
		});
	}

	onDragReleaseEnd(item) {
		if (!this.muuri) return;

		// Always clear the temp width (existing behavior)
		if (item && item.element && item.element.style) item.element.style.width = "";

		// Capture dropAction parameters NOW (event/title may be invalid later).
		this._pendingDropAction = null;
		if (item && item.fromGrid && item.fromGrid !== this.muuri && this.dropActions) {
			var srcEvent = item.event && item.event.srcEvent;
			var modifierKey = $tw.keyboardManager.getEventModifierKeyDescriptor(srcEvent);
			this._pendingDropAction = {
				title: this.getItemTitle(item),
				modifier: modifierKey,
				srcEvent: srcEvent
			};
		}

		// Defer synchronization until the layout truly settles (including late image loads).
		this._pendingSyncAfterLayout = true;

		// Ensure handler is bound and connections are up to date.
		this._bindLayoutEndCommitHandlerOnce();
		this.detectConnectedGrids();

		// Kick a layout pass and start the quiet window (minimum = animationDuration).
		this._requestLayout(false);
		this._scheduleSettledSync();
	}

	/* ---------------- list lifecycle methods ---------------- */

	insert(widget) {
		var targetElement = firstElementDomNode(widget);
		if (!targetElement) return;
		if (!this.muuri) return;

		this.refreshItemTitlesArray();

		var itemTitle = widget.parseTreeNode.itemTitle;
		var targetIndex = this.listWidget.findListItem(0, itemTitle);

		var existingIndex = this.itemTitlesArray.indexOf(itemTitle);
		if (existingIndex !== -1) {
			var items = this.muuri.getItems();
			this.muuri.remove([items[existingIndex]], { removeElements: true });
			this.muuri.refreshItems();
		}

		this.muuri.add(targetElement, { index: targetIndex, instant: true });
		this.observeElementResize(targetElement, this._makeRefreshHandler());

		this.refreshItemTitlesArray();
	}

	remove(widget) {
		var targetElement = firstElementDomNode(widget);
		var removeElement = function () { widget ? widget.removeChildDomNodes() : null; };

		try { removeElement(); } catch (e) { }

		if (!targetElement) return;
		if (!this.muuri) return;

		this.unobserveElementResize(targetElement);

		this.refreshItemTitlesArray();
		this.muuri.refreshItems();

		var items = this.muuri.getItems();
		for (var i = 0; i < items.length; i++) {
			if (items[i].element === targetElement) {
				this.muuri.remove([items[i]], { removeElements: true, layout: false });
				break;
			}
		}
		this.muuri.layout();
	}

	navigateTo(historyInfo) {
		var idx = this.listWidget.findListItem(0, historyInfo.title);
		if (idx === undefined) return;

		var listItemWidget = this.listWidget.children[idx];
		var targetElement = firstElementDomNode(listItemWidget);
		if (!targetElement) return;

		setTimeout(function () {
			$tw.utils.removeClass(targetElement, "tc-navigating-to");
		}, $tw.utils.getAnimationDuration());

		$tw.utils.addClass(targetElement, "tc-navigating-to");
		this.listWidget.dispatchEvent({ type: "tm-scroll", target: targetElement });
	}

	/* ---------------- filtering ---------------- */

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

	/* ---------------- misc helpers ---------------- */

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

	restoreIframeEvents() {
		if (this.iframePointerEventStyle === undefined) return;
		var iframes = this.listWidget.document.querySelectorAll("iframe");
		for (var i = 0; i < iframes.length; i++) {
			iframes[i].style["pointer-events"] = this.iframePointerEventStyle;
		}
		this.iframePointerEventStyle = undefined;
	}

	inheritIframeEvents() {
		var iframes = this.listWidget.document.querySelectorAll("iframe");
		for (var i = 0; i < iframes.length; i++) {
			if (iframes[i]) {
				if (this.iframePointerEventStyle === undefined) {
					this.iframePointerEventStyle = iframes[i].style["pointer-events"];
				}
				iframes[i].style["pointer-events"] = "none";
			}
		}
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

	/* ---------------- refresh lifecycle hooks ---------------- */

	refreshStart(changedTiddlers, changedAttributes) {
		var before = {
			containerClass: this.containerClass,
			itemClass: this.itemClass,
			itemSelector: this.itemSelector
		};

		this.collectAttributes();

		if (this.muuri && changedTiddlers["$:/config/AnimationDuration"]) {
			this.animationDuration = $tw.utils.getAnimationDuration();
			this.muuri.updateSettings({ showDuration: this.animationDuration, layoutDuration: this.animationDuration });
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

			if (changedAttributes["muuri-layout-horizontal"] ||
				changedAttributes["muuri-align-right"] ||
				changedAttributes["muuri-align-bottom"]) {
				var gridEl = this.getGridElement();
				if (gridEl) { gridEl.style.width = ""; gridEl.style.height = ""; }
				this.refreshMuuriGrid();
			}
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
			if (this.observer) { try { this.observer.disconnect(); } catch (e) { } }
		}

		if (structuralChange) {
			if (this.observer) { try { this.observer.disconnect(); } catch (e2) { } }
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
	}
}

exports.muuri = MuuriStoryView;
