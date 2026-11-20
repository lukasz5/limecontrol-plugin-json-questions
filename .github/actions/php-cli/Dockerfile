# SPDX-License-Identifier: GPL-2.0-or-later
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libc-client2007e-dev libfreetype6-dev libicu-dev libjpeg-dev libkrb5-dev \
       libldap2-dev libpng-dev libpq-dev libssl-dev libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-configure ldap --with-libdir="lib/$(dpkg-architecture -qDEB_HOST_MULTIARCH)" \
    && docker-php-ext-configure imap --with-kerberos --with-imap-ssl \
    && docker-php-ext-install -j"$(nproc)" gd imap intl ldap pdo_mysql pdo_pgsql zip \
    && rm -rf /var/lib/apt/lists/*
