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
	this.muuri = this.createMuuriGrid();
	if(this.muuri) {
		this.unleashMuuriGrid(listWidget);
	} else {
		setTimeout(function() {
			self.muuri = self.createMuuriGrid();
			if(self.muuri) {
				self.unleashMuuriGrid(listWidget);
			}
		},$tw.utils.getAnimationDuration());
	}
};

MuuriStoryView.prototype.unleashMuuriGrid = function(listWidget) {
	var self = this;
	this.muuri.listWidget = listWidget;
	var items = this.muuri.getItems();
	for(var i=0; i<items.length; i++) {
		var element = items[i].element;
		this.itemTitlesArray.push(this.getItemTitle(items[i]));
		this.addResizeListener(element,function() {
			self.refreshMuuriGrid();
		});
	}
	this.addResizeListener(self.muuri.element,function() {
		self.refreshMuuriGrid();
	});
	this.muuri.synchronizeGrid = function() {
		self.synchronizeGrid();
	}
	this.muuri.on("dragReleaseEnd",function(item) {
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
		self.refreshMuuriGrid(true);
		//self.muuri.refreshItems([item]);
	})
	.on("add",function(items) {
		self.muuri.element.style.height = "";
	})
	.on("remove",function(items) {
		self.muuri.element.style.height = "";
	})
	.on("dragInit",function(item,event) {
		self.inheritIframeEvents();
		var style = item.element.style;
		var computedStyle = item.element.ownerDocument.defaultView.getComputedStyle(item.element);
		var elementPaddingLeft = parseInt(computedStyle.paddingLeft,10);
		var elementPaddingTop = parseInt(computedStyle.paddingTop,10);
		var elementPaddingRight = parseInt(computedStyle.paddingRight,10);
		var elementPaddingBottom = parseInt(computedStyle.paddingBottom,10);
		var elementMarginBottom = parseInt(computedStyle.marginBottom,10);
		var elementWidth = item.element.offsetWidth;
		var elementBorder = computedStyle.border;
		style.paddingLeft = elementPaddingLeft + "px";
		style.paddingTop = elementPaddingTop + "px";
		style.paddingRight = elementPaddingRight + "px";
		style.paddingBottom = elementPaddingBottom + "px";
		style.marginBottom = elementMarginBottom + "px";
		style.border = elementBorder;
		style.width = item.width + "px";
		//style.height = item.height + "px"; // TODO
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
		
	})
	.on("layoutAbort",function(items) {

	})
	.on("beforeSend",function(data) {
		data.toGrid.refreshItems([data.item]);
		var toGridItems = data.toGrid.getItems(),
			toIndex = data.toIndex,
			toGridItem = toGridItems[toIndex] ? toGridItems[toIndex] : (toGridItems[toIndex - 1] ? toGridItems[toIndex - 1] : toGridItems[toIndex + 1]),
			newWidth;
		if(toGridItem) {
			newWidth = self.listWidget.document.defaultView.getComputedStyle(toGridItem.element).width;
			data.item.element.style.width = newWidth;
		} else {
			newWidth = data.toGrid.element.clientWidth;//data.toGrid.element.offsetWidth;
			data.item.element.style.width = newWidth + "px";
		}
		data.toGrid.refreshItems([data.item]);
	})
	.on("send",function(data) {
		data.item.fromGrid = data.fromGrid;
		data.toGrid.refreshItems([data.item]);
		var toGridItems = data.toGrid.getItems(),
			toIndex = data.toIndex,
			toGridItem = toGridItems[toIndex],
			newWidth;
		if(toGridItem) {
			newWidth = self.listWidget.document.defaultView.getComputedStyle(toGridItem.element).width;
			data.item.element.style.width = newWidth;
		} else {
			newWidth = data.toGrid.element.offsetWidth;
			data.item.element.style.width = newWidth + "px";
		}
		data.toGrid.refreshItems([data.item]);
	})
	.on("beforeReceive",function(data) {

	})
	.on("receive",function(data) {

	})
	.on("destroy",function() {
		self.removeAllListeners();
	});
	this.addSelfToGlobalGrids();
	this.observer = new MutationObserver(function(mutations) {
		$tw.utils.each(mutations,function(mutation) {
			if(mutation.removedNodes) {
				var items = self.muuri.getItems();
				self.muuri.refreshItems();
				var needsRefresh = false;
				for(var i=0; i<items.length; i++) {
					if(items[i].width === 0 && items[i].height === 0) {
						needsRefresh = true;
					}
				}
				if(needsRefresh) {
					self.observer.disconnect();
					//self.removeAllListeners();
					self.muuri.destroy(true);
					self.findMuuriWidget().refreshSelf();
				}
			}
		});
	});
	this.observer.observe(this.muuri.element,{attributes: true, childList: true, characterData: true});
	/*$tw.hooks.addHook("th-page-refreshing",function() {
		self.storeScrollPositions();
	});
	$tw.hooks.addHook("th-page-refreshed",function() {
		self.restoreScrollPositions();
	});
	if(this.listWidget.document.defaultView !== window) {
		this.listWidget.document.defaultView.addEventListener("beforeunload",function(event) {
			self.observer.disconnect();
			self.muuri.destroy(true);
			//self.removeAllListeners();
		});
	}*/
};

MuuriStoryView.prototype.getScrollPosition = function(scrollContainer) {
	if("scrollX" in scrollContainer) {
		return {x: scrollContainer.scrollX, y: scrollContainer.scrollY};
	} else {
		return {x: scrollContainer.scrollLeft, y: scrollContainer.scrollTop};
	}
};

MuuriStoryView.prototype.setScrollPosition = function(scrollContainer,scrollPosition) {
	if("scrollX" in scrollContainer) {
		scrollContainer.scrollX = scrollPosition.x;
		scrollContainer.scrollY = scrollPosition.y;
	} else {
		scrollContainer.scrollLeft = scrollPosition.x;
		scrollContainer.scrollTop = scrollPosition.y;
	}
};

MuuriStoryView.prototype.getScrollableElements = function(doc) {
	var elements = Array.prototype.slice.call(doc.querySelectorAll(".tc-scrollable-element"));
	elements.push("scrollingElement" in doc ? doc.scrollingElement : (navigator.userAgent.indexOf("WebKit") !== -1 ? doc.body : doc.documentElement));
	return elements;
};

MuuriStoryView.prototype.storeScrollPositions = function() {
	this.scrollableElements = this.getScrollableElements(this.listWidget.document);
	this.scrollPositions = [];
	for(var i=0; i<this.scrollableElements.length; i++) {
		this.scrollPositions.push(this.getScrollPosition(this.scrollableElements[i]));
	}
};

MuuriStoryView.prototype.restoreScrollPositions = function() {
	if(this.scrollableElements) {
		for(var k=0; k<this.scrollableElements.length; k++) {
			this.setScrollPosition(this.scrollableElements[k],this.scrollPositions[k]);
		}
	}
};

MuuriStoryView.prototype.updateGlobalGrids = function() {
	var foundGridElements = this.listWidget.document.documentElement.querySelectorAll('[data-grid="muuri"]');
	for(var i=0; i<$tw.Grids.length; i++) {
		var globalGridElement = $tw.Grids[i].element;
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
			if($tw.Grids[i].element === connectedGridElements[k]) {
				connectedGrids.push($tw.Grids[i]);
			}
		}
	}
	var selfIsAdded = false;
	for(i=0; i<connectedGrids.length; i++) {
		if(connectedGrids[i].element === this.muuri.element) {
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
		if(globalGrid.element === this.muuri.element) {
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
	item.element.style.width = "";
};

// From stackoverflow https://stackoverflow.com/questions/35939886/find-first-scrollable-parent
MuuriStoryView.prototype.getScrollContainer = function (element,includeHidden) {
	var doc = element.ownerDocument;
	var style = getComputedStyle(element);
	var excludeStaticParent = style.position === "absolute";
	var overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;
	if(style.position === "fixed") {
		if("scrollingElement" in doc) {
			return doc.scrollingElement;
		}
		if(navigator.userAgent.indexOf("WebKit") !== -1) {
			return doc.body;
		}
		return doc.documentElement;
	}
	for(var parent=element; parent=parent.parentElement; ) {
		style = getComputedStyle(parent);
		if(excludeStaticParent && style.position === "static") {
			continue;
		}
		if(overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) {
			return parent;
		}
	}
	if("scrollingElement" in doc) {
		return doc.scrollingElement;
	}
	if(navigator.userAgent.indexOf("WebKit") !== -1) {
		return doc.body;
	}
	return doc.documentElement;
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
		if((items[i].width !== 0 && items[i].height !== 0) || (items[i].element.offsetParent === null)) {
			this.itemTitlesArray.push(this.getItemTitle(items[i]));
			muuriItems.push(items[i]);
		} else {
			if(items[i].element && items[i].element.parentNode) {
				items[i].element.parentNode.removeChild(items[i].element);
			} else {
				this.muuri.remove([items[i]],{removeElements: true,layout: false});
			}
		}
	}
	this.muuri.items = muuriItems;
};

MuuriStoryView.prototype.insert = function(widget) {
	var self = this;
	var targetElement = widget.findFirstDomNode();
	if(!targetElement || targetElement.nodeType === Node.TEXT_NODE) {
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
	if(!targetElement || targetElement.nodeType === Node.TEXT_NODE) {
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
		var items = this.muuri.getItems(),
			item;
		for(var i=0; i<items.length; i++) {
			var element = items[i].element;
			if(element === targetElement) {
				item = items[i];
			}
		}
		if(item) {
			this.muuri.remove([item],{removeElements: true, layout: false});
		}
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
	if(!targetElement || targetElement.nodeType === Node.TEXT_NODE) {
		return;
	}
	setTimeout(function() {
		$tw.utils.removeClass(targetElement,"tc-navigating-to");
	},$tw.utils.getAnimationDuration());
	$tw.utils.addClass(targetElement,"tc-navigating-to");
	// Scroll the node into view
	this.listWidget.dispatchEvent({type: "tm-scroll", target: targetElement});
};

MuuriStoryView.prototype.createMuuriGrid = function() {
	var self = this;
	var domNode;
	if(this.listWidget.parentDomNode.isConnected) {
		domNode = this.listWidget.parentDomNode;
		if(domNode) {
			domNode.setAttribute("data-grid","muuri");
			var options = this.collectOptions();
			try {
				return new Muuri(domNode,options);
			} catch(e) {
				console.log(e);
				return false;
			}
		}
	}
	return false;
};

MuuriStoryView.prototype.collectOptions = function() {
	var self = this;
	return {
		items: self.itemSelector,
		dragContainer: self.dragContainer,
		dragEnabled: true,
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
			horizontal: self.horizontal,
			alignRight: self.alignRight,
			alignBottom: self.alignBottom,
			rounding: false
		},
		layoutEasing: easing,
		dragStartPredicate: function(item,e) {
			var items = self.muuri.getItems();
			for(var i=0; i<items.length; i++) {
				$tw.utils.removeClass(items[i].element,"tc-active");
			}
			var element = item.element;
			$tw.utils.addClass(element,"tc-active");
			if(self.dragEnabled && !((e.srcEvent.which && e.srcEvent.which === 3) || (e.srcEvent.button && e.srcEvent.button === 2))) {
				if((e.target && e.target.tagName && (self.noDragTags.indexOf(e.target.tagName) > -1 || 
					self.lookupDragTarget(e.target)) || self.detectWithinCodemirror(e) || !self.detectGridWithinGrid(e.target))) {
					return false;
				} else if((e.deltaTime > self.dragDeltaTime) && (e.distance > self.dragDistance)) {
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
		dragAutoScroll: {
			targets: function(item) {
				var scrollContainers = [];
				var options = [];
				var node = item.getGrid().element;
				while(node && (node.nodeType === 1)) {
					var scrollContainer = self.getScrollContainer(node);
					if(scrollContainer && (scrollContainers.indexOf(scrollContainer) === -1)) {
						$tw.utils.pushTop(scrollContainers,scrollContainer);
					}
					node = node.parentNode;
				}
				for(var i=0; i<scrollContainers.length; i++) {
					var object = {};
					$tw.utils.extend(object,{ element: scrollContainers[i], priority: i});
					$tw.utils.pushTop(options,object);
				}
				return options;
			},
			handle: Muuri.AutoScroller.pointerHandle(100),
			sortDuringScroll: false,
			smoothStop: false,
			threshold: 50
			//speed: Muuri.AutoScroller.smoothSpeed(1000, 2000, 2500)
		},
		//translate3d: true,
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
	var self = this;
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
	if(dragContainerSelector) {
		var dragContainers = this.listWidget.document.documentElement.querySelectorAll(dragContainerSelector);
		var node = this.listWidget.parentDomNode;
		for(var i=0; i<dragContainers.length; i++) {
			while(node) {
				if(node === dragContainers[i]) {
					this.dragContainer = dragContainers[i];
					break;
				}
				for(var k=0; k<node.childNodes.length; k++) {
					if(node.childNodes[k] === dragContainers[i]) {
						this.dragContainer = dragContainers[i];
						break;
					}
				}
				node = node.parentNode;
			}
		}
	}
	this.dragAutoScrollAxis = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-autoscroll-axis");
	this.dragDeltaTime = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-deltatime")) || 100;
	this.dragDistance = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-distance")) || 10;
	this.alignRight = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-right") !== "no";
	this.alignBottom = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-bottom") === "yes";
	this.dragEnabled = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-enabled") !== "no";
	this.storyListTitle = this.listWidget.getVariable("tv-muuri-story-list") || this.listWidget.getVariable("tv-story-list") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist");
	this.storyListField = this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist-field") || "list";
	this.connectionSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "connection-selector");
	this.dropActions = this.listWidget.getVariable("tv-muuri-drop-actions") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "drop-actions");
	this.horizontal = this.listWidget.wiki.getTiddlerText(this.configNamespace + "horizontal") === "yes";
};

MuuriStoryView.prototype.findMuuriWidget = function() {
	var widget = this.listWidget;
	while(widget) {
		if(widget.domNodes[0] === this.muuri.element) {
			return widget;
		}
		widget = widget.parentWidget;
	}
	return this.listWidget.parentWidget;
};

MuuriStoryView.prototype.findListWidget = function(element) {
	for(var i=0; i<this.connectedGrids.length; i++) {
		var listWidgetChildren = this.connectedGrids[i].listWidget.children;
		//find the widget corresponding to this element
		for(var k=0; k<listWidgetChildren.length; k++) {
			var listElement = listWidgetChildren[k] ? listWidgetChildren[k].findFirstDomNode() : null;
			while(listElement && listElement.nodeType === Node.TEXT_NODE) {
				listElement = listElement.firstChild;
			}
			if(listElement && (listElement === element)) {
				return(listWidgetChildren[k]);
			}
		}
	}
	return null;
};

MuuriStoryView.prototype.getItemTitle = function(item) {
	var element = item.element;
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
	var gridNode = this.muuri.getItems()[0] ? this.muuri.getItems()[0].getGrid().element : null;
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
			if(node && node.nodeType !== Node.TEXT_NODE && node.getAttribute && node.getAttribute("data-grid") === "muuri") {
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

MuuriStoryView.prototype.removeAllListeners = function() {
	var self = this;
	var items = this.muuri.getItems();
	for(var i=0; i<items.length; i++) {
		var element = items[i].element;
		this.removeResizeListener(element,function() {
			self.refreshMuuriGrid();
		});
	}
	this.removeResizeListener(this.muuri.element,function() {
		self.refreshMuuriGrid();
	});
};

MuuriStoryView.prototype.refreshMuuriGrid = function(instant) {
	instant = instant || false;
	this.muuri.refreshItems();
	//this.muuri._refreshDimensions();
	this.muuri.layout(instant); //no .layout(true), make tiddlers move, not jump instantly
};

MuuriStoryView.prototype.hardRefresh = function() {
	var items = this.muuri.getItems();
	var elements = [];
	for(var i=0; i<items.length; i++) {
		elements.push(items[i].element);
	}
	this.muuri.remove(items,{removeElements:true,layout:false});
	this.muuri.add(elements,{layout:false, instant: true});
	this.muuri.layout(true);
};

MuuriStoryView.prototype.refreshStart = function(changedTiddlers,changedAttributes) {
	var self = this;
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-enabled"]) {
		this.dragEnabled = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-enabled") !== "no";
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-handle"]) {
		var dragHandle = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-handle");
		if(dragHandle === "" || dragHandle === undefined) {
			dragHandle = null;
		}
		this.muuri.updateSettings({
			dragHandle: self.dragHandle
		});
		//this.hardRefresh();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "align-right"]) {
		this.alignRight = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-right") !== "no";
		this.muuri.updateSettings({
			layout: {
				alignRight: self.alignRight
			}
		});
		this.refreshMuuriGrid();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "align-bottom"]) {
		this.alignBottom = this.listWidget.wiki.getTiddlerText(this.configNamespace + "align-bottom") === "yes";
		this.muuri.updateSettings({
			layout: {
				alignBottom: self.alignBottom
			}
		});
		this.refreshMuuriGrid();
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-action"]) {
		this.dragSortAction = this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-action") || "move";
		this.muuri.updateSettings({
			dragSortPredicate: {
				action: self.dragSortAction
			}
		});
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-threshold"]) {
		this.dragSortThreshold = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-threshold")) || 40;
		this.muuri.updateSettings({
			dragSortPredicate: {
				threshold: self.dragSortThreshold
			}
		});
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "dragsort-heuristics-interval"]) {
		this.dragSortHeuristicsInterval = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "dragsort-heuristics-interval")) || 100;
		this.muuri.updateSettings({
			dragSortHeuristics: {
				sortInterval: self.dragSortHeuristicsInterval
			}
		});
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "horizontal"]) {
		this.horizontal = this.listWidget.wiki.getTiddlerText(this.configNamespace + "horizontal") === "yes";
		this.muuri.updateSettings({
			layout: {
				horizontal: self.horizontal
			}
		});
		this.muuri.updateSettings({
			dragAutoScroll: {
				targets: function(item) {
					return [
						{
							element: self.getScrollContainer(item.getGrid().element),
							axis: self.dragAutoScrollAxis && self.dragAutoScrollAxis === "y" ? Muuri.AutoScroller.AXIS_Y : 
									self.dragAutoScrollAxis && self.dragAutoScrollAxis === "x" ? Muuri.AutoScroller.AXIS_X : 
									self.dragAutoScrollAxis && self.dragAutoScrollAxis === "xy" ? Muuri.AutoScroller.AXIS_X | 
									Muuri.AutoScroller.AXIS_Y : self.horizontal ? Muuri.AutoScroller.AXIS_X : Muuri.AutoScroller.AXIS_Y
						}
					];
				}
			}
		});
		this.muuri.element.style.width = "";
		this.muuri.element.style.height = "";
	}
	if(changedTiddlers[this.configNamespace + "storylist"]) {
		this.storyListTitle = this.listWidget.getVariable("tv-muuri-story-list") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist");
	}
	if(changedTiddlers[this.configNamespace + "storylist-field"]) {
		this.storyListField = this.listWidget.wiki.getTiddlerText(this.configNamespace + "storylist-field") || "list";
	}
	if(changedTiddlers[this.configNamespace + "connection-selector"]) {
		this.connectionSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "connection-selector");
	}
	if(changedTiddlers[this.configNamespace + "drop-actions"]) {
		this.dropActions = this.listWidget.getVariable("tv-muuri-drop-actions") || this.listWidget.wiki.getTiddlerText(this.configNamespace + "drop-actions");
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-autoscroll-axis"]) {
		this.dragAutoScrollAxis = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-autoscroll-axis");
		this.muuri.updateSettings({
			dragAutoScroll: {
				targets: function(item) {
					return [
						{
							element: self.getScrollContainer(item.getGrid().element),
							axis: self.dragAutoScrollAxis && self.dragAutoScrollAxis === "y" ? Muuri.AutoScroller.AXIS_Y : 
									self.dragAutoScrollAxis && self.dragAutoScrollAxis === "x" ? Muuri.AutoScroller.AXIS_X : 
									self.dragAutoScrollAxis && self.dragAutoScrollAxis === "xy" ? Muuri.AutoScroller.AXIS_X | 
									Muuri.AutoScroller.AXIS_Y : self.horizontal ? Muuri.AutoScroller.AXIS_X : Muuri.AutoScroller.AXIS_Y
						}
					];
				}
			}
		});
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-container"]) {
		var dragContainerSelector = this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-container");
		this.dragContainer = this.listWidget.document.documentElement.querySelector(dragContainerSelector);
		this.muuri.updateSettings({
			dragContainer: self.dragContainer
		});
	}
	if(this.muuri && (changedTiddlers[this.configNamespace + "container-class"] || changedTiddlers[this.configNamespace + "item-class"])) {
		this.observer.disconnect();
		//this.muuri.destroy(true);
		this.removeAllListeners();
		this.findMuuriWidget().refreshSelf();
	}
	if(this.muuri && changedTiddlers["$:/config/AnimationDuration"]) {
		this.animationDuration = $tw.utils.getAnimationDuration();
		this.muuri.updateSettings({
			showDuration: self.animationDuration,
			layoutDuration: self.animationDuration
		});
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-deltatime"]) {
		this.dragDeltaTime = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-deltatime")) || 100;
	}
	if(this.muuri && changedTiddlers[this.configNamespace + "drag-distance"]) {
		this.dragDistance = parseInt(this.listWidget.wiki.getTiddlerText(this.configNamespace + "drag-distance")) || 10;
	}
	if(changedAttributes.storyViewConfig) {
		this.observer.disconnect();
		this.removeAllListeners();
		this.findMuuriWidget().refreshSelf();
	}
	if(changedAttributes.filter || changedAttributes.template || changedAttributes.editTemplate || changedAttributes.emptyMessage || changedAttributes.storyview || changedAttributes.history) {
		this.observer.disconnect();
	}
	return true;
};

exports.muuri = MuuriStoryView;

})();