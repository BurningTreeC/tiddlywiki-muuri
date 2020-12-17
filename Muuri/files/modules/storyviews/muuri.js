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

// TODO : clean up unneeded configs
var ALIGNRIGHT_CONFIG = "$:/config/muuri/storyview/align-right",
	ALIGNBOTTOM_CONFIG = "$:/config/muuri/storyview/align-bottom",
	DRAGSORTACTION_CONFIG = "$:/config/muuri/storyview/dragsort-action",
	DRAGSORTTHRESHOLD_CONFIG ="$:/config/muuri/storyview/dragsort-threshold",
	DRAGGING_CONFIG = "$:/state/config/muuri/storyview/drag-enabled",
	HORIZONTAL_CONFIG = "$:/config/muuri/storyview/horizontal-view",
	DRAGSORT_HEURISTICS_INTERVAL_CONFIG = "$:/config/muuri/storyview/dragsort-heuristics-interval";

if(typeof window !== "undefined") {
	var testElement = document.body;
	if(!("animate" in testElement)) {
		require("$:/plugins/BTC/Muuri/library/web-animations-polyfill.js");
	}
	if(!window.Muuri) {
		window.Muuri = require("$:/plugins/BTC/Muuri/library/muuri.min.js");
	}
}

var MuuriStoryView = function(listWidget) {
	var self = this;
	this.listWidget = listWidget;
	this.itemTitlesArray = [];
	this.collectAttributes();
	this.muuri = this.createMuuriGrid();
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
	this.muuri.on("dragReleaseEnd",function(item) {
		self.onDragReleaseEnd(item);
	})
	.on("add",function(items) {
		self.updateZIndexList();
	})
	.on("remove",function(items) {
		self.updateZIndexList();
	})
	.on("dragInit",function(item,event) {
		self.inheritIframeEvents();
	})
	.on("dragStart",function(item,event) {
	})
	.on("dragEnd",function(item,event) {
		self.restoreIframeEvents();
	})
	.on("layoutStart",function() {

	})
	.on("layoutEnd",function() {
		self.updateZIndexList();
	})
	.on("beforeSend",function(data) {

	})
	.on("send",function(data) {

	})
	.on("beforeReceive",function(data) {

	})
	.on("receive",function(data) {

	});
	$tw.wiki.addEventListener("change",function(changes) {
		self.handleRefresh(changes);
	});
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
	if(isReleasing === false) {
		this.synchronizeGrid();
	}
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

	if(hasChanged && this.itemTitlesArray.indexOf(undefined) === -1 && this.itemTitlesArray.indexOf(null) === -1) {
		this.listWidget.wiki.setText(this.storyListTitle,this.storyListField,undefined,this.itemTitlesArray);
	}
};

MuuriStoryView.prototype.getItemIndexes = function(array,target) {
    var indexes = [];
    var count = 0;
    for (var i=0; i<array.length; i++) {
        if (array[i] === target) {
            indexes.push(i);
            count++;
        }
    }
    return indexes;
}

MuuriStoryView.prototype.refreshItemTitlesArray = function() {
	this.muuri.refreshItems();
	var items = this.muuri.getItems(),
		muuriItems = [];
	this.itemTitlesArray = [];
	// TODO : first push all items, also the ones with no width and height. Then, lookup if there are duplicate items and in that case remove the one with no width and height
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
	items = this.muuri.getItems();
	for(i=0; i<items.length; i++) {
		items[i]._id = i;
	}
};

MuuriStoryView.prototype.insert = function(widget) {
	var self = this;
	var targetElement = widget.findFirstDomNode();
	if(!(targetElement instanceof Element)) {
		return;
	}
	this.refreshItemTitlesArray();
	var itemTitle = widget.parseTreeNode.itemTitle;
	var targetIndex = this.listWidget.findListItem(0,itemTitle);
	if(this.itemTitlesArray.indexOf(itemTitle) !== -1) {
		var index = this.itemTitlesArray.indexOf(itemTitle);
		this.muuri._items.splice(index,1);
		this.muuri.refreshItems();
	}
	this.muuri.add(targetElement,{index: targetIndex, instant: true});
	this.addResizeListener(targetElement,function() {
		self.refreshMuuriGrid();
	});
	this.refreshItemTitlesArray();
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
	removeElement();
	this.removeResizeListener(targetElement,function() {
		self.refreshMuuriGrid();
	});
	this.refreshItemTitlesArray();
	this.muuri.refreshItems();
	this.muuri.remove([targetElement],{removeElements: true});
	this.muuri.layout();
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
	domNode.setAttribute("data-grid","muuri");
	return new Muuri(domNode,options);
};

MuuriStoryView.prototype.collectOptions = function() {
	var self = this;
	return {
		items: self.itemSelector,
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
			horizontal: self.horizontal,
			alignRight: self.alignRight,
			alignBottom: self.alignBottom,
			rounding: true
		},
		layoutEasing: easing,
		dragStartPredicate: function(item,e) {
			// TODO: cleanup, rethink isReleasing
			if (self.muuri._settings.dragEnabled) {
				if((e.target && e.target.tagName && (self.noDragTags.indexOf(e.target.tagName) > -1 || self.lookupDragTarget(e.target)) || self.detectWithinCodemirror(e) || !self.detectGridWithinGrid(e.target))) {
					return false;
				} else {
					return Muuri.ItemDrag.defaultStartPredicate(item,e);
				}
			} else {
				return false;
			}
		},
		dragSortInterval: self.dragSortInterval,
		showDuration: self.animationDuration,
		layoutDurattion: self.animationDuration,
		layoutOnResize: true,
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
	this.rounding = true;
	this.containerClass = this.listWidget.getAttribute("containerClass","tc-muuri-river");
	var itemClass = this.listWidget.getAttribute("itemClass","tc-tiddler-frame");
	if(itemClass === undefined || itemClass === "" || itemClass === "*") {
		this.itemSelector = "*";
		this.itemClass = "tc-muuri-item";
	} else {
		var classes = itemClass.split(" ");
		this.itemSelector = "." + classes[0];
		this.itemClass = classes[0];
	}
	this.dragSortInterval = parseInt(this.listWidget.getAttribute("dragSortInterval","100"));
	this.dragSortAction = this.listWidget.getAttribute("dragSortAction",this.storyListTitle === "$:/StoryList" ? this.listWidget.wiki.getTiddlerText(DRAGSORTACTION_CONFIG) : "move");
	this.dragSortThreshold = parseInt(this.listWidget.getAttribute("dragSortThreshold",this.storyListTitle === "$:/StoryList" ? this.listWidget.getTiddlerText(DRAGSORTTHRESHOLD_CONFIG) : "40"));
	this.dragSortHeuristicsInterval = parseInt(this.listWidget.getAttribute("dragSortHeuristicsInterval"),this.listWidget.wiki.getTiddlerText(DRAGSORT_HEURISTICS_INTERVAL_CONFIG)) || 100;
	var dragHandle = this.listWidget.getAttribute("dragHandle",null);
	if(dragHandle === "") {
		dragHandle = null;
	}
	this.dragHandle = dragHandle;
	this.horizontal = this.listWidget.getAttribute("horizontal",this.listWidget.wiki.getTiddlerText(HORIZONTAL_CONFIG)) === "yes";
	this.alignRight = this.listWidget.getAttribute("alignRight",this.listWidget.wiki.getTiddlerText(ALIGNRIGHT_CONFIG)) !== "no";
	this.alignBottom = this.listWidget.getAttribute("alignBottom",this.listWidget.wiki.getTiddlerText(ALIGNBOTTOM_CONFIG)) === "yes";
	this.dragEnabled = this.listWidget.getAttribute("dragEnabled",this.listWidget.wiki.getTiddlerText(DRAGGING_CONFIG)) !== "no";
	this.storyListTitle = this.listWidget.getAttribute("storyList","$:/StoryList");
	this.storyListField = this.listWidget.getAttribute("storyListField","list");
	this.itemTemplate = this.listWidget.getAttribute("template");
	this.itemEditTemplate = this.listWidget.getAttribute("editTemplate");
	this.zIndexTiddler = this.listWidget.getAttribute("zIndexTiddler",this.storyListTitle === "$:/StoryList" ? "$:/state/muuri/storyriver/z-indexes" : null);
	this.noDragTags = ["input","INPUT","textarea","TEXTAREA","button","BUTTON","select","SELECT"];
};

MuuriStoryView.prototype.findListWidget = function(element) {
	var listWidgetChildren = this.listWidget.children;
	//find the widget corresponding to this element
	for(var k=0; k<listWidgetChildren.length; k++) {
		var listElement = listWidgetChildren[k] ? listWidgetChildren[k].findFirstDomNode() : null;
		if(listElement && (listElement === element)) {
			return(listWidgetChildren[k]);
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
				//dragging within a grid
				//see if the found grid is the current grid node
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
			for(k=0; k<columnMembers.length; k++) {
				var itemTitle = self.getItemTitle(columnMembers[k]);
				sortedArray.push(itemTitle);
			}
		});
		//store the array in a tiddler-list that's used for applying z-indices
		var tiddler = this.listWidget.wiki.getTiddler(this.zIndexTiddler);
		this.listWidget.wiki.addTiddler(new $tw.Tiddler(
			this.listWidget.wiki.getCreationFields(),
			{title: this.zIndexTiddler},
			tiddler,
			{list: sortedArray},
			this.listWidget.wiki.getModificationFields()
		));
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

MuuriStoryView.prototype.handleRefresh = function(changedTiddlers) {
	var self = this;
	var changedAttributes = this.listWidget.computeAttributes();
	if(changedTiddlers["$:/config/AnimationDuration"]) {
		this.muuri._settings.showDuration = this.muuri._settings.layoutDuration = this.animationDuration = $tw.utils.getAnimationDuration();
	}
	if(changedTiddlers[DRAGGING_CONFIG] || changedAttributes.dragEnabled) {
		this.muuri._settings.dragEnabled = this.dragEnabled = this.listWidget.getAttribute("dragEnabled",this.listWidget.wiki.getTiddlerText(DRAGGING_CONFIG)) !== "no";
		var items = this.muuri.getItems();
		var elements = [];
		for(var i=0; i<items.length; i++) {
			elements.push(items[i]._element);
		}
		this.muuri.remove(items,{removeElements:true,layout:false});
		this.muuri.add(elements,{layout:false});
		this.muuri.layout(true);
	}
	if(changedTiddlers[ALIGNRIGHT_CONFIG] || changedAttributes.alignRight) {
		this.muuri._settings.layout.alignRight = this.alignRight = this.listWidget.getAttribute("alignRight",this.listWidget.wiki.getTiddlerText(ALIGNRIGHT_CONFIG)) !== "no";		
		this.refreshMuuriGrid();
	}
	if(changedTiddlers[ALIGNBOTTOM_CONFIG] || changedAttributes.alignBottom) {
		this.muuri._settings.layout.alignBottom = this.alignBottom = this.listWidget.getAttribute("alignBottom",this.listWidget.wiki.getTiddlerText(ALIGNBOTTOM_CONFIG)) === "yes";
		this.refreshMuuriGrid();
	}
	if(changedTiddlers[HORIZONTAL_CONFIG] || changedAttributes.horizontal) {
		this.muuri._settings.layout.horizontal = this.horizontal = this.listWidget.getAttribute("horizontal",this.listWidget.wiki.getTiddlerText(HORIZONTAL_CONFIG)) === "yes";
		if(!this.horizontal) {
			this.muuri._element.style.width = "";
		}
		this.refreshMuuriGrid();
	}
	if(changedTiddlers[DRAGSORTACTION_CONFIG] || changedAttributes.dragSortAction) {
		this.muuri._settings.dragSortPredicate.action = this.dragSortAction = this.listWidget.getAttribute("dragSortAction",this.storyListTitle === "$:/StoryList" ? this.listWidget.wiki.getTiddlerText(DRAGSORTACTION_CONFIG) : "move");
	}
	if(changedTiddlers[DRAGSORTTHRESHOLD_CONFIG] || changedAttributes.dragSortThreshold) {
		this.muuri._settings.dragSortPredicate.threshold = this.dragSortThreshold = parseInt(this.listWidget.getAttribute("dragSortThreshold",this.storyListTitle === "$:/StoryList" ? this.listWidget.wiki.getTiddlerText(DRAGSORTTHRESHOLD_CONFIG) : "40"));
	}
	if(changedTiddlers[DRAGSORT_HEURISTICS_INTERVAL_CONFIG] || changedAttributes.dragSortHeuristicsInterval) {
		this.muuri._settings.dragSortHeuristics.sortInterval = this.dragSortHeuristicsInterval = parseInt(this.listWidget.getAttribute("dragSortHeuristicsInterval"),this.listWidget.wiki.getTiddlerText(DRAGSORT_HEURISTICS_INTERVAL_CONFIG)) || 100;
	}
	if(changedTiddlers[this.itemTemplate] || changedTiddlers[this.itemEditTemplate]) {
		setTimeout(function(){
			self.listWidget.refreshSelf();
		},25);
	}
	if(changedAttributes.storyList || changedAttributes.storyListField || changedAttributes.containerClass || changedAttributes.itemClass || changedAttributes.zIndexTiddler || changedAttributes.dragHandle) {
		this.listWidget.refreshSelf();
	}
	return true;
};

exports.muuri = MuuriStoryView;

})();