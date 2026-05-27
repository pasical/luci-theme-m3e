'use strict';
'require ui';
'require view';

return view.extend({
	render: function () {
		var form = document.querySelector('form'),
			btn = document.querySelector('button');

		document.body.classList.add('m3e-login-page');

		var dlg = ui.showModal(
			_('Authorization Required'),
			[].slice.call(document.querySelectorAll('section > *')),
			'login'
		);

		form.classList.add('m3e-login-form');
		btn.classList.add('m3e-login-button');

		var heading = dlg.querySelector('h4'),
			oldFooter = document.querySelector('.m3e-login-footer');

		if (heading)
			heading.parentNode.removeChild(heading);

		if (oldFooter)
			oldFooter.parentNode.removeChild(oldFooter);

		var username = document.querySelector('input[name="luci_username"]'),
			password = document.querySelector('input[type="password"]'),
			routerName = (document.title || '').replace(/\s+-\s+LuCI.*$/, '') || window.location.hostname,
			intro = E('div', { 'class': 'm3e-login-intro' }, [
				E('p', { 'class': 'm3e-login-eyebrow' }, _('Router access')),
				E('h1', { 'class': 'm3e-login-title' }, routerName),
				E('p', { 'class': 'm3e-login-subtitle' }, _('Sign in with the router administrator account')),
				E('p', { 'class': 'm3e-login-meta' }, _('LuCI') + ' / ' + _('OpenWrt'))
			]),
			panel = E('div', { 'class': 'm3e-login-panel' });

		username.setAttribute('aria-label', _('Username'));
		username.setAttribute('autocomplete', 'username');
		password.setAttribute('aria-label', _('Password'));
		password.setAttribute('autocomplete', 'current-password');

		while (dlg.firstChild)
			panel.appendChild(dlg.firstChild);

		dlg.appendChild(intro);
		dlg.appendChild(panel);

		form.addEventListener('keypress', function (ev) {
			if (ev.key == 'Enter')
				btn.click();
		});

		btn.addEventListener('click', function () {
			var footer = document.querySelector('.m3e-login-footer');

			if (footer)
				footer.style.display = 'none';

			dlg.querySelectorAll('*').forEach(function (node) { node.style.display = 'none' });
			dlg.appendChild(E('div', { 'class': 'spinning' }, _('Logging in…')));

			form.submit()
		});

		password.focus();

		return '';
	},

	addFooter: function () { }
});
