(function () {
	'use strict';

	var refreshQueued = false;

	function getFieldIdentity(field) {
		return [field.getAttribute('name'), field.id]
			.filter(function (value) { return !!value; })
			.join(' ')
			.trim()
			.toLowerCase();
	}

	function resolveAction(field, button) {
		var fieldIdentity = getFieldIdentity(field);
		var label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
			.filter(function (value) { return !!value; })
			.join(' ')
			.trim()
			.toLowerCase();

		if (field.type === 'password' || /password/.test(label))
			return 'password';

		if (fieldIdentity === 'filter' || /(^|[\s_-])filter([\s_-]|$)/.test(fieldIdentity))
			return 'clear';

		if (fieldIdentity === 'install' || /(^|[\s_-])install([\s_-]|$)/.test(fieldIdentity))
			return 'confirm';

		if (/(^|\s)clear(\s|$)/.test(label))
			return 'clear';

		if (label === 'ok' || /install|apply|submit|confirm/.test(label))
			return 'confirm';

		return null;
	}

	function syncPasswordState(field, button, action) {
		if (action !== 'password')
			return;

		button.classList.toggle('m3e-field-action-active', field.type === 'text');
	}

	function bindPasswordState(field, button, action) {
		if (action !== 'password')
			return;

		syncPasswordState(field, button, action);

		if (!field.getAttribute('data-m3e-type-bound') && window.MutationObserver) {
			new MutationObserver(function () {
				syncPasswordState(field, button, action);
			}).observe(field, {
				attributes: true,
				attributeFilter: ['type']
			});

			field.setAttribute('data-m3e-type-bound', '1');
		}
	}

	function decorateGroup(group) {
		var field = null;
		var button = null;

		for (var i = 0; i < group.children.length; i++) {
			var child = group.children[i];

			if (child.matches('input[type="text"], input[type="password"], .cbi-input-text, .cbi-input-password, select')) {
				if (field)
					return;

				field = child;
			}
			else if (child.matches('button.btn, button.cbi-button, .btn.cbi-button, .cbi-button')) {
				if (button)
					return;

				button = child;
			}
		}

		if (!field || !button || field.nextElementSibling !== button)
			return;

		var action = resolveAction(field, button);

		if (!action)
			return;

		group.classList.add('m3e-field-action-group', 'm3e-field-action-group--' + action);
		button.classList.add('m3e-field-action', 'm3e-field-action--' + action);
		button.setAttribute('data-m3e-action', action);

		if (!button.getAttribute('aria-label'))
			button.setAttribute('aria-label', button.textContent.trim());

		if (!button.getAttribute('title') && button.textContent.trim())
			button.setAttribute('title', button.textContent.trim());

		bindPasswordState(field, button, action);

		if (action === 'password' && !button.getAttribute('data-m3e-bound')) {
			button.setAttribute('data-m3e-bound', '1');
			button.addEventListener('click', function () {
				window.requestAnimationFrame(function () {
					bindPasswordState(field, button, action);
				});
			});
		}
	}

	function decorateAll() {
		var groups = document.querySelectorAll('.control-group');

		for (var i = 0; i < groups.length; i++)
			decorateGroup(groups[i]);
	}

	function scheduleDecorate() {
		if (refreshQueued)
			return;

		refreshQueued = true;

		window.requestAnimationFrame(function () {
			refreshQueued = false;
			decorateAll();
		});
	}

	scheduleDecorate();

	if (window.MutationObserver && document.body) {
		new MutationObserver(function (mutations) {
			for (var i = 0; i < mutations.length; i++) {
				if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
					scheduleDecorate();
					break;
				}
			}
		}).observe(document.body, {
			childList: true,
			subtree: true
		});
	}
}());