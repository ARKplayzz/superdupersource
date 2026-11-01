# superdupersource.kennedys.nz: the download page and release notes.
# Built by CapRover from the repo root (see captain-definition).

FROM node:22-slim AS build
WORKDIR /src
# The desktop workspace depends on Electron; the page doesn't need its binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --no-fund
COPY Supersources-templates ./Supersources-templates
RUN npm run build -w @sds/site

FROM nginx:1.27-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/site/dist /usr/share/nginx/html
EXPOSE 80
