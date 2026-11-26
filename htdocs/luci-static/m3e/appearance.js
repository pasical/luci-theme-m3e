'use strict';

(() => {
	const root = document.documentElement;
	const storageKey = 'luci-m3e-appearance';
	const palettePattern = /^(?:(?:red|yellow|blue|green|purple)-(?:tonal-spot|vibrant|expressive|neutral)|gray-(?:monochrome|medium|high))$/;
	const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
	const imagePrefix = 'data:image/jpeg;base64,';
	const maxFileBytes = 16 * 1024 * 1024;
	const maxStoredLength = 700000;

	function readSettings() {
		try {
			const settings = JSON.parse(localStorage.getItem(storageKey));
			const palette = settings?.palette;
			const wallpaper = settings?.wallpaper;
			return {
				palette: typeof palette === 'string' && palettePattern.test(palette) ? palette : '',
				wallpaper: typeof wallpaper === 'string' && wallpaper.length <= maxStoredLength &&
					wallpaper.startsWith(imagePrefix) && /^[A-Za-z0-9+/]+={0,2}$/.test(wallpaper.slice(imagePrefix.length))
					? wallpaper : ''
			};
		} catch (error) {
			return { palette: '', wallpaper: '' };
		}
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

	apply(readSettings());

	document.addEventListener('DOMContentLoaded', () => {
		const dialog = document.getElementById('m3e-appearance');
		const trigger = document.getElementById('m3e-appearance-toggle');
		if (!dialog || typeof dialog.showModal !== 'function')
			return;

		const form = dialog.querySelector('form');
		const families = form.querySelectorAll('[name="m3e-family"]');
		const styles = form.querySelectorAll('[name="m3e-style"]');
		const styleGroup = document.getElementById('m3e-appearance-styles');
		const fileInput = document.getElementById('m3e-background-file');
		const resetColor = document.getElementById('m3e-reset-color');
		const resetBackground = document.getElementById('m3e-reset-background');
		const save = document.getElementById('m3e-appearance-save');
		const error = document.getElementById('m3e-appearance-error');
		let initial;
		let draft;
		let busy = false;
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
			initial = readSettings();
			draft = { ...initial };
			setBusy(false);
			showError();
			preview();
			dialog.showModal();
		});

		form.addEventListener('change', event => {
			const input = event.target;
			if (input.name === 'm3e-family') {
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

		form.addEventListener('submit', event => {
			event.preventDefault();
			if (busy)
				return;
			const latest = readSettings();
			const next = {
				palette: draft.palette === initial.palette ? latest.palette : draft.palette,
				wallpaper: draft.wallpaper === initial.wallpaper ? latest.wallpaper : draft.wallpaper
			};
			try {
				if (next.palette || next.wallpaper)
					localStorage.setItem(storageKey, JSON.stringify(next));
				else
					localStorage.removeItem(storageKey);
			} catch (error) {
				showError(dialog.dataset.saveError);
				return;
			}
			dialog.close();
		});

		document.getElementById('m3e-appearance-cancel').addEventListener('click', () => dialog.close());
		dialog.addEventListener('close', () => {
			imageRequest++;
			apply(readSettings());
		});
		window.addEventListener('storage', event => {
			if ((event.key === storageKey || event.key === null) && !dialog.open)
				apply(readSettings());
		});
	});
})();
