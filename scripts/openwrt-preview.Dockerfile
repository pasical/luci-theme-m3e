FROM openwrt/rootfs:x86-64

RUN mkdir -p /var/lock /var/run \
    && apk update \
    && apk add luci uhttpd uhttpd-mod-ubus rsync openssh-sftp-server \
    && rm -rf /var/cache/apk/*

EXPOSE 80

ENTRYPOINT ["/sbin/init"]