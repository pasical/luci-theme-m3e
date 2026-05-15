# LuCI 主题本地开发与编译指南

本文档面向当前仓库的 `luci-theme-m3e`，同时也适用于大多数 OpenWrt LuCI 主题。内容参考了 OpenWrt LuCI wiki 的 `HowTo: Create Themes`，并结合本仓库已经搭好的 Docker + OpenWrt SDK 本地编译流程。

## 1. LuCI 主题包结构

LuCI 主题本质上是一个 OpenWrt 软件包。一个可被 OpenWrt SDK 或 buildroot 编译的主题包通常包含以下内容：

```text
luci-theme-xxx/
  Makefile
  htdocs/
    luci-static/
      xxx/
        cascade.css
        mobile.css
        logo.svg
  luasrc/
    view/
      themes/
        xxx/
          header.htm
          footer.htm
  ucode/
    template/
      themes/
        xxx/
          header.ut
          footer.ut
          sysauth.ut
  root/
    etc/
      uci-defaults/
        30_luci-theme-xxx
```

不同 LuCI 版本使用的模板路径可能不同：

- 旧版 Lua 模板使用 `luasrc/view/themes/<theme>/header.htm` 和 `footer.htm`。
- 新版 ucode 模板使用 `ucode/template/themes/<theme>/header.ut` 和 `footer.ut`。
- 静态资源统一放在 `htdocs/luci-static/<theme>/`，模板里通过 `media` 变量引用，例如 `{{ media }}/cascade.css` 或旧模板里的 `<%=media%>/cascade.css`。

当前 `luci-theme-m3e` 采用 ucode 模板，主要目录是：

- `ucode/template/themes/m3e/`：默认 M3E 主题模板。
- `ucode/template/themes/m3e-blue/`、`m3e-green/`、`m3e-red/`：不同配色变体模板。
- `htdocs/luci-static/m3e/`：默认主题的 CSS、移动端 CSS 和图标。
- `htdocs/luci-static/m3e-blue/`、`m3e-green/`、`m3e-red/`：配色变体静态资源。
- `root/etc/uci-defaults/30_luci-theme-m3e`：安装后向 `/etc/config/luci` 注册主题并设置默认主题。
- `Makefile`：把主题声明为 OpenWrt/LuCI 包。

## 2. Makefile 要点

主题包需要包含 OpenWrt 的 `rules.mk` 和 LuCI 的 `luci.mk`：

```makefile
include $(TOPDIR)/rules.mk

LUCI_TITLE:=A Material 3 Expressive theme
LUCI_DEPENDS:=
PKG_VERSION:=0.1.3
PKG_RELEASE:=4

include $(TOPDIR)/feeds/luci/luci.mk
```

常用字段说明：

- `LUCI_TITLE`：在 `menuconfig` 或包信息里展示的标题。
- `LUCI_DEPENDS`：主题依赖的其他包。纯主题一般可以留空。
- `PKG_NAME`：OpenWrt 软件包名。当前仓库显式设置为 `luci-theme-m3e`，这样即使在 Docker 中挂载为 `/work`，产物也不会被错误命名为 `work`。
- `PKG_VERSION` / `PKG_RELEASE`：生成安装包时使用的版本号。
- `PKG_LICENSE`：许可证声明。
- `Package/<pkg>/postrm`：卸载时清理 UCI 主题配置。

如果是从零创建主题，wiki 中的最小 Makefile 是：

```makefile
include $(TOPDIR)/rules.mk

LUCI_TITLE:=Title of mytheme

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
```

在独立 SDK 的 `package/` 目录中开发时，推荐使用当前仓库这种写法：`include $(TOPDIR)/feeds/luci/luci.mk`。

## 3. 注册为可选主题

LuCI 通过 UCI 的 `luci.themes.<Name>` 发现可选主题。当前仓库的注册文件是 `root/etc/uci-defaults/30_luci-theme-m3e`：

```sh
uci set luci.themes.M3E=/luci-static/m3e
uci set luci.themes.M3EBlue=/luci-static/m3e-blue
uci set luci.themes.M3EGreen=/luci-static/m3e-green
uci set luci.themes.M3ERed=/luci-static/m3e-red
uci set luci.main.mediaurlbase=/luci-static/m3e
uci commit luci
```

安装包首次安装时会执行该脚本，所以安装后可以在 LuCI 的系统设置中选择主题。也可以在路由器上手动切换：

```sh
uci set luci.main.mediaurlbase=/luci-static/m3e
uci commit luci
/etc/init.d/uhttpd restart
```

## 4. 本地编译环境

macOS 无法直接运行 OpenWrt 官方 SDK 里面面向 Linux 的 host 工具链，因此本仓库使用 Docker 提供 Linux 编译环境。你只需要安装并启动 Docker Desktop 或 OrbStack。

已添加的本地构建文件：

- `scripts/openwrt-sdk.Dockerfile`：基于 Debian bookworm，安装 OpenWrt SDK 需要的 `build-essential`、`python3`、`rsync`、`zstd` 等工具。
- `scripts/local-build.sh`：自动下载 OpenWrt SDK、解压缓存、软链当前主题包、更新 feeds 并编译主题安装包。

首次构建默认目标 OpenWrt 24.10 x86/64：

```sh
cd /Volumes/Data/Docker/luci-theme/luci-theme-material3
bash scripts/local-build.sh 24.10
```

脚本会执行以下步骤：

1. 在 macOS 上自动构建并运行 Docker 编译镜像。
2. 下载 `https://downloads.openwrt.org/releases/24.10.0/targets/x86/64/` 下的 OpenWrt SDK。
3. 将 SDK 缓存在 `.sdk-cache/`。
4. 在 SDK 的 `package/luci-theme-m3e/` 下链接当前主题的 `Makefile`、`htdocs`、`root`、`ucode` 等包源码条目。
5. 默认执行 `./scripts/feeds update base luci`、`./scripts/feeds install lua luci-base csstidy`、`make defconfig`。
6. 执行 `make package/luci-theme-m3e/compile V=s`。
7. 在 SDK 的 `bin/packages/` 下输出 `.ipk` 或 `.apk` 安装包路径。

常用参数：

```sh
# 编译 OpenWrt 24.10，默认 x86/64
bash scripts/local-build.sh 24.10

# 编译 snapshot
bash scripts/local-build.sh snapshot

# 指定目标平台，例如 ramips/mt7621
TARGET_PATH=ramips/mt7621 bash scripts/local-build.sh 24.10

# 使用已有 SDK
SDK_DIR=/absolute/path/to/openwrt-sdk bash scripts/local-build.sh 24.10

# 指定并行数
JOBS=4 bash scripts/local-build.sh 24.10

# 全量更新 SDK 的所有 feeds
FEEDS=all bash scripts/local-build.sh 24.10
```

Apple Silicon 上默认会使用 `linux/amd64` Docker 平台来匹配官方 `Linux-x86_64` SDK。下载如果中断，脚本会使用断点续传；如果解压留下了不完整目录，脚本会自动清理后重新解压。

## 5. 快速真实预览

静态 preview 容易和真实 LuCI 分叉，因此本仓库推荐使用真实 OpenWrt/LuCI 环境做预览，但不走编译安装包流程。核心做法是把本地源码直接同步到真实 LuCI 环境，再刷新浏览器。

### 5.1 本机 Docker OpenWrt 预览

如果只是做主题开发，最快的方式是启动本仓库提供的 Docker OpenWrt/LuCI 预览环境：

```sh
scripts/preview-openwrt.sh start
```

启动后直接打开：

```text
http://127.0.0.1:8080/
```

登录用户是 `root`，密码留空即可。容器端口默认只绑定到 `127.0.0.1`。

该容器基于 `openwrt/rootfs:x86-64`，预装 `luci`、`uhttpd`、`uhttpd-mod-ubus` 和 `rsync`，启动时注册 M3E 主题并把本地主题文件同步进去。它不模拟 LuCI 页面，而是运行真实 LuCI。

常用命令：

```sh
# 启动并同步 assets + templates
scripts/preview-openwrt.sh start

# 改 CSS/JS/图片后快速同步
scripts/preview-openwrt.sh sync assets

# 改 header.ut/footer.ut/sysauth.ut 后同步并重启 uhttpd
scripts/preview-openwrt.sh sync templates

# 停止预览容器
scripts/preview-openwrt.sh stop

# 查看容器日志或进入 shell
scripts/preview-openwrt.sh logs
scripts/preview-openwrt.sh shell
```

想要保存后自动同步，可以安装 `fswatch` 后运行：

```sh
brew install fswatch
scripts/preview-openwrt.sh watch templates
```

可用环境变量：

```sh
OPENWRT_PREVIEW_PORT=8080 \
OPENWRT_THEME=m3e \
scripts/preview-openwrt.sh start
```

### 5.2 外部测试机或 OpenWrt VM 快速同步

如果你已经有真实路由器、旁路测试机或独立 OpenWrt VM，也可以用 SSH/rsync 同步源码。

目标 OpenWrt 需要安装 `rsync`，首次准备测试机时执行一次：

```sh
opkg update
opkg install rsync
```

首次同步到默认测试机 `root@192.168.1.1`：

```sh
OPENWRT_HOST=root@192.168.1.1 scripts/dev-sync.sh all
```

如果只是改 CSS、JS、图片，使用最快的 assets 模式。它只同步 `htdocs/`，不清 LuCI 缓存，不重启 `uhttpd`：

```sh
scripts/dev-sync.sh assets
```

如果改了 `header.ut`、`footer.ut` 或登录页模板，使用 templates 模式。它同步 `htdocs/` 和 `ucode/`，清理 LuCI 缓存并重启 `uhttpd`：

```sh
scripts/dev-sync.sh templates
```

可用环境变量：

```sh
OPENWRT_HOST=root@192.168.1.1 \
OPENWRT_PORT=22 \
OPENWRT_THEME=m3e \
scripts/dev-sync.sh all
```

同步只覆盖 M3E 主题自己的路径，不会删除 LuCI 自带资源：

```text
htdocs/luci-static/m3e*/                  -> /www/luci-static/m3e*/
htdocs/luci-static/resources/menu-m3e.js  -> /www/luci-static/resources/menu-m3e.js
htdocs/luci-static/resources/view/m3e/    -> /www/luci-static/resources/view/m3e/
ucode/template/themes/m3e*/               -> /usr/share/ucode/luci/template/themes/m3e*/
root/                                     -> /
```

需要先看会同步哪些文件时，可以使用 dry run：

```sh
DRY_RUN=1 scripts/dev-sync.sh templates
```

想要保存后自动同步，可以安装 `fswatch` 后运行：

```sh
brew install fswatch
scripts/dev-watch.sh templates
```

常用模式：

```sh
# CSS/JS/图片：最快，通常刷新浏览器即可
scripts/dev-watch.sh assets

# CSS + ucode 模板：适合大多数主题开发
scripts/dev-watch.sh templates

# 包含 root overlay 和主题注册：适合首次部署或注册脚本调整
scripts/dev-watch.sh all
```

## 6. 发布前编译验证

日常修改主要集中在以下文件：

- 页面骨架：`ucode/template/themes/m3e/header.ut`、`footer.ut`、`sysauth.ut`。
- 样式：`htdocs/luci-static/m3e/cascade.css` 和 `mobile.css`。
- 主题变体：同步修改 `m3e-blue`、`m3e-green`、`m3e-red` 下对应文件。
- 菜单脚本：`htdocs/luci-static/resources/menu-m3e.js`。

快速预览确认后，再用 SDK 编译安装包做发布前验证：

```sh
# 1. 本地编译安装包
bash scripts/local-build.sh 24.10

# 2. 将产物传到路由器
scp .sdk-cache/openwrt-sdk-*/bin/packages/*/*/luci-theme-m3e_*.ipk root@192.168.1.1:/tmp/

# 3. 在路由器上安装并重启 Web 服务
ssh root@192.168.1.1
opkg install /tmp/luci-theme-*.ipk
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/uhttpd restart
```

OpenWrt 24.10 仍常见 `.ipk`，snapshot 或未来版本可能输出 `.apk`。脚本最后会列出实际产物路径，以该路径为准。

## 7. 常见问题

**找不到 SDK**

检查 `TARGET_PATH` 是否存在于 OpenWrt 下载站，例如 `x86/64`、`ramips/mt7621`、`mediatek/filogic`。

**SDK 下载中断**

重新执行同一条 `bash scripts/local-build.sh 24.10` 即可，脚本会从已有 `.tar.zst` 的字节位置继续下载。

**提示 Invalid SDK directory**

通常是旧脚本或手动中断留下了半截解压目录。当前脚本会自动清理；如果仍然发生，可以删除 `.sdk-cache/openwrt-sdk-*` 后重试。

**路由器安装后看不到主题**

确认 `root/etc/uci-defaults/30_luci-theme-m3e` 已被打包并执行。也可以在路由器上手动运行：

```sh
/etc/uci-defaults/30_luci-theme-m3e
uci show luci | grep themes
```

**样式修改没有生效**

浏览器可能缓存了静态资源。可以强制刷新浏览器，或在路由器上清理 LuCI 缓存：

```sh
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache
/etc/init.d/uhttpd restart
```

**快速同步连不上测试机**

确认可以直接 SSH 登录：

```sh
ssh root@192.168.1.1
```

如果端口或地址不同，使用：

```sh
OPENWRT_HOST=root@192.168.31.1 OPENWRT_PORT=2222 scripts/dev-sync.sh all
```

## 8. 从零创建新主题的最小步骤

1. 新建包目录，例如 `package/luci-theme-mytheme`。
2. 写入 `Makefile` 并引入 `rules.mk`、`luci.mk`。
3. 新建模板：`ucode/template/themes/mytheme/header.ut` 和 `footer.ut`，旧 LuCI 则用 `luasrc/view/themes/mytheme/header.htm` 和 `footer.htm`。
4. 新建静态资源目录：`htdocs/luci-static/mytheme/`。
5. 在模板中通过 `media` 引用 CSS、JS、图片。
6. 新建 `root/etc/uci-defaults/30_luci-theme-mytheme` 注册 `luci.themes.MyTheme=/luci-static/mytheme`。
7. 用 OpenWrt SDK 或本仓库的 Docker SDK 流程编译安装包。