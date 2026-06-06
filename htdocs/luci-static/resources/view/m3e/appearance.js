'use strict';
'require dom';
'require form';
'require fs';
'require request';
'require view';

var BACKGROUND_DIR = '/www/luci-static/m3e/backgrounds';
var BACKGROUND_RE = /^\/www\/luci-static\/m3e\/backgrounds\/[A-Za-z0-9._ -]+\.(avif|gif|jpe?g|png|webp)$/i;
var IMAGE_EXT_RE = /\.(avif|gif|jpe?g|png|webp)$/i;
var IMAGE_ACCEPT = 'image/avif,image/gif,image/jpeg,image/png,image/webp';
var HEX_RE = /^#[0-9a-f]{6}$/i;

function clamp(value, min, max) {
	value = Number(value);
	if (!Number.isFinite(value))
		value = min;

	return Math.min(max, Math.max(min, value));
}

function triggerFieldChange(node) {
	if (!node)
		return;

	node.dispatchEvent(new CustomEvent('widget-change', { bubbles: true }));
	node.dispatchEvent(new CustomEvent('change', { bubbles: true }));
}

function backgroundUrl(path) {
	path = String(path || '').trim().replace(/^\/www/, '');

	return /^\/luci-static\/m3e\/backgrounds\/[A-Za-z0-9._ -]+\.(avif|gif|jpe?g|png|webp)$/i.test(path) ? path : '';
}

function fileName(path) {
	return String(path || '').replace(/^.*\//, '');
}

function formatBytes(size) {
	size = Number(size) || 0;

	if (size >= 1000000)
		return '%.1f MB'.format(size / 1000000);

	if (size >= 1000)
		return '%.1f KB'.format(size / 1000);

	return '%d B'.format(size);
}

function uploadName(name) {
	var extMatch = String(name || '').match(/\.(avif|gif|jpe?g|png|webp)$/i);
	var ext = extMatch ? extMatch[0].toLowerCase() : '';
	var stem;

	if (!ext)
		return null;

	stem = String(name || 'background')
		.replace(/^.*[\\\/]/, '')
		.replace(/\.[^.]+$/, '')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.substring(0, 56);

	return (stem || 'background') + '-' + Date.now() + ext;
}

function makeImageReadable(path) {
	path = String(path || '').trim();

	if (!BACKGROUND_RE.test(path))
		return Promise.reject(new Error(_('Invalid background image path')));

	return fs.exec('/bin/chmod', [ '0644', path ]);
}

var BackgroundImageValue = form.Value.extend({
	renderWidget: function (section_id, option_index, cfgvalue) {
		var value = BACKGROUND_RE.test(cfgvalue || '') ? cfgvalue : '';
		var id = this.cbid(section_id);
		var hidden;
		var preview;
		var gallery;
		var status;
		var fileInput;
		var wrapper;
		var self = this;

		function setStatus(message, tone) {
			status.className = 'm3e-background-status' + (tone ? ' is-' + tone : '');
			status.textContent = message || '';
		}

		function setValue(path) {
			hidden.value = BACKGROUND_RE.test(path || '') ? path : '';
			renderPreview();
			triggerFieldChange(wrapper);
		}

		function renderPreview() {
			var url = backgroundUrl(hidden.value);

			preview.className = 'm3e-background-preview' + (url ? '' : ' is-empty');
			dom.content(preview, url ? [
				E('img', { 'src': url, 'alt': '' }),
				E('span', {}, fileName(hidden.value))
			] : _('No background selected'));
		}

		function renderGallery() {
			dom.content(gallery, E('em', { 'class': 'spinning' }, _('Loading images…')));

			return L.resolveDefault(fs.list(BACKGROUND_DIR), []).then(function (entries) {
				var images = entries.filter(function (entry) {
					return entry.type == 'file' && IMAGE_EXT_RE.test(entry.name || '');
				}).sort(function (a, b) {
					return (b.mtime || 0) - (a.mtime || 0) || L.naturalCompare(a.name, b.name);
				});
				var repairs = images.map(function (entry) {
					var path = BACKGROUND_DIR + '/' + entry.name;

					if ((entry.mode & 4) == 0)
						return makeImageReadable(path).catch(function () {});

					return Promise.resolve();
				});

				return Promise.all(repairs).then(function () {
					if (!images.length) {
						dom.content(gallery, E('em', {}, _('No uploaded backgrounds yet.')));
						return;
					}

					dom.content(gallery, images.map(function (entry) {
						var path = BACKGROUND_DIR + '/' + entry.name;
						var selected = hidden.value == path;

						return E('div', { 'class': 'm3e-background-tile' + (selected ? ' is-selected' : '') }, [
							E('button', {
								'class': 'm3e-background-thumb',
								'title': _('Use %s').format(entry.name),
								'click': function (ev) {
									ev.preventDefault();
									setValue(path);
									renderGallery();
									setStatus(_('Selected %s. Save to apply it.').format(entry.name), 'ok');
								}
							}, E('img', { 'src': backgroundUrl(path), 'alt': '' })),
							E('div', { 'class': 'm3e-background-meta' }, [
								E('strong', {}, entry.name),
								E('span', {}, formatBytes(entry.size))
							]),
							E('div', { 'class': 'm3e-background-tile-actions' }, [
								E('button', {
									'class': 'btn cbi-button-neutral',
									'click': function (ev) {
										ev.preventDefault();
										setValue(path);
										renderGallery();
										setStatus(_('Selected %s. Save to apply it.').format(entry.name), 'ok');
									}
								}, _('Use')),
								E('button', {
									'class': 'btn cbi-button-negative',
									'click': function (ev) {
										ev.preventDefault();

										if (!confirm(_('Delete background image "%s"?').format(entry.name)))
											return;

										fs.remove(path).then(function () {
											if (hidden.value == path)
												setValue('');

											setStatus(_('Deleted %s.').format(entry.name), 'ok');
											return renderGallery();
										}).catch(function (err) {
											setStatus(_('Delete failed: %s').format(err.message), 'error');
										});
									}
								}, _('Delete'))
							])
						]);
					}));
				});
			});
		}

		function uploadFile(file) {
			var name = uploadName(file ? file.name : '');
			var path;
			var data;

			if (!file || !name) {
				setStatus(_('Choose a PNG, JPEG, GIF, WebP, or AVIF image.'), 'error');
				return;
			}

			path = BACKGROUND_DIR + '/' + name;
			data = new FormData();
			data.append('sessionid', L.env.sessionid);
			data.append('filename', path);
			data.append('filedata', file);

			setStatus(_('Uploading %s…').format(file.name));

			return request.post(L.env.cgi_base + '/cgi-upload', data, {
				progress: function (ev) {
					if (ev.lengthComputable)
						setStatus(_('Uploading %s… %d%%').format(file.name, Math.round((ev.loaded / ev.total) * 100)));
				}
			}).then(function (res) {
				var reply = res.json();

				if (L.isObject(reply) && reply.failure)
					throw new Error(reply.message || _('Upload failed'));

				return makeImageReadable(path);
			}).then(function () {
				setValue(path);
				setStatus(_('Uploaded %s. Save to apply it.').format(name), 'ok');
				return renderGallery();
			}).catch(function (err) {
				setStatus(_('Upload failed: %s').format(err.message), 'error');
			});
		}

		hidden = E('input', {
			'id': 'widget.' + id,
			'type': 'hidden',
			'value': value
		});

		preview = E('div');
		status = E('div', { 'class': 'm3e-background-status' });
		gallery = E('div', { 'class': 'm3e-background-gallery' });
		fileInput = E('input', {
			'type': 'file',
			'accept': IMAGE_ACCEPT,
			'style': 'display:none',
			'change': function (ev) {
				uploadFile(ev.target.files[0]);
				ev.target.value = '';
			}
		});

		wrapper = E('div', { 'id': id, 'class': 'm3e-background-control' }, [
			hidden,
			preview,
			E('div', { 'class': 'm3e-background-actions' }, [
				E('button', {
					'class': 'btn cbi-button-action important',
					'click': function (ev) {
						ev.preventDefault();
						fileInput.click();
					}
				}, _('Upload image…')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function (ev) {
						ev.preventDefault();
						setValue('');
						setStatus(_('Background selection cleared. Save to apply it.'));
						renderGallery();
					}
				}, _('Clear selection')),
				E('button', {
					'class': 'btn',
					'click': function (ev) {
						ev.preventDefault();
						renderGallery();
					}
				}, _('Refresh')),
				fileInput
			]),
			status,
			gallery
		]);

		renderPreview();
		renderGallery();

		return wrapper;
	},

	formvalue: function (section_id) {
		var node = this.map.findElement('id', this.cbid(section_id));
		var input = node ? node.querySelector('input[type="hidden"]') : null;

		return input ? input.value.trim() : null;
	},

	isValid: function (section_id) {
		var value = this.formvalue(section_id);

		this.error = !value || BACKGROUND_RE.test(value) ? null : _('Upload an image file under %s').format(BACKGROUND_DIR);
		return this.error == null;
	},

	getValidationError: function () {
		return this.error || '';
	}
});

var ColorValue = form.Value.extend({
	renderWidget: function (section_id, option_index, cfgvalue) {
		var value = HEX_RE.test(cfgvalue || '') ? cfgvalue : (this.default || '#6750a4');
		var id = this.cbid(section_id);
		var colorInput;
		var textInput;
		var wrapper;

		colorInput = E('input', {
			'id': 'widget.' + id,
			'type': 'color',
			'class': 'm3e-color-swatch',
			'value': value
		});

		textInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text m3e-color-text',
			'value': value,
			'placeholder': '#6750a4'
		});

		wrapper = E('div', { 'id': id, 'class': 'm3e-color-control' }, [ colorInput, textInput ]);

		colorInput.addEventListener('input', function () {
			textInput.value = colorInput.value;
			triggerFieldChange(wrapper);
		});

		textInput.addEventListener('input', function () {
			if (HEX_RE.test(textInput.value))
				colorInput.value = textInput.value;

			triggerFieldChange(wrapper);
		});

		return wrapper;
	},

	formvalue: function (section_id) {
		var node = this.map.findElement('id', this.cbid(section_id));
		var input = node ? node.querySelector('.m3e-color-text') : null;

		return input ? input.value.trim().toLowerCase() : null;
	},

	isValid: function (section_id) {
		var value = this.formvalue(section_id);

		this.error = HEX_RE.test(value) ? null : _('Expecting a color in #rrggbb format');
		return this.error == null;
	},

	getValidationError: function () {
		return this.error || '';
	}
});

var RangeValue = form.Value.extend({
	renderWidget: function (section_id, option_index, cfgvalue) {
		var min = this.min || 0;
		var max = this.max || 100;
		var step = this.step || 1;
		var value = clamp(cfgvalue != null ? cfgvalue : this.default, min, max);
		var id = this.cbid(section_id);
		var rangeInput;
		var numberInput;
		var wrapper;

		rangeInput = E('input', {
			'id': 'widget.' + id,
			'type': 'range',
			'class': 'm3e-range-slider',
			'min': min,
			'max': max,
			'step': step,
			'value': value
		});

		numberInput = E('input', {
			'type': 'number',
			'class': 'cbi-input-text m3e-range-number',
			'min': min,
			'max': max,
			'step': step,
			'value': value
		});

		wrapper = E('div', { 'id': id, 'class': 'm3e-range-control' }, [
			rangeInput,
			numberInput,
			this.unit ? E('span', { 'class': 'm3e-range-unit' }, this.unit) : ''
		]);

		rangeInput.addEventListener('input', function () {
			numberInput.value = rangeInput.value;
			triggerFieldChange(wrapper);
		});

		numberInput.addEventListener('input', function () {
			rangeInput.value = clamp(numberInput.value, min, max);
			triggerFieldChange(wrapper);
		});

		return wrapper;
	},

	formvalue: function (section_id) {
		var node = this.map.findElement('id', this.cbid(section_id));
		var input = node ? node.querySelector('.m3e-range-number') : null;

		return input ? String(clamp(input.value, this.min || 0, this.max || 100)) : null;
	},

	isValid: function (section_id) {
		var value = Number(this.formvalue(section_id));
		var min = this.min || 0;
		var max = this.max || 100;

		this.error = Number.isFinite(value) && value >= min && value <= max ? null : _('Value must be between %d and %d').format(min, max);
		return this.error == null;
	},

	getValidationError: function () {
		return this.error || '';
	}
});

return view.extend({
	render: function () {
		var m;
		var s;
		var o;

		m = new form.Map('m3e', _('M3E Theme'));

		s = m.section(form.NamedSection, 'appearance', 'appearance', _('Appearance'));
		s.addremove = false;
		s.tab('background', _('Background'));
		s.tab('colors', _('Theme color'));
		s.tab('surface', _('Surface'));

		o = s.taboption('background', form.Flag, 'enabled', _('Use custom background'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('background', BackgroundImageValue, 'background_image', _('Background image'));
		o.rmempty = true;

		o = s.taboption('background', form.ListValue, 'background_fit', _('Image fit'));
		o.default = 'cover';
		o.rmempty = false;
		o.value('cover', _('Cover'));
		o.value('contain', _('Contain'));
		o.value('auto', _('Original size'));

		o = s.taboption('background', form.ListValue, 'background_position', _('Image position'));
		o.default = 'center';
		o.rmempty = false;
		o.value('center', _('Center'));
		o.value('top', _('Top'));
		o.value('bottom', _('Bottom'));
		o.value('left', _('Left'));
		o.value('right', _('Right'));

		o = s.taboption('background', RangeValue, 'background_overlay', _('Page tint'));
		o.default = '34';
		o.min = 0;
		o.max = 85;
		o.unit = '%';
		o.rmempty = false;

		o = s.taboption('background', RangeValue, 'background_blur', _('Background blur'));
		o.default = '0';
		o.min = 0;
		o.max = 24;
		o.unit = 'px';
		o.rmempty = false;

		o = s.taboption('colors', ColorValue, 'primary_color', _('Primary color'));
		o.default = '#6750a4';
		o.rmempty = false;

		o = s.taboption('colors', RangeValue, 'color_hue_shift', _('Hue fine tune'));
		o.default = '0';
		o.min = -180;
		o.max = 180;
		o.unit = 'deg';
		o.rmempty = false;

		o = s.taboption('colors', RangeValue, 'color_saturation', _('Saturation fine tune'));
		o.default = '0';
		o.min = -50;
		o.max = 50;
		o.unit = '%';
		o.rmempty = false;

		o = s.taboption('colors', RangeValue, 'color_lightness', _('Lightness fine tune'));
		o.default = '0';
		o.min = -30;
		o.max = 30;
		o.unit = '%';
		o.rmempty = false;

		o = s.taboption('surface', RangeValue, 'sidebar_blur', _('Sidebar blur'));
		o.default = '32';
		o.min = 8;
		o.max = 48;
		o.unit = 'px';
		o.rmempty = false;

		o = s.taboption('surface', RangeValue, 'sidebar_opacity', _('Sidebar opacity'));
		o.default = '70';
		o.min = 45;
		o.max = 95;
		o.unit = '%';
		o.rmempty = false;

		return m.render();
	}
});
