/*\
title: $:/core/modules/utils/dom/scroller.js
type: application/javascript
module-type: utils

Module that creates a $tw.utils.Scroller object prototype that manages scrolling in the browser

\*/

"use strict";

/*
Event handler for when the `tm-scroll` event hits the document body
*/
var PageScroller = function() {
	this.idRequestFrame = null;
	this.requestAnimationFrame = window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		function(callback) {
			return window.setTimeout(callback, 1000/60);
		};
	this.cancelAnimationFrame = window.cancelAnimationFrame ||
		window.webkitCancelAnimationFrame ||
		window.webkitCancelRequestAnimationFrame ||
		window.mozCancelAnimationFrame ||
		window.mozCancelRequestAnimationFrame ||
		function(id) {
			window.clearTimeout(id);
		};
};

PageScroller.prototype.isScrolling = function() {
	return this.idRequestFrame !== null;
}

PageScroller.prototype.cancelScroll = function(srcWindow) {
	if(this.idRequestFrame) {
		this.cancelAnimationFrame.call(srcWindow,this.idRequestFrame);
		this.idRequestFrame = null;
	}
};

/*
Handle an event
*/
PageScroller.prototype.handleEvent = function(event) {
	if(event.type === "tm-scroll") {
		var options = {};
		if($tw.utils.hop(event.paramObject,"animationDuration")) {
			options.animationDuration = event.paramObject.animationDuration;
		}
		if(event.paramObject && event.paramObject.selector) {
			this.scrollSelectorIntoView(null,event.paramObject.selector,null,options);
		} else {
			this.scrollIntoView(event.target,null,options);
		}
		return false; // Event was handled
	}
	return true;
};

PageScroller.prototype.elementHasTransform = function(element, srcWindow) {
	srcWindow = srcWindow || window;
	var el = element;
	while(el && el !== srcWindow.document.documentElement) {
		var style = srcWindow.getComputedStyle(el);
		var transform = style.transform || style.webkitTransform || style.mozTransform;
		if(transform && transform !== "none") {
			return true;
		}
		el = el.parentElement;
	}
	return false;
};


/*
Handle a scroll event hitting the page document
*/
PageScroller.prototype.scrollIntoView = function(element,callback,options) {
	options = options || {};
	var self = this,
		duration = $tw.utils.hop(options,"animationDuration") ? parseInt(options.animationDuration) : $tw.utils.getAnimationDuration(),
		srcWindow = element ? element.ownerDocument.defaultView : window;

	// Wenn das Element (oder ein Vorfahr) per CSS transformiert ist:
	// Browser übernimmt das Scrollen, weil er die Transformationsmatrix kennt.
	if(element && this.elementHasTransform(element,srcWindow)) {
		//this.cancelScroll(srcWindow);
		var behavior = duration > 0 ? "smooth" : "auto";
		try {
			element.scrollIntoView({
				behavior: behavior,
				block: "start",
				inline: "start"
			});
		} catch(e) {
			// Fallback für ältere Browser ohne Options-Objekt
			element.scrollIntoView();
		}
		return;
	}

	// --- ab hier: Originalverhalten für "normale" Elemente ---

	// Jetzt den Body scrollen
	this.cancelScroll(srcWindow);
	this.startTime = Date.now();
	// Höhe von position:fixed-Toolbars ermitteln
	var toolbar = srcWindow.document.querySelector(".tc-adjust-top-of-scroll"),
		offset = 0;
	if(toolbar) {
		offset = toolbar.offsetHeight;
	}
	// Bounds-Funktion
	var getBounds = function() {
			var clientBounds = typeof callback === "function" ? callback() : element.getBoundingClientRect(),
				scrollPosition = $tw.utils.getScrollPosition(srcWindow);
			return {
				left: clientBounds.left + scrollPosition.x,
				top: clientBounds.top + scrollPosition.y - offset,
				width: clientBounds.width,
				height: clientBounds.height
			};
		},
		getEndPos = function(targetPos,targetSize,currentPos,currentSize) {
			var newPos = targetPos;
			if(newPos < 50) {
				newPos = 0;
			}
			return newPos;
		},
		drawFrame = function drawFrame() {
			var t;
			if(duration <= 0) {
				t = 1;
			} else {
				t = ((Date.now()) - self.startTime) / duration;
			}
			if(t >= 1) {
				self.cancelScroll(srcWindow);
				t = 1;
			}
			t = $tw.utils.slowInSlowOut(t);
			var scrollPosition = $tw.utils.getScrollPosition(srcWindow),
				bounds = getBounds(),
				endX = getEndPos(bounds.left,bounds.width,scrollPosition.x,srcWindow.innerWidth),
				endY = getEndPos(bounds.top,bounds.height,scrollPosition.y,srcWindow.innerHeight);
			srcWindow.scrollTo(
				scrollPosition.x + (endX - scrollPosition.x) * t,
				scrollPosition.y + (endY - scrollPosition.y) * t
			);
			if(t < 1) {
				self.idRequestFrame = self.requestAnimationFrame.call(srcWindow,drawFrame);
			}
		};
	drawFrame();
};


PageScroller.prototype.scrollSelectorIntoView = function(baseElement,selector,callback,options) {
	baseElement = baseElement || document;
	var element = $tw.utils.querySelectorSafe(selector,baseElement);
	if(element) {
		this.scrollIntoView(element,callback,options);
	}
};

exports.PageScroller = PageScroller;
