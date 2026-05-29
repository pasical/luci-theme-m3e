'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function () {
		ui.menu.load().then(L.bind(function (tree) {
			this.render(tree);
			this.decorateActionGroups();
		}, this));
		this.initMenuToggle();
		this.initHeaderShadow();
		this.initActionGroupObserver();
	},

	initActionGroupObserver: function () {
		var self = this,
			scheduled = false,
			root = document.getElementById('maincontent') || document.body;

		function schedule() {
			if (scheduled)
				return;

			scheduled = true;
			window.requestAnimationFrame(function () {
				scheduled = false;
				self.decorateActionGroups();
			});
		}

		schedule();

		if (!root || !window.MutationObserver)
			return;

		this.actionGroupObserver = new MutationObserver(schedule);
		this.actionGroupObserver.observe(root, {
			childList: true,
			subtree: true
		});
	},

	decorateActionGroups: function () {
		function applyFullPillRadius(control) {
			if (!control || !control.style)
				return;

			control.style.setProperty('border-radius', '999px', 'important');
			control.style.setProperty('border-top-left-radius', '999px', 'important');
			control.style.setProperty('border-top-right-radius', '999px', 'important');
			control.style.setProperty('border-bottom-right-radius', '999px', 'important');
			control.style.setProperty('border-bottom-left-radius', '999px', 'important');
		}

		function isActionControl(node) {
			return !!node && node.nodeType === 1 && node.matches('.btn, .cbi-button, .cbi-dropdown.btn, .cbi-dropdown.cbi-button');
		}

		function getActionControl(item) {
			if (!item || item.nodeType !== 1)
				return null;

			if (isActionControl(item))
				return item;

			if (item.tagName === 'FORM' && isActionControl(item.firstElementChild))
				return item.firstElementChild;

			return null;
		}

		function getActionItems(wrapper) {
			return Array.prototype.filter.call(wrapper.children || [], function (child) {
				return !!getActionControl(child);
			});
		}

		Array.prototype.forEach.call(document.querySelectorAll('.actions, .cbi-page-actions, .td.cbi-section-actions > *, td.cbi-section-actions > *'), function (wrapper) {
			var items = getActionItems(wrapper);

			wrapper.classList.remove('m3e-button-group');

			Array.prototype.forEach.call(wrapper.children || [], function (child) {
				child.classList.remove('m3e-button-group-item');

				var control = getActionControl(child);

				if (control) {
					control.classList.remove('m3e-button-group-first', 'm3e-button-group-middle', 'm3e-button-group-last');
					control.style.removeProperty('border-radius');
					control.style.removeProperty('border-top-left-radius');
					control.style.removeProperty('border-top-right-radius');
					control.style.removeProperty('border-bottom-right-radius');
					control.style.removeProperty('border-bottom-left-radius');
				}
			});

			if (items.length < 2)
				return;

			wrapper.classList.add('m3e-button-group');

			items.forEach(function (item, index) {
				var control = getActionControl(item),
					positionClass = (index === 0)
						? 'm3e-button-group-first'
						: (index === items.length - 1 ? 'm3e-button-group-last' : 'm3e-button-group-middle');

				item.classList.add('m3e-button-group-item');

				if (control) {
					control.classList.add(positionClass);
					applyFullPillRadius(control);
				}
			});
		});
	},

	initMenuToggle: function () {
		var menuBtn = document.querySelector('.menu-btn');
		var sidebar = document.querySelector('.sidebar');
		var body = document.body;

		// 创建遮罩层
		var overlay = document.createElement('div');
		overlay.className = 'sidebar-overlay';
		document.body.appendChild(overlay);

		if (menuBtn && sidebar) {
			// 点击菜单按钮
			menuBtn.addEventListener('click', function () {
				menuBtn.classList.toggle('active');
				sidebar.classList.toggle('active');
				overlay.classList.toggle('active');
				body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
			});

			// 点击遮罩层关闭菜单
			overlay.addEventListener('click', function () {
				menuBtn.classList.remove('active');
				sidebar.classList.remove('active');
				overlay.classList.remove('active');
				body.style.overflow = '';
			});
		}
	},

	// 关闭其他展开的菜单
	closeOtherMenus: function (currentMenu) {
		var openMenus = document.querySelectorAll('#topmenu > li.open');

		openMenus.forEach(function (menu) {
			if (menu !== currentMenu) {
				var submenu = menu.querySelector('.dropdown-menu');
				if (submenu) {
					// 先设置实际高度，以便动画正常工作
					submenu.style.height = submenu.scrollHeight + 'px';
					// 强制重排
					submenu.offsetHeight;
					// 开始收起动画
					submenu.style.height = '0px';
					menu.classList.remove('open');
				}
			}
		});
	},

	render: function (tree) {
		var node = tree,
			url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu'),
			strip = E('div', { 'class': 'm3e-tab-strip' }),
			ul = E('ul', { 'class': 'tabs' }),
			children = ui.menu.getChildren(tree),
			activeNode = null;

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] == children[i].name),
				activeClass = isActive ? ' active' : '',
				className = 'tabmenu-item-%s %s'.format(children[i].name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, children[i].name) }, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)])]));

			if (isActive)
				activeNode = children[i];
		}

		if (ul.children.length == 0)
			return E([]);

		strip.appendChild(ul);
		container.appendChild(strip);
		this.initTabScroller(strip);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	initTabScroller: function (scroller) {
		if (!scroller || scroller.dataset.m3eScrollable === 'true')
			return;

		scroller.dataset.m3eScrollable = 'true';

		var startX = 0,
			startScrollLeft = 0,
			isDragging = false,
			suppressClick = false,
			mouseDown = false;

		function updateScrollableState() {
			scroller.classList.toggle('is-scrollable', scroller.scrollWidth > scroller.clientWidth + 2);
		}

		function stopDrag() {
			mouseDown = false;

			if (isDragging) {
				isDragging = false;
				scroller.classList.remove('is-dragging');
			}

			window.clearTimeout(scroller._m3eClickTimer);
			scroller._m3eClickTimer = window.setTimeout(function () {
				suppressClick = false;
			}, 0);
		}

		updateScrollableState();

		if (window.ResizeObserver) {
			(new ResizeObserver(updateScrollableState)).observe(scroller);
		}

		window.addEventListener('resize', updateScrollableState);

		scroller.addEventListener('wheel', function (ev) {
			var delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;

			if (!delta || scroller.scrollWidth <= scroller.clientWidth + 2)
				return;

			scroller.scrollLeft += delta;
			ev.preventDefault();
		}, { passive: false });

		scroller.addEventListener('mousedown', function (ev) {
			if (ev.button !== 0)
				return;

			if (scroller.scrollWidth <= scroller.clientWidth + 2)
				return;

			mouseDown = true;
			startX = ev.clientX;
			startScrollLeft = scroller.scrollLeft;
			isDragging = false;
			suppressClick = false;
			ev.preventDefault();
		});

		window.addEventListener('mousemove', function (ev) {
			var delta;

			if (!mouseDown)
				return;

			delta = ev.clientX - startX;

			if (!isDragging && Math.abs(delta) < 6)
				return;

			isDragging = true;
			suppressClick = true;
			scroller.classList.add('is-dragging');
			scroller.scrollLeft = startScrollLeft - delta;
			ev.preventDefault();
		});

		window.addEventListener('mouseup', stopDrag);

		scroller.addEventListener('click', function (ev) {
			if (!suppressClick)
				return;

			ev.preventDefault();
			ev.stopPropagation();
		}, true);

		scroller.addEventListener('dragstart', function (ev) {
			ev.preventDefault();
		});
	},

	renderMainMenu: function (tree, url, level) {
		var self = this;
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu'),
			children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		for (var i = 0; i < children.length; i++) {
			var submenu = this.renderMainMenu(children[i], url + '/' + children[i].name, (level || 0) + 1),
				subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
				linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
				linkurl = submenu.firstElementChild ? '#' : L.url(url, children[i].name);

			var currentPath = L.env.requestpath.join('/');
			var itemPath = (url + '/' + children[i].name).replace(/^\/+/, '');
			var isActive = currentPath.startsWith(itemPath);

			if (isActive && submenu.firstElementChild) {
				subclass = 'dropdown open active';
				// 直接设置展开状态
				submenu.style.display = 'block';
				submenu.style.height = 'auto';
			}
			else if (isActive) {
				subclass = 'active';
			}
			else if (submenu.firstElementChild) {
				subclass = 'dropdown';
				submenu.style.height = '0px';
			}

			var li = E('li', {
				'class': subclass,
				'data-path': itemPath
			}, [
				E('a', {
					'class': linkclass,
					'href': linkurl,
					'click': (function (submenu, hasSubmenu, targetUrl, ev) {
						if (hasSubmenu) {
							ev.preventDefault();
							ev.stopPropagation();

							var parentLi = ev.currentTarget.parentNode;
							var dropdownMenu = submenu;

							if (parentLi.classList.contains('open')) {
								// 先获取当前高度
								dropdownMenu.style.height = dropdownMenu.scrollHeight + 'px';
								// 强制重排
								dropdownMenu.offsetHeight;
								// 开始收起动画
								parentLi.classList.remove('open');
								dropdownMenu.style.height = '0px';
							} else {
								self.closeOtherMenus(parentLi);
								parentLi.classList.add('open');
								// 移除auto和display设置，以便动画生效
								dropdownMenu.style.display = '';
								dropdownMenu.style.height = dropdownMenu.scrollHeight + 'px';
							}
						}
						else if (targetUrl) {
							location.href = targetUrl;
						}
					}).bind(null, submenu, !!submenu.firstElementChild, linkurl)
				}, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)]),
				submenu
			]);

			ul.appendChild(li);
		}

		ul.style.display = '';

		return ul;
	},

	renderModeMenu: function (tree) {
		var ul = document.querySelector('#modemenu'),
			children = ui.menu.getChildren(tree);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);

			ul.appendChild(E('li', { 'class': isActive ? 'active' : null }, [
				E('a', { 'href': L.url(children[i].name) }, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)])
			]));

			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}

		if (ul.children.length > 1)
			ul.style.display = '';
	},

	initHeaderShadow: function () {
		var header = document.querySelector('header');
		var scrollTarget = document.getElementById('scroll-wrapper') || window;
		var scrollThreshold = 10; // 滚动阈值

		scrollTarget.addEventListener('scroll', function () {
			var scrollTop = scrollTarget === window ? window.scrollY : scrollTarget.scrollTop;

			if (scrollTop > scrollThreshold) {
				header.classList.add('with-shadow');
			} else {
				header.classList.remove('with-shadow');
			}
		});
	}
});
