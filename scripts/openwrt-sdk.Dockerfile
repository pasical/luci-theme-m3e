FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        bison \
        build-essential \
        ca-certificates \
        curl \
        file \
        flex \
        gawk \
        gettext \
        git \
        libncurses-dev \
        libssl-dev \
        make \
        patch \
        perl \
        python3 \
        python3-setuptools \
        rsync \
        tar \
        unzip \
        wget \
        xz-utils \
        zlib1g-dev \
        zstd \
    && rm -rf /var/lib/apt/lists/*