'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function () {
		ui.menu.load().then(L.bind(function (tree) {
			this.render(tree);
		}, this));
		this.initMenuToggle();
	},

	initMenuToggle: function () {
		const menuBtn = document.querySelector('.menu-btn');
		const sidebar = document.getElementById('m3e-sidebar');
		const workspace = document.getElementById('scroll-wrapper');
		const compact = window.matchMedia('(max-width: 854px)');

		function setOpen(open) {
			menuBtn.classList.toggle('active', open);
			sidebar.classList.toggle('active', open);
			menuBtn.setAttribute('aria-expanded', String(open));
			workspace.inert = open;
		}

		menuBtn.addEventListener('click', function () {
			setOpen(!sidebar.classList.contains('active'));
		});
		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && sidebar.classList.contains('active')) {
				event.preventDefault();
				setOpen(false);
				menuBtn.focus();
			}
		});
		compact.addEventListener('change', function () {
			if (!compact.matches)
				setOpen(false);
		});
	},

	setGroupOpen: function (link, submenu, open) {
		const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// On a quick reversal, start from the currently visible height.
		const from = animate ? submenu.getBoundingClientRect().height : 0;
		submenu.getAnimations().forEach(animation => animation.cancel());
		link.parentElement.classList.toggle('open', open);
		link.setAttribute('aria-expanded', String(open));
		submenu.inert = !open;

		if (animate) {
			const to = submenu.getBoundingClientRect().height;
			submenu.animate({ height: [from + 'px', to + 'px'] }, {
				duration: 220,
				easing: 'cubic-bezier(0.2, 0, 0, 1)'
			});
		}
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

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu: function (tree, url, level) {
		var self = this;
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu'),
			children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		for (var i = 0; i < children.length; i++) {
			const itemPath = (url + '/' + children[i].name).replace(/^\/+/, '');
			const submenu = this.renderMainMenu(children[i], itemPath, (level || 0) + 1);
			const hasSubmenu = !!submenu.firstElementChild;
			const isActive = L.env.requestpath.join('/').startsWith(itemPath);
			const classes = [hasSubmenu && 'dropdown', isActive && 'active', hasSubmenu && isActive && 'open'];

			if (hasSubmenu)
				submenu.inert = !isActive;

			var li = E('li', {
				'class': classes.filter(Boolean).join(' '),
				'data-path': itemPath
			}, [
				E('a', {
					'class': hasSubmenu ? 'menu' : null,
					'href': hasSubmenu ? '#' : L.url(itemPath),
					'aria-expanded': hasSubmenu ? String(isActive) : null,
					'click': hasSubmenu ? function (ev) {
						ev.preventDefault();
						const link = ev.currentTarget;
						const open = !link.parentElement.classList.contains('open');

						if (open) {
							for (const other of ul.querySelectorAll(':scope > li.open > a')) {
								if (other !== link)
									self.setGroupOpen(other, other.nextElementSibling, false);
							}
						}

						self.setGroupOpen(link, submenu, open);
					} : null
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
	}
});
