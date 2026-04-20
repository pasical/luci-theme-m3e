#
# Copyright (C) 2008-2014 The LuCI Team <luci@lists.subsignal.org>
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=A Material 3 Expressive theme
LUCI_DEPENDS:=
PKG_VERSION:=0.1.2
PKG_RELEASE:=11

PKG_LICENSE:=Apache-2.0

define Package/luci-theme-m3e/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.M3E
	uci -q delete luci.themes.M3EBlue
	uci -q delete luci.themes.M3EGreen
	uci -q delete luci.themes.M3ERed
	uci -q delete luci.themes.M3E-Blue
	uci -q delete luci.themes.M3E-Green
	uci -q delete luci.themes.M3E-Red
	uci set luci.main.mediaurlbase='/luci-static/bootstrap'
	uci commit luci
}
endef
LUCI_MINIFY_CSS:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature