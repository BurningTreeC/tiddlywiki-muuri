/*\
title: $:/plugins/BTC/Muuri/modules/widgets/subclasses/list.js
type: application/javascript
module-type: widget-subclass

Extends <$list> widget with reorder optimization for storyviews (e.g. Muuri)

Key features:
- Detects pure reorders (same items, different order) vs structural changes
- Can skip DOM rebuild when storyview signals it has handled the reorder
- Exposes metrics for storyview coordination

\*/
"use strict";

exports.baseClass = "list";

/*
Constructor
*/
exports.constructor = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

exports.prototype = Object.create(null);

/* ---------------------------------------------------------
   Helper: Check if two lists are pure reorders of each other
   (same items, possibly different order)
--------------------------------------------------------- */
function isPureReorder(prevList, newList) {
	if (!Array.isArray(prevList) || !Array.isArray(newList)) {
		return false;
	}
	if (prevList.length !== newList.length) {
		return false;
	}
	if (prevList.length === 0) {
		return false; // Empty lists aren't reorders
	}
	
	// Check if they have exactly the same items
	var prevSet = Object.create(null);
	for (var i = 0; i < prevList.length; i++) {
		prevSet[prevList[i]] = true;
	}
	for (var j = 0; j < newList.length; j++) {
		if (!prevSet[newList[j]]) {
			return false; // newList has an item not in prevList
		}
	}
	return true;
}

/* ---------------------------------------------------------
   Helper: Check if the order actually changed
--------------------------------------------------------- */
function orderChanged(prevList, newList) {
	if (prevList.length !== newList.length) {
		return true;
	}
	for (var i = 0; i < prevList.length; i++) {
		if (prevList[i] !== newList[i]) {
			return true;
		}
	}
	return false;
}

/* ---------------------------------------------------------
   Helper: compute planned reorder count
--------------------------------------------------------- */
function computePlannedReorder(prevList, newList) {
	if (!Array.isArray(prevList) || !Array.isArray(newList)) {
		return 0;
	}
	var prevIndex = Object.create(null);
	for (var i = 0; i < prevList.length; i++) {
		prevIndex[prevList[i]] = i;
	}
	var moved = 0;
	for (var j = 0; j < newList.length; j++) {
		var title = newList[j];
		var pi = prevIndex[title];
		// New item OR index changed
		if (pi === undefined || pi !== j) {
			moved++;
		}
	}
	return moved;
}

/* ---------------------------------------------------------
   handleListChanges() override
   
   This is where the magic happens. For PURE REORDERS where
   the storyview has signaled it will handle things, we skip
   the expensive remove/insert cycle.
--------------------------------------------------------- */
exports.prototype.handleListChanges = function(changedTiddlers) {
	// Get the new list
	var prevList = this.list;
	this.list = this.getTiddlerList();
	
	// Check if storyview wants to handle pure reorders itself
	var storyviewHandlesReorder = this.storyview && 
		this.storyview._muuriHandledReorder === true;
	
	// Check if this is a pure reorder
	var pureReorder = isPureReorder(prevList, this.list);
	var hasOrderChanged = orderChanged(prevList, this.list);
	
	// If storyview handled a pure reorder, we can skip DOM manipulation
	if (storyviewHandlesReorder && pureReorder && hasOrderChanged) {
		// Clear the flag
		this.storyview._muuriHandledReorder = false;
		
		// Just reorder our internal children array to match the new list order
		// WITHOUT touching the DOM (Muuri already has the DOM in the right visual order)
		var newChildren = [];
		var childByTitle = Object.create(null);
		
		// Build lookup of children by title
		for (var i = 0; i < this.children.length; i++) {
			var child = this.children[i];
			var title = child.parseTreeNode.itemTitle;
			childByTitle[title] = child;
		}
		
		// Reorder children to match new list
		for (var j = 0; j < this.list.length; j++) {
			var title = this.list[j];
			var child = childByTitle[title];
			if (child) {
				// Update the index-related properties if needed
				child.parseTreeNode.isLast = (j === this.list.length - 1);
				if (child.parseTreeNode.counterName) {
					child.parseTreeNode.counter = (j + 1).toString();
					child.parseTreeNode.isFirst = (j === 0);
				}
				newChildren.push(child);
			}
		}
		
		this.children = newChildren;
		
		// Refresh children in case any tiddlers changed content
		var hasRefreshed = false;
		for (var k = 0; k < this.children.length; k++) {
			var refreshed = this.children[k].refresh(changedTiddlers);
			hasRefreshed = hasRefreshed || refreshed;
		}
		
		return hasRefreshed;
	}
	
	// Otherwise, fall back to the standard handling
	return this._baseHandleListChanges(changedTiddlers, prevList);
};

/* ---------------------------------------------------------
   _baseHandleListChanges() - the original logic
   
   This is essentially a copy of the core handleListChanges,
   but we need it here because we can't easily call super
   after we've already computed the new list.
--------------------------------------------------------- */
exports.prototype._baseHandleListChanges = function(changedTiddlers, prevList) {
	var self = this;
	var t, n, index, hasRefreshed, isLast, wasLast;
	
	// Check for an empty list
	if (this.list.length === 0) {
		// Check if it was empty before
		if (prevList.length === 0) {
			// If so, just refresh the empty message
			return this.refreshChildren(changedTiddlers);
		} else {
			// Replace the previous content with the empty message
			for (t = this.children.length - 1; t >= 0; t--) {
				this.removeListItem(t);
			}
			var nextSibling = this.findNextSiblingDomNode();
			this.makeChildWidgets(this.getEmptyMessage());
			this.renderChildren(this.parentDomNode, nextSibling);
			return true;
		}
	} else {
		// If the list was empty then we need to remove the empty message
		if (prevList.length === 0) {
			this.removeChildDomNodes();
			this.children = [];
		}
		// If we are providing a counter variable then we must refresh the items
		hasRefreshed = false;
		if (this.counterName) {
			var mustRefreshOldLast = false;
			var oldLength = this.children.length;
			for (t = 0; t < this.list.length; t++) {
				if (hasRefreshed || !this.children[t] || this.children[t].parseTreeNode.itemTitle !== this.list[t]) {
					if (this.children[t]) {
						this.removeListItem(t);
					}
					this.insertListItem(t, this.list[t]);
					if (!hasRefreshed && t === oldLength) {
						mustRefreshOldLast = true;
					}
					hasRefreshed = true;
				} else {
					var refreshed = this.children[t].refresh(changedTiddlers);
					hasRefreshed = hasRefreshed || refreshed;
				}
			}
			if (mustRefreshOldLast && oldLength > 0) {
				var oldLastIdx = oldLength - 1;
				this.removeListItem(oldLastIdx);
				this.insertListItem(oldLastIdx, this.list[oldLastIdx]);
			}
			if (!hasRefreshed && this.children.length > this.list.length) {
				this.removeListItem(this.list.length - 1);
				this.insertListItem(this.list.length - 1, this.list[this.list.length - 1]);
			}
		} else {
			var mustRecreateLastItem = false;
			if (this.join && this.join.length) {
				if (this.children.length !== this.list.length) {
					mustRecreateLastItem = true;
				} else if (prevList[prevList.length - 1] !== this.list[this.list.length - 1]) {
					mustRecreateLastItem = true;
				}
			}
			isLast = false;
			wasLast = false;
			for (t = 0; t < this.list.length; t++) {
				isLast = t === this.list.length - 1;
				index = this.findListItem(t, this.list[t]);
				wasLast = index === this.children.length - 1;
				if (wasLast && (index !== t || this.children.length !== this.list.length)) {
					mustRecreateLastItem = !!(this.join && this.join.length);
				}
				if (index === undefined) {
					if (isLast && mustRecreateLastItem && t > 0) {
						this.removeListItem(t - 1);
						this.insertListItem(t - 1, this.list[t - 1]);
					}
					this.insertListItem(t, this.list[t]);
					hasRefreshed = true;
				} else {
					for (n = index - 1; n >= t; n--) {
						this.removeListItem(n);
						hasRefreshed = true;
					}
					if (mustRecreateLastItem && (isLast || wasLast)) {
						this.removeListItem(t);
						this.insertListItem(t, this.list[t]);
						hasRefreshed = true;
					} else {
						var refreshed = this.children[t].refresh(changedTiddlers);
						hasRefreshed = hasRefreshed || refreshed;
					}
				}
			}
		}
		// Remove any left over items
		for (t = this.children.length - 1; t >= this.list.length; t--) {
			this.removeListItem(t);
			hasRefreshed = true;
		}
		return hasRefreshed;
	}
};

/* ---------------------------------------------------------
   refresh() override - sets up metrics before base refresh
--------------------------------------------------------- */
exports.prototype.refresh = function(changedTiddlers) {
	// Capture previous list BEFORE base refresh mutates it
	var prevList = this.list ? this.list.slice() : [];
	
	// Predict new list using the same logic as core
	var newList;
	try {
		newList = this.getTiddlerList();
	} catch (e) {
		newList = [];
	}
	
	// Planned reorder count
	this._twListPlannedReorderCount = computePlannedReorder(prevList, newList);
	
	// Is this a pure reorder?
	this._twListIsPureReorder = isPureReorder(prevList, newList);
	
	// Reset actual-operation counters
	this._twListActualInsertCount = 0;
	this._twListActualRemoveCount = 0;
	
	// Get changed attributes
	var changedAttributes = this.computeAttributes();
	
	// Call the storyview refreshStart
	if (this.storyview && this.storyview.refreshStart) {
		this.storyview.refreshStart(changedTiddlers, changedAttributes);
	}
	
	var result;
	
	// Completely refresh if any of our attributes have changed
	if (changedAttributes.filter || changedAttributes.variable || changedAttributes.counter || 
		changedAttributes.template || changedAttributes.editTemplate || changedAttributes.join || 
		changedAttributes.emptyMessage || changedAttributes.storyview || changedAttributes.history) {
		this.refreshSelf();
		result = true;
	} else {
		// Handle any changes to the list (our overridden version)
		result = this.handleListChanges(changedTiddlers);
		// Handle any changes to the history stack
		if (this.historyTitle && changedTiddlers[this.historyTitle]) {
			this.handleHistoryChanges();
		}
	}
	
	// Call the storyview refreshEnd
	if (this.storyview && this.storyview.refreshEnd) {
		this.storyview.refreshEnd(changedTiddlers, changedAttributes);
	}
	
	return result;
};

/* ---------------------------------------------------------
   insertListItem() override - tracks count
--------------------------------------------------------- */
exports.prototype.insertListItem = function(index, title) {
	this._twListActualInsertCount = (this._twListActualInsertCount || 0) + 1;
	return Object
		.getPrototypeOf(Object.getPrototypeOf(this))
		.insertListItem
		.call(this, index, title);
};

/* ---------------------------------------------------------
   removeListItem() override - tracks count
--------------------------------------------------------- */
exports.prototype.removeListItem = function(index) {
	this._twListActualRemoveCount = (this._twListActualRemoveCount || 0) + 1;
	return Object
		.getPrototypeOf(Object.getPrototypeOf(this))
		.removeListItem
		.call(this, index);
};