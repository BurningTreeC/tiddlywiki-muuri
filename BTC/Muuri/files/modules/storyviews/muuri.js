/*\
title: $:/plugins/BTC/Muuri/modules/storyviews/muuri.js
type: application/javascript
module-type: storyview

Views the story as a muuri grid

\*/
(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var easing = "cubic-bezier(0.215, 0.61, 0.355, 1)";

if(typeof window !== "undefined") {
	var testElement = document.body;
	if(!("animate" in testElement)) {
		require("$:/plugins/BTC/Muuri/library/web-animations-polyfill.js");
	}
	if(!window.Muuri) {
		window.Muuri = require("$:/plugins/BTC/Muuri/library/muuri.min.js");
	}
	if($tw.Grids === undefined) {
		$tw.Grids = [];
	}
}

var MuuriStoryView = function(listWidget) {
	var self = this;
	this.listWidget = listWidget;
	this.itemTitlesArray = [];
	this.connectedGrids = [];
	this.collectAttributes();
	if(this.itemTemplate && this.itemEditTemplate) {
		this.muuri = this.createMuuriGrid();
		if(this.muuri) {
			this.muuri.listWidget = listWidget;
			var items = this.muuri.getItems();
			for(var i=0; i<items.length; i++) {
				var element = items[i].getElement();
				this.itemTitlesArray.push(this.getItemTitle(items[i]));
				this.addResizeListener(element,function() {
					self.refreshMuuriGrid();
				});
			}
			this.addResizeListener(self.muuri._element,function() {
				self.refreshMuuriGrid();
			});
			this.muuri.synchronizeGrid = function() {
				self.synchronizeGrid();
			}
			this.muuri.on("dragReleaseEnd",function(item) {
				self.onDragReleaseEnd(item);
				var style = item.getElement().style;
				style.width = '';
				style.height = '';
				//self.refreshMuuriGrid();
				self.muuri.refreshItems([item]);
			})
			.on("add",function(items) {
				self.updateZIndexList();
				self.muuri._element.style.height = "";
			})
			.on("remove",function(items) {
				self.updateZIndexList();
				self.muuri._element.style.height = "";
			})
			.on("dragInit",function(item,event) {
				self.inheritIframeEvents();
				var style = item.getElement().style;
				style.width = item.getWidth() + 'px';
				style.height = item.getHeight() + 'px';
			})
			.on("dragStart",function(item,event) {

			})
			.on("dragEnd",function(item,event) {
				item.event = event;
				self.restoreIframeEvents();
			})
			.on("layoutStart",function() {
			})
			.on("layoutEnd",function(items) {
				var isDragging = false;
				for(var i=0; i<items.length; i++) {
					if(items[i].isDragging()) {
						isDragging = true;
						break;
					}
				}
				if(!isDragging) {
					self.updateZIndexList();
				}
			})
			.on("layoutAbort",function(items) {

			})
			.on("beforeSend",function(data) {
				data.toGrid.refreshItems([data.item]);
			})
			.on("send",function(data) {
				data.item.fromGrid = data.fromGrid;
			})
			.on("beforeReceive",function(data) {

			})
			.on("receive",function(data) {

			});
			this.addSelfToGlobalGrids();
			this.updateZIndexList();
			this.observer = new MutationObserver(function(mutations) {
				$tw.utils.each(mutations,function(mutation) {
					if(mutation.removedNodes) {
						var items = self.muuri.getItems();
						self.muuri.refreshItems();
						var newItems = self.muuri.getItems();
						var needsRefresh = false;
						for(var i=0; i<items.length; i++) {
							if(items[i]._width === 0 && items[i]._height === 0) {
								needsRefresh = true;
							}
						}
						if(needsRefresh) {
							self.observer.disconnect();
							self.muuri.destroy(true);
							self.listWidget.parentWidget.refreshSelf();
						}
					}
				});
			});
			this.observer.observe(this.muuri._element,{attributes: true, childList: true, characterData: true});
		}
	}
};

MuuriStoryView.prototype.updateGlobalGrids = function() {
	var foundGridElements = this.listWidget.document.documentElement.querySelectorAll('[data-grid="muuri"]');
	for(var i=0; i<$tw.Grids.length; i++) {
		var globalGridElement = $tw.Grids[i]._element;
		var foundGrid = false;
		for(var k=0; k<foundGridElements.length; k++) {
			if(globalGridElement === foundGridElements[k]) {
				foundGrid = true;
			}
		}
		if(!foundGrid) {
			$tw.Grids.splice(i,1);
		}
	}
};

MuuriStoryView.prototype.detectConnectedGrids = function() {
	var connectedGridElements = this.listWidget.document.documentElement.querySelectorAll(this.connectionSelector);
	var connectedGrids = [];
	this.updateGlobalGrids();
	for(var i=0; i<$tw.Grids.length; i++) {
		for(var k=0; k<connectedGridElements.length; k++) {
			if($tw.Grids[i]._element === connectedGridElements[k]) {
				connectedGrids.push($tw.Grids[i]);
			}
		}
	}
	var selfIsAdded = false;
	for(i=0; i<connectedGrids.length; i++) {
		if(connectedGrids[i]._element === this.muuri._element) {
			selfIsAdded = true;
		}
	}
	if(!selfIsAdded) {
		connectedGrids.push(this.muuri);
	}
	connectedGrids.sort(function(a,b) {
		return a._id - b._id;
	});
	this.connectedGrids = connectedGrids;
};

MuuriStoryView.prototype.addSelfToGlobalGrids = function() {
	var foundGrid = false;
	for(var i=0; i<$tw.Grids.length;i++) {
		var globalGrid = $tw.Grids[i];
		if(globalGrid._element === this.muuri._element) {
			foundGrid = true;
		}
	}
	if(!foundGrid) {
		$tw.utils.pushTop($tw.Grids,this.muuri);
	}
};

MuuriStoryView.prototype.onDragReleaseEnd = function(item) {
	var self = this;
	var items = this.muuri.getItems(),
		isReleasing = false;
	for (var i=0; i<items.length; i++) {
		if(items[i].isDragging() || items[i].isReleasing() || items[i].isShowing() || items[i].isHiding()) {
			isReleasing = true;
		}
	}
	// Important: detect connected Grids first
	this.detectConnectedGrids();
	if(isReleasing === false) {
		for(var k=0; k<this.connectedGrids.length; k++) {
			this.connectedGrids[k].synchronizeGrid();
		}
	}
	if(item.fromGrid && item.fromGrid !== this.muuri && this.dropActions) {
		var modifierKey = $tw.keyboardManager.getEventModifierKeyDescriptor(item.event.srcEvent);
		this.listWidget.invokeActionString(this.dropActions,this.listWidget,item.event.srcEvent,{actionTiddler: this.getItemTitle(item), modifier: modifierKey});
	}
};

// From stackoverflow https://stackoverflow.com/questions/35939886/find-first-scrollable-parent
MuuriStoryView.prototype.getScrollContainer = function (element,includeHidden) {
	var style = getComputedStyle(element);
	var excludeStaticParent = style.position === "absolute";
	var overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;

	if (style.position === "fixed") return this.listWidget.document.body;
	for (var parent = element; (parent = parent.parentElement);) {
		style = getComputedStyle(parent);
		if (excludeStaticParent && style.position === "static") {
			continue;
		}
		if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) return parent;
	}
	return this.listWidget.document.body;
};

MuuriStoryView.prototype.synchronizeGrid = function() {
	this.refreshItemTitlesArray();
	this.muuri.synchronize();
	var hasChanged = false;
	if(this.itemTitlesArray.length !== this.listWidget.list.length) {
		hasChanged = true;
	} else {
		for(var i=0; i<this.itemTitlesArray.length; i++) {
			if(this.itemTitlesArray[i] !== this.listWidget.list[i]) {
				hasChanged = true;
				break;
			}
		}
	}
	if(this.storyListTitle && hasChanged && this.itemTitlesArray.indexOf(undefined) === -1 && this.itemTitlesArray.indexOf(null) === -1) {
		this.listWidget.wiki.setText(this.storyListTitle,this.storyListField,undefined,this.itemTitlesArray);
	}
};

MuuriStoryView.prototype.refreshItemTitlesArray = function() {
	this.muuri.refreshItems();
	var items = this.muuri.getItems(),
		muuriItems = [];
	this.itemTitlesArray = [];
	for(var i=0; i<items.length; i++) {
		if(items[i]._width !== 0 && items[i]._height !== 0) {
			this.itemTitlesArray.push(this.getItemTitle(items[i]));
			muuriItems.push(items[i]);
		} else {
			if(items[i]._element && items[i]._element.parentNode) {
				items[i]._element.parentNode.removeChild(items[i]._element);
			} else {
				this.muuri.remove([items[i]],{removeElements: true,layout: false});
			}
		}
	}
	this.muuri._items = muuriItems;
};

MuuriStoryView.prototype.insert = function(widget) {
	var self = this;
	var targetElement = widget.findFirstDomNode();
	if(!(targetElement instanceof Element)) {
		return;
	}
	if(this.muuri) {
		this.refreshItemTitlesArray();
		var itemTitle = widget.parseTreeNode.itemTitle;
		var targetIndex = this.listWidget.findListItem(0,itemTitle);
		if(this.itemTitlesArray.indexOf(itemTitle) !== -1) {
			var index = this.itemTitlesArray.indexOf(itemTitle);
			//this.muuri._items.splice(index,1);
			var items = this.muuri.getItems();
			this.muuri.remove([items[index]],{removeElements: true});
			this.muuri.refreshItems();
		}
		this.muuri.add(targetElement,{index: targetIndex, instant: true});
		this.addResizeListener(targetElement,function() {
			self.refreshMuuriGrid();
		});
		this.refreshItemTitlesArray();
	}
};

MuuriStoryView.prototype.remove = function(widget) {
	var self = this;
	var targetElement = widget.findFirstDomNode();
	var removeElement = function() {
		widget ? widget.removeChildDomNodes() : null;
	};
	if(!targetElement instanceof Element) {
		removeElement();
		return;
	}
	try {
		removeElement();
	} catch(e) {}
	if(this.muuri) {
		this.removeResizeListener(targetElement,function() {
			self.refreshMuuriGrid();
		});
		this.refreshItemTitlesArray();
		this.muuri.refreshItems();
		this.muuri.remove([targetElement],{removeElements: true});
		this.muuri.layout();
	}
};

MuuriStoryView.prototype.navigateTo = function(historyInfo) {
	var listElementIndex = this.listWidget.findListItem(0,historyInfo.title);
	if(listElementIndex === undefined) {
		return;
	}
	var listItemWidget = this.listWidget.children[listElementIndex],
		targetElement = listItemWidget.findFirstDomNode();
	// Abandon if the list entry isn"t a DOM element (it might be a text node)
	if(!(targetElement instanceof Element)) {
		return;
	}
	// Scroll the node into view
	this.listWidget.dispatchEvent({type: "tm-scroll", target: targetElement});
};

MuuriStoryView.prototype.createMuuriGrid = function() {
	var options = this.collectOptions();
	var domNode = this.listWidget.parentDomNode;
	if(domNode) {
		domNode.setAttribute("data-grid","muuri");
		try {
			return new Muuri(domNode,options);
		} catch(e) {
			return false;
		}
	}
	return false;
};

MuuriStoryView.prototype.collectOptions = function() {
	var self = this;
	return {
		items: self.itemSelector,
		dragContainer: self.dragContainer,
		dragEnabled: self.dragEnabled,
		dragHandle: self.dragHandle,
		dragSortPredicate: {
			action: self.dragSortAction,
			threshold: self.dragSortThreshold
		},
		dragSortHeuristics: {
			sortInterval: self.dragSortHeuristicsInterval
		},
		layout: {
			fillGaps: false,
			horizontal: false,
			alignRight: self.alignRight,
			alignBottom: self.alignBottom,
			rounding: true
		},
		layoutEasing: easing,
		dragStartPredicate: function(item,e) {
			if (self.muuri._settings.dragEnabled) {
				if((e.target && e.target.tagName && (self.noDragTags.indexOf(e.target.tagName) > -1 || 
					self.lookupDragTarget(e.target)) || self.detectWithinCodemirror(e) || !self.detectGridWithinGrid(e.target))) {
					return false;
				} else {
					return Muuri.ItemDrag.defaultStartPredicate(item,e);
				}
			} else {
				return false;
			}
		},
		dragSort: function() {
			self.detectConnectedGrids();
			return self.connectedGrids;
		},
		dragRelease: {
			duration: self.animationDuration,
			easing: easing,
			useDragContainer: true
		},
		dragSortInterval: self.dragSortInterval,
		showDuration: self.animationDuration,
		layoutDurattion: self.animationDuration,
		layoutOnResize: true,
		layoutOnInit: true,
		containerClass: self.containerClass,
		itemClass: self.itemClass,
		itemDraggingClass: "tc-muuri-dragging",
		itemReleasingClass: "tc-muuri-releasing",
		itemPositioningClass: "tc-muuri-positioning"
	};
};

MuuriStoryView.prototype.collectAttributes = function() {
	this.animationDuration = $tw.utils.getAnimationDuration();
	this.attachEvent = this.listWidget.document.attachEvent;
	this.isIE = $tw.browser.isIE;
	this.configNamespace = this.listWidget.getAttribute("storyViewConfig","$:/config/muuri/storyview/");
	this.itemTemplate = this.listWidget.getAttribute("template");
	this.itemEditTemplate = this.listWidget.getAttribute("editTemplate");
	this.noDragTags = ["input","INPUT","textarea","TEXTAREA","button","BUTTON","select","SELECT","a","A"];
	this.containerClass = this.listWidget.wiki.getTiddlerText(this.configNamespace + "container-class") || "tc-muuri-river";
	var itemClass = this.listWidget.wiki.getTiddlerText(this.configNamespace + "item-class") || "tc-tiddler-frame";
	if(itemClass === undefined || itemClass === "" || itemClass === "*") {
		this.itemSelector = "*";
		this.itemClass = "tc-muuri-item";
	} else {
		var classes = itemClass.split(" ");
		this.itemSelector = "." + classes[0];
		this.itemClass = classes[0];
	}
	this.dragSortAction = this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-action") || "move";
	this.dragSortThreshold = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-threshold")) || 40;
	this.dragSortHeuristicsInterval = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-heuristics-interval")) || 100;
	var dragHandle = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-handle");
	if(dragHandle === "" || dragHandle === undefined) {
		dragHandle = null;
	}
	this.dragHandle = dragHandle;
	var dragContainerSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-container");
	this.dragContainer = this.listWidget.document.documentElement.querySelector(dragContainerSelector);
	this.alignRight = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-right") !== "no";
	this.alignBottom = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-bottom") === "yes";
	this.dragEnabled = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-enabled") !== "no";
	this.storyListTitle = this.listWidget.getVariable("tv-muuri-story-list") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist");
	this.storyListField = this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist-field") || "list";
	this.zIndexTiddler = this.listWidget.wiki.getTiddlerText(this.configNamespace + "zindex-tiddler");
	this.connectionSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "connection-selector");
	this.dropActions = this.listWidget.getVariable("tv-muuri-drop-actions") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "drop-actions");
};

MuuriStoryView.prototype.findListWidget = function(element) {
	for(var i=0; i<this.connectedGrids.length; i++) {
		var listWidgetChildren = this.connectedGrids[i].listWidget.children;
		//find the widget corresponding to this element
		for(var k=0; k<listWidgetChildren.length; k++) {
			var listElement = listWidgetChildren[k] ? listWidgetChildren[k].findFirstDomNode() : null;
			if(listElement && (listElement === element)) {
				return(listWidgetChildren[k]);
			}
		}
	}
	return null;
};

MuuriStoryView.prototype.getItemTitle = function(item) {
	var element = item._element;
	var widget = this.findListWidget(element);
	return widget ? widget.parseTreeNode.itemTitle : null;
};

MuuriStoryView.prototype.detectWithinCodemirror = function(event) {
	var node = event.target;
	while(node) {
		if(node.classList && ((node.classList.contains("CodeMirror-scroll")) || (node.classList.contains("CodeMirror")))) {
			return true;
		}
		node = node.parentNode;
	}
	return false;
};

MuuriStoryView.prototype.detectGridWithinGrid = function(element) {
	var gridNode = this.muuri.getItems()[0] ? this.muuri.getItems()[0].getGrid()._element : null;
	if(!gridNode) {
		return true;
	}
	var elementChildNodes = element.childNodes;
	var isCurrentGrid = false,
		foundGrid = false;
	if(elementChildNodes.length === 0) {
		return true;
	}
	$tw.utils.each(elementChildNodes,function(node) {
		while(node && !foundGrid) {
			if(node instanceof Element && node.getAttribute("data-grid") === "muuri") {
				// dragging within a grid
				// detect if the found grid is the current grid node
				if(node !== gridNode) {
					foundGrid = true;
					isCurrentGrid = false;
				} else {
					isCurrentGrid = true;
					foundGrid = true;
				}
			}
			node = node.parentNode;
		}
	});
	return isCurrentGrid;
};

MuuriStoryView.prototype.lookupDragTarget = function(element) {
	var count = 0,
		node = element.parentNode;
	while(node && count < 10) {
		if(this.noDragTags.indexOf(node.tagName) > -1) {
			return true;
		}
		node = node.parentNode;
		count += 1;
	}
	return false;
};

MuuriStoryView.prototype.updateZIndexList = function(options) {
	var self = this;
	if(this.zIndexTiddler) {
		options = options || {};
		//do something that updates z-indices
		this.muuri.refreshItems(); //important
		var items = this.muuri.getItems();
		var itemColumns = [];
		var sortedArray = [];
		//get the x-coordinates for each column
		for(var i=0; i<items.length; i++) {
			var itemColumnsValue = items[i]._left !== null && items[i]._left !== undefined ? items[i]._left : items[i]._layout._currentLeft;
			if(itemColumns.indexOf(itemColumnsValue) === -1) {
				itemColumns.push(itemColumnsValue);
			}
		}
		//sort the columns left-to-right
		itemColumns.sort(function(valueA,valueB) {
			if(valueA >= valueB) return 1;
			if(valueA < valueB) return -1;
			return 0;
		});
		//now for each column, get the items that are members of it,
		//push to a temporary array
		//sort the temp array items so that by their _currentTop lowest to highest
		//push the sorted items to the final sortedItems array
		$tw.utils.each(itemColumns,function(columnValue) {
			var columnMembers = [];
			for(var k=0; k<items.length; k++) {
				var currLeft = items[k]._left !== null && items[k]._left !== undefined ? items[k]._left : items[k]._layout._currentLeft;
				if(currLeft === columnValue || (currLeft >= (columnValue - 5) && currLeft <= columnValue)) {
					// there's a small variation when item positions have not yet been fully
					// refreshed after they've moved ... some pixels, though they're still in
					// the same column
					// because of the min-width on tiddlers, 5px should be ok
					columnMembers.push(items[k]);
				}
			}
			columnMembers.sort(function(itemA,itemB) {
				var valueA = itemA._layout._currentTop !== null && itemA._layout._currentTop !== undefined ? itemA._layout._currentTop : itemA._top,
					valueB = itemB._layout._currentTop !== null && itemB._layout._currentTop !== undefined ? itemB._layout._currentTop : itemB._top;
				if(valueA >= valueB) return 1;
				if(valueA < valueB) return -1;
				return 0;
			});
			self.detectConnectedGrids();
			for(k=0; k<columnMembers.length; k++) {
				var itemTitle = self.getItemTitle(columnMembers[k]);
				sortedArray.push(itemTitle);
			}
		});
		//store the array in a tiddler-list that's used for applying z-indices
		if(sortedArray.indexOf(null) === -1) {
			var tiddler = this.listWidget.wiki.getTiddler(this.zIndexTiddler);
			this.listWidget.wiki.addTiddler(new $tw.Tiddler(
				this.listWidget.wiki.getCreationFields(),
				{title: this.zIndexTiddler},
				tiddler,
				{list: sortedArray},
				this.listWidget.wiki.getModificationFields()
			));
		}
	}
};

MuuriStoryView.prototype.restoreIframeEvents = function() {
	if(this.iframePointerEventStyle !== undefined) {
		var iframes = this.listWidget.document.querySelectorAll("iframe");
		for(var i=0; i<iframes.length; i++) {
			iframes[i].style["pointer-events"] = this.iframePointerEventStyle;
		}
		this.iframePointerEventStyle = undefined;
	}
};

MuuriStoryView.prototype.inheritIframeEvents = function() {
	var iframes = this.listWidget.document.querySelectorAll("iframe");
	for(var i=0; i<iframes.length; i++) {
		if(iframes[i]) {
			if(this.iframePointerEventStyle === undefined) {
				this.iframePointerEventStyle = iframes[i].style["pointer-events"];
			}
			iframes[i].style["pointer-events"] = "none";
		}
	}
};

MuuriStoryView.prototype.isNode = function(o) {
	return (
		typeof Node === "object" ? o instanceof Node : o && typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName==="string"
	);
};

MuuriStoryView.prototype.resizeListener = function(e) {
	var win = e.target || e.srcElement;
	if (win.__resizeRAF__) $tw.pageScroller.cancelAnimationFrame.call(win,win.__resizeRAF__);
	win.__resizeRAF__ = $tw.pageScroller.requestAnimationFrame.call(win,function(){
		var trigger = win.__resizeTrigger__;
		$tw.utils.each(trigger.__resizeListeners__,function(fn){
			fn.call(trigger, e);
		});
	});
};

MuuriStoryView.prototype.addResizeListener = function(element,fn) {
	var self = this;
	if(element) {
		if(!element.__resizeListeners__) {
			element.__resizeListeners__ = [];
			if(this.attachEvent) {
				element.__resizeTrigger__ = element;
				element.attachEvent('onresize',self.resizeListener);
			}
			else {
				if(getComputedStyle(element).position == 'static') element.style.position = 'relative';
				var obj = element.__resizeTrigger__ = self.listWidget.document.createElement('object');
				obj.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
				obj.__resizeElement__ = element;
				obj.onload = function(e) {
					obj.contentDocument.defaultView.__resizeTrigger__ = obj.__resizeElement__;
					obj.contentDocument.defaultView.addEventListener("resize",self.resizeListener);
				};
				obj.type = 'text/html';
				if(self.isIE) element.appendChild(obj);
				obj.data = 'about:blank';
				if(!self.isIE) element.appendChild(obj);
			}
			element.__resizeListeners__.push(fn);
		} else {
			element.__resizeListeners__.push(fn);
		}
	}
};

MuuriStoryView.prototype.removeResizeListener = function(element,fn) {
	if(element) {
		if(!element.__resizeListeners__) {
			element.__resizeListeners__ = [];
		}
		element.__resizeListeners__.splice(element.__resizeListeners__.indexOf(fn), 1);
		if(!element.__resizeListeners__.length) {
			if(this.attachEvent) element.detachEvent('onresize', this.resizeListener);
			else {
				this.listWidget.document.defaultView.removeEventListener('resize', this.resizeListener);
				element.__resizeTrigger__ = this.isNode(element.__resizeTrigger__) && element.__resizeTrigger__ !== undefined ? !element.removeChild(element.__resizeTrigger__) : undefined;
			}
		}
	}
};

MuuriStoryView.prototype.refreshMuuriGrid = function(item) {
	this.muuri.refreshItems();
	this.muuri._refreshDimensions();
	this.muuri.layout(); //no .layout(true), make tiddlers move, not jump instantly
};

MuuriStoryView.prototype.hardRefresh = function() {
	var items = this.muuri.getItems();
	var elements = [];
	for(var i=0; i<items.length; i++) {
		elements.push(items[i]._element);
	}
	this.muuri.remove(items,{removeElements:true,layout:false});
	this.muuri.add(elements,{layout:false, instant: true});
	this.muuri.layout(true);
};

MuuriStoryView.prototype.refreshStart = function(changedTiddlers,changedAttributes) {
	var self = this;
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-enabled"]) {
		this.muuri._settings.dragEnabled = this.dragEnabled = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-enabled") !== "no";
		this.hardRefresh();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-handle"]) {
		var dragHandle = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-handle");
		if(dragHandle === "" || dragHandle === undefined) {
			dragHandle = null;
		}
		this.muuri._settings.dragHandle = this.dragHandle = dragHandle;
		this.hardRefresh();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "align-right"]) {
		this.muuri._settings.layout.alignRight = this.alignRight = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-right") !== "no";
		this.refreshMuuriGrid();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "align-bottom"]) {
		this.muuri._settings.layout.alignBottom = this.alignBottom = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-bottom") === "yes";
		this.refreshMuuriGrid();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-action"]) {
		this.muuri._settings.dragSortPredicate.action = this.dragSortAction = this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-action") || "move";
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-threshold"]) {
		this.muuri._settings.dragSortPredicate.threshold = this.dragSortThreshold = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-threshold")) || 40;
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-heuristics-interval"]) {
		this.muuri._settings.dragSortHeuristics.sortInterval = this.dragSortHeuristicsInterval = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-heuristics-interval")) || 100;
	}
	if(changedTiddlers[this.configNamespace + "storylist"]) {
		this.storyListTitle = this.listWidget.getVariable("tv-muuri-story-list") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist");
	}
	if(changedTiddlers[this.configNamespace + "storylist-field"]) {
		this.storyListField = this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist-field") || "list";
	}
	if(changedTiddlers[this.configNamespace + "zindex-tiddler"]) {
		this.zIndexTiddler = this.listWidget.wiki.getTiddlerText(this.configNamespace + "zindex-tiddler");
	}
	if(changedTiddlers[this.configNamespace + "connection-selector"]) {
		this.connectionSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "connection-selector");
	}
	if(changedTiddlers[this.configNamespace + "drop-actions"]) {
		this.dropActions = this.listWidget.getVariable("tv-muuri-drop-actions") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "drop-actions");
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-container"]) {
		var dragContainerSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-container");
		this.muuri._settings.dragContainer = this.dragContainer = this.listWidget.document.documentElement.querySelector(dragContainerSelector);
	}
	if(this.muuri && (changedTiddlers[this.configNamespace + "container-class"] || changedTiddlers[this.configNamespace + "item-class"])) {
		this.muuri.destroy(true);
		this.listWidget.parentWidget.refreshSelf();
	}
	if(this.muuri && changedTiddlers["$:/config/AnimationDuration"]) {
		this.muuri._settings.showDuration = this.muuri._settings.layoutDuration = this.animationDuration = $tw.utils.getAnimationDuration();
	}
	if(changedTiddlers[this.itemTemplate] || changedTiddlers[this.itemEditTemplate]) {
		setTimeout(function(){
			if(self.muuri) {
				self.muuri.destroy(true);
			}
			self.listWidget.parentWidget.refreshSelf();
		},100);
	}
	if(changedAttributes.storyViewConfig) {
		this.listWidget.refreshSelf();
	}
	return true;
};

exports.muuri = MuuriStoryView;

})();