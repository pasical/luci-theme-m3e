# luci-theme-m3e

luci-theme-m3e is a LuCI theme project for OpenWrt.

## Appearance

Open **Appearance** from the palette icon in the LuCI header. Red, yellow, blue, green and purple each offer Tonal Spot, Vibrant, Expressive and Neutral. Grayscale offers three Material Monochrome contrast levels. Each preset supplies colors for the light and dark workspace, including the default backdrop.

Choose a JPEG, PNG or WebP image up to 16 MB to preview a custom background. **Clear background** restores the preset backdrop. Saving stores the palette and background on the router, including for the LuCI sign-in screen. Light and dark mode follows the device setting by default, with a per-browser override in Appearance.

## Local development

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for the LuCI theme structure, Docker-based OpenWrt SDK setup, local build commands, and router install workflow.

The color presets ship as static CSS. To regenerate them, extract `@material/material-color-utilities@0.4.0` and run `node scripts/generate-palettes.mjs /path/to/package/index.js`.

## Credits

- LuCI component styles and additional icons from [KawaiiHachimi/luci-theme-material3](https://github.com/KawaiiHachimi/luci-theme-material3/tree/38397ed978b0f9ed2d82b73d52c9a7c6bbd023ad)
- OpenWrt LuCI: https://github.com/openwrt/luci
- Material Design 3: https://m3.material.io/
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) and [Material Symbols](https://github.com/google/material-design-icons)
