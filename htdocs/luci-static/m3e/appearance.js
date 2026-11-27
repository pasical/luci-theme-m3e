'use strict';

(() => {
	const root = document.documentElement;
	const modeKey = 'luci-m3e-color-mode';
	const systemMode = window.matchMedia('(prefers-color-scheme: dark)');
	const backgroundDir = '/www/luci-static/m3e/backgrounds/';
	const backgroundPattern = /^\/luci-static\/m3e\/backgrounds\/[A-Za-z0-9._ -]+\.(?:avif|gif|jpe?g|png|webp)$/i;
	const managedBackground = /^\/www\/luci-static\/m3e\/backgrounds\/m3e-wallpaper-[a-f0-9]{24}\.jpg$/;
	const palettePattern = /^(?:(?:red|yellow|blue|green|purple)-(?:tonal-spot|vibrant|expressive|neutral)|gray-(?:monochrome|medium|high))$/;
	const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
	const imagePrefix = 'data:image/jpeg;base64,';
	const maxFileBytes = 16 * 1024 * 1024;
	const maxStoredLength = 700000;

	function routerSettings(config) {
		const path = (config.background_image || '').replace(/^\/www(?=\/)/, '');
		return {
			palette: palettePattern.test(config.palette) ? config.palette : '',
			wallpaper: config.enabled !== '0' && backgroundPattern.test(path) ? encodeURI(path) : ''
		};
	}

	function readMode() {
		try {
			const saved = localStorage.getItem(modeKey);
			if (saved === 'light' || saved === 'dark')
				return saved;
		} catch (error) {}
		return 'system';
	}

	function applyMode(mode) {
		const dark = mode === 'system' ? systemMode.matches : mode === 'dark';
		root.dataset.darkmode = String(dark);
		root.style.colorScheme = dark ? 'dark' : 'light';
		document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(dark));
	}

	function saveMode(mode) {
		try {
			if (mode === 'system')
				localStorage.removeItem(modeKey);
			else
				localStorage.setItem(modeKey, mode);
		} catch (error) {}
	}

	function apply(settings) {
		if (settings.palette)
			root.dataset.m3ePalette = settings.palette;
		else
			delete root.dataset.m3ePalette;

		root.toggleAttribute('data-m3e-wallpaper', !!settings.wallpaper);
		if (settings.wallpaper)
			root.style.setProperty('--m3e-app-background-image', `url("${settings.wallpaper}")`);
		else
			root.style.removeProperty('--m3e-app-background-image');
	}

	async function prepareImage(file) {
		const url = URL.createObjectURL(file);
		try {
			const image = new Image();
			image.src = url;
			await image.decode();
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d', { alpha: false });
			const base = getComputedStyle(root).getPropertyValue('--m3e-shell-background').trim();

			for (const maxEdge of [1600, 1100]) {
				const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
				canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
				canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
				ctx.fillStyle = base;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
				for (const quality of [0.85, 0.7, 0.55, 0.4]) {
					const data = canvas.toDataURL('image/jpeg', quality);
					if (data.startsWith(imagePrefix) && data.length <= maxStoredLength)
						return data;
				}
			}
			throw new Error('Image is too large after resizing');
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	let saved = routerSettings(JSON.parse(root.dataset.m3eSettings || '{}'));
	let mode = readMode();
	apply(saved);
	applyMode(mode);

	document.addEventListener('DOMContentLoaded', () => {
		let draftMode;
		const dialog = document.getElementById('m3e-appearance');
		const trigger = document.getElementById('m3e-appearance-toggle');
		const toggle = document.getElementById('theme-toggle');
		applyMode(mode);
		systemMode.addEventListener('change', () => applyMode(dialog?.open ? draftMode : mode));
		toggle?.addEventListener('click', () => {
			mode = root.dataset.darkmode === 'true' ? 'light' : 'dark';
			saveMode(mode);
			applyMode(mode);
		});
		if (!dialog || typeof dialog.showModal !== 'function')
			return;

		const cancel = document.getElementById('m3e-appearance-cancel');
		const form = dialog.querySelector('form');
		const fieldsets = form.querySelectorAll('fieldset');
		const modes = form.querySelectorAll('[name="m3e-mode"]');
		const families = form.querySelectorAll('[name="m3e-family"]');
		const styles = form.querySelectorAll('[name="m3e-style"]');
		const styleGroup = document.getElementById('m3e-appearance-styles');
		const fileInput = document.getElementById('m3e-background-file');
		const resetColor = document.getElementById('m3e-reset-color');
		const resetBackground = document.getElementById('m3e-reset-background');
		const save = document.getElementById('m3e-appearance-save');
		const error = document.getElementById('m3e-appearance-error');
		let draft;
		let busy = false;
		let saving = false;
		let imageRequest = 0;

		function showError(message = '') {
			error.textContent = message;
			error.hidden = !message;
		}

		function setBusy(pending) {
			busy = pending;
			save.disabled = pending;
			resetBackground.disabled = !pending && !draft.wallpaper;
			fileInput.setAttribute('aria-busy', String(pending));
		}

		function preview() {
			for (const input of modes)
				input.checked = input.value === draftMode;
			applyMode(draftMode);
			const [family, style] = draft.palette.split(/-(.+)/);
			for (const input of families)
				input.checked = input.value === family;
			styleGroup.hidden = !family;
			for (const input of styles) {
				const option = input.closest('label');
				const id = `${family}-${input.value}`;
				option.hidden = !palettePattern.test(id);
				option.querySelector('.m3e-style-swatch').dataset.m3ePalette = id;
				input.checked = input.value === style;
			}
			resetColor.disabled = !draft.palette;
			resetBackground.disabled = !busy && !draft.wallpaper;
			apply(draft);
		}

		trigger.hidden = false;
		trigger.addEventListener('click', () => {
			draft = { ...saved };
			draftMode = mode;
			setBusy(false);
			showError();
			preview();
			dialog.showModal();
		});

		form.addEventListener('change', event => {
			const input = event.target;
			if (input.name === 'm3e-mode') {
				draftMode = input.value;
				applyMode(draftMode);
			} else if (input.name === 'm3e-family') {
				const style = draft.palette.slice(draft.palette.indexOf('-') + 1);
				const sameStyle = `${input.value}-${style}`;
				const defaultStyle = input.value === 'gray' ? 'monochrome' : 'tonal-spot';
				draft.palette = palettePattern.test(sameStyle) ? sameStyle : `${input.value}-${defaultStyle}`;
				preview();
			} else if (input.name === 'm3e-style') {
				draft.palette = `${draft.palette.split('-')[0]}-${input.value}`;
				preview();
			}
		});

		fileInput.addEventListener('change', async () => {
			const [file] = fileInput.files;
			fileInput.value = '';
			if (!file)
				return;

			const request = ++imageRequest;
			showError();
			if (!imageTypes.includes(file.type) || file.size > maxFileBytes) {
				setBusy(false);
				showError(dialog.dataset.imageError);
				return;
			}

			setBusy(true);
			try {
				const wallpaper = await prepareImage(file);
				if (request === imageRequest && dialog.open) {
					draft.wallpaper = wallpaper;
					preview();
				}
			} catch (error) {
				if (request === imageRequest && dialog.open)
					showError(dialog.dataset.readError);
			} finally {
				if (request === imageRequest && dialog.open)
					setBusy(false);
			}
		});

		resetColor.addEventListener('click', () => {
			draft.palette = '';
			preview();
			families[0].focus();
		});

		resetBackground.addEventListener('click', () => {
			imageRequest++;
			draft.wallpaper = '';
			setBusy(false);
			showError();
			preview();
			fileInput.focus();
		});

		async function saveRouterSettings() {
			const rpc = await L.require('rpc');
			const get = rpc.declare({
				object: 'uci', method: 'get', params: ['config', 'section'], expect: { values: {} }, reject: true
			});
			const set = rpc.declare({
				object: 'uci', method: 'set', params: ['config', 'section', 'values'], reject: true
			});
			const commit = rpc.declare({
				object: 'uci', method: 'commit', params: ['config'], reject: true
			});
			const write = rpc.declare({
				object: 'file', method: 'write', params: ['path', 'data', 'mode', 'base64'], reject: true
			});
			const remove = rpc.declare({
				object: 'file', method: 'remove', params: ['path'], reject: true
			});

			const current = await get('m3e', 'appearance');
			const changes = {};
			if (draft.palette !== saved.palette)
				changes.palette = draft.palette;
			if (draft.wallpaper !== saved.wallpaper) {
				changes.background_image = '';
				if (draft.wallpaper) {
					const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)),
						byte => byte.toString(16).padStart(2, '0')).join('');
					changes.background_image = `${backgroundDir}m3e-wallpaper-${nonce}.jpg`;
					changes.enabled = '1';
					await write(changes.background_image, draft.wallpaper.slice(imagePrefix.length), 0o644, true);
				}
			}

			if (Object.keys(changes).length) {
				await set('m3e', 'appearance', changes);
				await commit('m3e');
			}
			if (changes.background_image !== undefined && managedBackground.test(current.background_image))
				remove(current.background_image).catch(() => {});

			return routerSettings({ ...current, ...changes });
		}

		form.addEventListener('submit', async event => {
			event.preventDefault();
			if (busy || saving)
				return;
			saving = true;
			showError();
			for (const fieldset of fieldsets)
				fieldset.disabled = true;
			save.disabled = cancel.disabled = true;
			try {
				if (draft.palette !== saved.palette || draft.wallpaper !== saved.wallpaper)
					saved = await saveRouterSettings();
				mode = draftMode;
				saveMode(mode);
				dialog.close();
			} catch (error) {
				showError(dialog.dataset.saveError);
			} finally {
				saving = false;
				for (const fieldset of fieldsets)
					fieldset.disabled = false;
				save.disabled = cancel.disabled = false;
			}
		});

		cancel.addEventListener('click', () => dialog.close());
		dialog.addEventListener('cancel', event => {
			if (saving)
				event.preventDefault();
		});
		dialog.addEventListener('close', () => {
			imageRequest++;
			apply(saved);
			applyMode(mode);
		});
	});
})();
