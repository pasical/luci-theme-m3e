'use strict';

(function () {
	var DEFAULTS = {
		enabled: '1',
		background_image: '',
		background_fit: 'cover',
		background_position: 'center',
		background_overlay: '34',
		background_blur: '0',
		sidebar_blur: '32',
		sidebar_opacity: '70',
		primary_color: '#6750a4',
		color_hue_shift: '0',
		color_saturation: '0',
		color_lightness: '0'
	};

	var cfg = Object.assign({}, DEFAULTS, window.M3E_APPEARANCE || {});
	var root = document.documentElement;

	function clamp(value, min, max) {
		value = Number(value);
		if (!Number.isFinite(value))
			value = min;

		return Math.min(max, Math.max(min, value));
	}

	function parseHex(value) {
		var match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);

		if (!match)
			return null;

		var raw = parseInt(match[1], 16);

		return {
			r: (raw >> 16) & 255,
			g: (raw >> 8) & 255,
			b: raw & 255
		};
	}

	function componentToHex(value) {
		var hex = Math.round(clamp(value, 0, 255)).toString(16);
		return hex.length == 1 ? '0' + hex : hex;
	}

	function rgbToHsl(rgb) {
		var r = rgb.r / 255;
		var g = rgb.g / 255;
		var b = rgb.b / 255;
		var max = Math.max(r, g, b);
		var min = Math.min(r, g, b);
		var h = 0;
		var s = 0;
		var l = (max + min) / 2;

		if (max != min) {
			var d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
				break;
			}

			h /= 6;
		}

		return { h: h * 360, s: s * 100, l: l * 100 };
	}

	function hueToRgb(p, q, t) {
		if (t < 0)
			t += 1;
		if (t > 1)
			t -= 1;
		if (t < 1 / 6)
			return p + (q - p) * 6 * t;
		if (t < 1 / 2)
			return q;
		if (t < 2 / 3)
			return p + (q - p) * (2 / 3 - t) * 6;

		return p;
	}

	function hslToHex(hsl) {
		var h = (((hsl.h % 360) + 360) % 360) / 360;
		var s = clamp(hsl.s, 0, 100) / 100;
		var l = clamp(hsl.l, 0, 100) / 100;
		var r;
		var g;
		var b;

		if (s === 0) {
			r = g = b = l;
		}
		else {
			var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			var p = 2 * l - q;

			r = hueToRgb(p, q, h + 1 / 3);
			g = hueToRgb(p, q, h);
			b = hueToRgb(p, q, h - 1 / 3);
		}

		return '#' + componentToHex(r * 255) + componentToHex(g * 255) + componentToHex(b * 255);
	}

	function normalizeBackgroundPath(path) {
		path = String(path || '').trim();

		if (path === '')
			return '';

		path = path.replace(/^\/www/, '');

		if (!/^\/luci-static\/m3e\/backgrounds\/[A-Za-z0-9._ -]+\.(avif|gif|jpe?g|png|webp)$/i.test(path))
			return '';

		return path.replace(/'/g, '%27').replace(/\)/g, '%29');
	}

	function applyColor() {
		var rgb = parseHex(cfg.primary_color) || parseHex(DEFAULTS.primary_color);
		var hsl = rgbToHsl(rgb);
		var primary;

		hsl.h += clamp(cfg.color_hue_shift, -180, 180);
		hsl.s += clamp(cfg.color_saturation, -50, 50);
		hsl.l += clamp(cfg.color_lightness, -30, 30);
		primary = hslToHex(hsl);

		root.style.setProperty('--m3e-user-primary', primary);
		root.style.setProperty('--md-sys-color-primary', primary);
		root.style.setProperty('--primary-color-high', primary);
		root.style.setProperty('--primary-color-medium', 'color-mix(in srgb, ' + primary + ' 88%, var(--md-sys-color-on-surface))');
		root.style.setProperty('--primary-color-low', 'color-mix(in srgb, ' + primary + ' 72%, var(--md-sys-color-on-surface))');
		root.style.setProperty('--md-sys-color-primary-container', 'color-mix(in srgb, ' + primary + ' 18%, var(--md-sys-color-surface-container-low))');
		root.style.setProperty('--md-sys-color-primary-container-hover', 'color-mix(in srgb, ' + primary + ' 24%, var(--md-sys-color-surface-container))');
		root.style.setProperty('--md-sys-color-secondary-container', 'color-mix(in srgb, ' + primary + ' 16%, var(--md-sys-color-surface-container))');
	}

	function applyBackground() {
		var imagePath = normalizeBackgroundPath(cfg.background_image);
		var fit = /^(cover|contain|auto)$/.test(cfg.background_fit) ? cfg.background_fit : DEFAULTS.background_fit;
		var position = /^(center|top|bottom|left|right)$/.test(cfg.background_position) ? cfg.background_position : DEFAULTS.background_position;
		var overlay = clamp(cfg.background_overlay, 0, 85);
		var backgroundBlur = clamp(cfg.background_blur, 0, 24);
		var sidebarBlur = clamp(cfg.sidebar_blur, 8, 48);
		var sidebarOpacity = clamp(cfg.sidebar_opacity, 45, 95);

		root.style.setProperty('--m3e-bg-overlay', overlay + '%');
		root.style.setProperty('--m3e-bg-blur', backgroundBlur + 'px');
		root.style.setProperty('--m3e-bg-size', fit);
		root.style.setProperty('--m3e-bg-position', position);
		root.style.setProperty('--m3e-glass-blur', sidebarBlur + 'px');
		root.style.setProperty('--m3e-glass-opacity', sidebarOpacity + '%');
		root.style.setProperty('--m3e-sidebar-blur', sidebarBlur + 'px');
		root.style.setProperty('--m3e-sidebar-opacity', sidebarOpacity + '%');

		if (cfg.enabled === '1' && imagePath) {
			root.style.setProperty('--m3e-bg-image', "url('" + imagePath + "')");
			root.setAttribute('data-m3e-background', 'true');
		}
		else {
			root.style.removeProperty('--m3e-bg-image');
			root.removeAttribute('data-m3e-background');
		}
	}

	applyColor();
	applyBackground();
}());
